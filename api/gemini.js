// Lista fixa usada só se, por algum motivo, não conseguirmos consultar
// quais modelos existem no momento (ex: a própria consulta falhar).
const MODELOS_RESERVA = ['gemini-flash-latest', 'gemini-3.5-flash-lite']

// Consulta a própria API do Gemini pra descobrir quais modelos existem HOJE
// e devolve os mais adequados (Flash, capazes de ler imagem), do mais novo
// pro mais antigo. Assim, quando o Google lançar um modelo novo, o site
// passa a usá-lo sozinho, sem precisar editar o código.
async function getModelosDisponiveis() {
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`)
    const data = await resp.json()
    const ids = (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace('models/', ''))
      .filter(id => /^gemini-\d/.test(id) && id.includes('flash') && !/image|audio|native|tts|robotics|embed/.test(id))

    if (ids.length === 0) return MODELOS_RESERVA

    const versao = (id) => { const m = id.match(/gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0 }
    const estavel = (id) => !/preview|exp/i.test(id)

    // Prioridade: Flash "completo" estável > Flash-Lite estável > previews/experimentais — sempre do mais novo pro mais antigo
    const principais = ids.filter(id => !id.includes('lite') && estavel(id)).sort((a, b) => versao(b) - versao(a))
    const leves = ids.filter(id => id.includes('lite') && estavel(id)).sort((a, b) => versao(b) - versao(a))
    const previews = ids.filter(id => !estavel(id)).sort((a, b) => versao(b) - versao(a))

    const ordenados = [...principais, ...leves, ...previews]
    return ordenados.length > 0 ? ordenados.slice(0, 5) : MODELOS_RESERVA
  } catch {
    return MODELOS_RESERVA
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { base64, mediaType } = req.body

    const body = JSON.stringify({
      contents: [{ parts: [
        { inline_data: { mime_type: mediaType, data: base64 } },
        { text: `Você é um extrator de dados de comprovantes de PIX brasileiros.

Num comprovante de PIX:
- O BENEFICIÁRIO (quem RECEBEU) aparece no TOPO com nome, banco, agência, conta
- A CONTA DE ORIGEM (quem FEZ o PIX) aparece após "Conta de origem"  
- O campo DESCRIÇÃO ou MENSAGEM contém o item comprado (ex: "Cimento", "MO", "Mão de Obra")

Retorne SOMENTE este JSON válido, sem markdown:
{
  "responsavel": string (nome da CONTA DE ORIGEM que fez o PIX),
  "fornecedor": string (nome do BENEFICIÁRIO que recebeu),
  "valor": number (valor em reais),
  "data": "YYYY-MM-DD",
  "item": string ou null (texto EXATO do campo Descrição/Mensagem - é o item comprado. Se for "MO" escreva "Mão de Obra")
}
Campos não encontrados use null. Retorne APENAS o JSON.` }
      ]}],
      generationConfig: { temperature: 0 }
    })

    // Descobre os modelos disponíveis agora (em vez de uma lista fixa no código).
    // Se um falhar por QUALQUER motivo (sobrecarga, nome inválido, etc.), tenta o próximo.
    const MODELOS = await getModelosDisponiveis()

    let data, ultimoErro = null, ultimoErroSobrecarga = false
    for (const modelo of MODELOS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${process.env.GEMINI_API_KEY}`
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body
        })
        data = await response.json()

        if (!data.error) break // deu certo — para por aqui

        ultimoErro = data.error
        ultimoErroSobrecarga = response.status === 503 ||
          (data.error.message || '').toLowerCase().includes('high demand') ||
          (data.error.message || '').toLowerCase().includes('overloaded')
        // não deu certo (modelo sobrecarregado, não encontrado, etc.) → tenta o próximo modelo da lista
      } catch (e) {
        ultimoErro = { message: e.message }
      }
    }

    if (data?.error) {
      const msg = ultimoErroSobrecarga
        ? 'Os servidores do Gemini estão sobrecarregados no momento (isso é algo do lado do Google, acontece bastante logo após lançamento de modelo novo). Tente novamente em alguns minutos.'
        : (ultimoErro?.message || data.error.message)
      return res.status(500).json({ error: msg })
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    const clean = text.replace(/```json|```/g, '').trim()
    return res.status(200).json({ result: clean })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
