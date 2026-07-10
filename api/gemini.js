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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`

    // Tenta até 3 vezes se o Gemini estiver sobrecarregado (erro 503 / "high demand")
    const maxTentativas = 3
    let data
    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      })
      data = await response.json()

      const sobrecarregado = response.status === 503 ||
        (data?.error?.message || '').toLowerCase().includes('high demand') ||
        (data?.error?.message || '').toLowerCase().includes('overloaded')

      if (!sobrecarregado) break

      if (tentativa < maxTentativas) {
        const espera = tentativa * 1500 // 1.5s, depois 3s
        await new Promise(r => setTimeout(r, espera))
      }
    }

    if (data.error) return res.status(500).json({ error: data.error.message })
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    const clean = text.replace(/```json|```/g, '').trim()
    return res.status(200).json({ result: clean })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
