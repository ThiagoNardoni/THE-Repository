import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://iugricxbqlixlfcwsoim.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1Z3JpY3hicWxpeGxmY3dzb2ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NDA1MzQsImV4cCI6MjA5NDAxNjUzNH0.Ng80yig__ikGknVKjdZDwJPIBwJd6buiRMA0scjJ3fU'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Mesma lógica de extração com IA usada em api/gemini.js ─────────────────
const MODELOS_RESERVA = ['gemini-flash-latest', 'gemini-3.5-flash-lite']

async function fetchComTimeout(url, options, ms) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

async function getModelosDisponiveis() {
  try {
    const resp = await fetchComTimeout(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`, {}, 6000)
    const data = await resp.json()
    const ids = (data.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace('models/', ''))
      .filter(id => /^gemini-\d/.test(id) && id.includes('flash') && !/image|audio|native|tts|robotics|embed/.test(id))
    if (ids.length === 0) return MODELOS_RESERVA
    const versao = (id) => { const m = id.match(/gemini-(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0 }
    const estavel = (id) => !/preview|exp/i.test(id)
    const principais = ids.filter(id => !id.includes('lite') && estavel(id)).sort((a, b) => versao(b) - versao(a))
    const leves = ids.filter(id => id.includes('lite') && estavel(id)).sort((a, b) => versao(b) - versao(a))
    const previews = ids.filter(id => !estavel(id)).sort((a, b) => versao(b) - versao(a))
    const ordenados = [...principais, ...leves, ...previews]
    return ordenados.length > 0 ? ordenados.slice(0, 3) : MODELOS_RESERVA
  } catch {
    return MODELOS_RESERVA
  }
}

async function extrairDadosComprovante(base64, mediaType) {
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
  "item": string ou null (texto EXATO do campo Descrição/Mensagem - é o item comprado. Se for "MO" escreva "Mão de Obra"),
  "qualidade": string (classifique o item em EXATAMENTE uma destas opções: "Documentos", "Materiais", "Mão de Obra", "Lote", "Miudezas". Ex: cimento/areia/tijolo/tinta = Materiais; MO/pedreiro/pintor/serviço = Mão de Obra; matrícula/escritura/cartório/certidão = Documentos; compra de terreno = Lote; pequenas despesas diversas = Miudezas. Se não der pra classificar, use "Materiais")
}
Campos não encontrados use null. Retorne APENAS o JSON.` }
    ]}],
    generationConfig: { temperature: 0 }
  })

  const MODELOS = await getModelosDisponiveis()
  let data
  for (const modelo of MODELOS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${process.env.GEMINI_API_KEY}`
    try {
      const response = await fetchComTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      }, 15000)
      data = await response.json()
      if (!data.error) break
    } catch (e) {
      data = { error: { message: e.message } }
    }
  }
  if (data?.error) throw new Error(data.error.message)
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  const clean = text.replace(/```json|```/g, '').trim()
  return JSON.parse(clean)
}

// ── Telegram ─────────────────────────────────────────────────────────────
async function telegramApi(method, params) {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN
  const resp = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  })
  return resp.json()
}

// ── Reconhecimento de obra(s) a partir de texto, com suporte a divisão ─────
const normalizar = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

function acharObra(nomeOuCodigo, obrasDisponiveis) {
  const alvo = normalizar(nomeOuCodigo)
  if (!alvo) return null
  return obrasDisponiveis.find(o =>
    normalizar(o.codigo) === alvo ||
    normalizar(o.nome) === alvo ||
    normalizar(o.nome).includes(alvo) ||
    alvo.includes(normalizar(o.codigo))
  ) || null
}

// Aceita: "BR" | "BR, Feira" | "BR: 600, Feira: 819,00" — separadores por vírgula, ";", quebra de linha ou " e "
// Retorna null se algum trecho não bater com nenhuma obra cadastrada.
function parseObrasTexto(texto, obrasDisponiveis) {
  const partes = (texto || '').split(/[,;\n]| e /i).map(p => p.trim()).filter(Boolean)
  if (partes.length === 0) return null
  const resultado = []
  for (const parte of partes) {
    let nomeParte = parte, valorParte = null
    const idx = parte.indexOf(':')
    if (idx > -1) {
      nomeParte = parte.slice(0, idx).trim()
      const numTexto = parte.slice(idx + 1).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(,|$))/g, '').replace(',', '.')
      const num = parseFloat(numTexto)
      if (!isNaN(num)) valorParte = num
    }
    const achada = acharObra(nomeParte, obrasDisponiveis)
    if (!achada) return null // algum pedaço não bateu com obra nenhuma → invalida tudo
    resultado.push({ codigo: achada.codigo, nome: achada.nome, valor: valorParte })
  }
  return resultado
}

// Divide valorTotal entre as obras: usa os valores manuais se TODOS vierem informados,
// senão divide igualmente (a última obra fica com o resto do arredondamento).
function calcularRateio(obrasParsed, valorTotal) {
  const todasComValor = obrasParsed.every(o => o.valor != null)
  if (todasComValor) return obrasParsed.map(o => ({ codigo: o.codigo, nome: o.nome, valor: Math.round(o.valor * 100) / 100 }))
  const n = obrasParsed.length
  const base = Math.floor((valorTotal / n) * 100) / 100
  return obrasParsed.map((o, i) => ({
    codigo: o.codigo, nome: o.nome,
    valor: i < n - 1 ? base : Math.round((valorTotal - base * (n - 1)) * 100) / 100
  }))
}

export default async function handler(req, res) {
  // Confere um "segredo" na URL, pra ninguém além do Telegram conseguir chamar esse endpoint
  if (req.query.secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'forbidden' })
  }
  if (req.method !== 'POST') return res.status(200).json({ ok: true })

  try {
    const update = req.body
    const message = update?.message
    if (!message) return res.status(200).json({ ok: true })

    const chatId = message.chat.id
    const caption = (message.caption || '').trim()

    // Comandos simples de ajuda
    if (message.text === '/start' || message.text === '/ajuda') {
      await telegramApi('sendMessage', {
        chat_id: chatId,
        text: '👋 Envie uma foto ou PDF do comprovante de pagamento.\n\nVocê pode informar a obra na legenda da própria foto, OU numa mensagem separada logo depois — funciona dos dois jeitos:\n• Uma obra: "BR"\n• Dividir entre várias, igualmente: "BR, Feira"\n• Dividir com valores definidos: "BR: 600, Feira: 819"\n\nSem informar a obra, o lançamento entra sem obra e você atribui depois.'
      })
      return res.status(200).json({ ok: true })
    }

    // Acha o arquivo (foto ou documento/PDF) na mensagem
    let fileId = null, mediaType = 'image/jpeg'
    if (message.photo?.length > 0) {
      fileId = message.photo[message.photo.length - 1].file_id // maior resolução
      mediaType = 'image/jpeg'
    } else if (message.document) {
      fileId = message.document.file_id
      mediaType = message.document.mime_type || 'application/octet-stream'
    }

    // Se veio só texto (sem foto/PDF), tenta usar como o nome/código da(s) obra(s)
    // pra completar o ÚLTIMO lançamento feito por aqui que ainda está sem obra.
    // Isso cobre o jeito mais natural de usar: manda a foto, depois manda "BR" (ou "BR, Feira") numa mensagem separada.
    if (!fileId && message.text) {
      const { data: pendentes } = await supabase
        .from('despesas')
        .select('id, valor, fornecedor, item, data, observacao, responsavel, qualidade')
        .eq('origem', 'telegram')
        .is('obra_codigo', null)
        .order('created_at', { ascending: false })
        .limit(1)

      const { data: obras } = await supabase.from('obras').select('codigo, nome')
      const obrasParsed = parseObrasTexto(message.text, obras || [])

      if (!pendentes?.length) {
        await telegramApi('sendMessage', { chat_id: chatId, text: 'Não encontrei nenhum lançamento recente sem obra pra vincular. Envie a foto do comprovante primeiro.' })
      } else if (!obrasParsed) {
        const lista = (obras || []).map(o => `${o.codigo} (${o.nome})`).join(', ')
        await telegramApi('sendMessage', { chat_id: chatId, text: `Não reconheci "${message.text}" como obra(s). Pra dividir entre várias, separe por vírgula (ex: "BR, Feira") ou com valores (ex: "BR: 600, Feira: 819"). Obras cadastradas: ${lista || 'nenhuma encontrada'}` })
      } else {
        const pendente = pendentes[0]
        const rateio = calcularRateio(obrasParsed, pendente.valor || 0)
        const todosCodigos = rateio.map(r => r.codigo)

        // Atualiza o lançamento original com a primeira obra do rateio...
        await supabase.from('despesas').update({
          obra_codigo: rateio[0].codigo,
          obras_codigos: todosCodigos,
          valor: rateio[0].valor,
          rateio_total: pendente.valor
        }).eq('id', pendente.id)

        // ...e cria um lançamento novo pra cada obra adicional
        if (rateio.length > 1) {
          const extras = rateio.slice(1).map(r => ({
            item: pendente.item, fornecedor: pendente.fornecedor, responsavel: pendente.responsavel,
            qualidade: pendente.qualidade, data: pendente.data, observacao: pendente.observacao, origem: 'telegram',
            obra_codigo: r.codigo, obras_codigos: todosCodigos, valor: r.valor, rateio_total: pendente.valor
          }))
          await supabase.from('despesas').insert(extras)
        }

        const resumo = rateio.map(r => `${r.nome}: ${r.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`).join(' | ')
        await telegramApi('sendMessage', { chat_id: chatId, text: `✅ Prontinho! Dividi o lançamento (${pendente.fornecedor || '—'}) assim:\n${resumo}` })
      }
      return res.status(200).json({ ok: true })
    }

    if (!fileId) {
      await telegramApi('sendMessage', {
        chat_id: chatId,
        text: 'Envie uma foto ou PDF do comprovante de pagamento. Escreva o código da obra na legenda pra eu lançar direto na obra certa (opcional).'
      })
      return res.status(200).json({ ok: true })
    }

    await telegramApi('sendMessage', { chat_id: chatId, text: '⏳ Recebido! Lendo o comprovante com a IA...' })

    // Baixa o arquivo do Telegram
    const fileInfo = await telegramApi('getFile', { file_id: fileId })
    const filePath = fileInfo?.result?.file_path
    if (!filePath) {
      await telegramApi('sendMessage', { chat_id: chatId, text: '❌ Não consegui baixar o arquivo enviado. Tente novamente.' })
      return res.status(200).json({ ok: true })
    }
    const fileResp = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`)
    const arrayBuffer = await fileResp.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    // Tenta identificar a(s) obra(s) pela legenda da mensagem
    const { data: obras, error: erroObras } = await supabase.from('obras').select('codigo, nome')
    const obrasParsedLegenda = caption ? parseObrasTexto(caption, obras || []) : null

    // Lê o comprovante com a IA
    let ext
    try {
      ext = await extrairDadosComprovante(base64, mediaType)
    } catch (e) {
      await telegramApi('sendMessage', { chat_id: chatId, text: `❌ Não consegui ler o comprovante: ${e.message}` })
      return res.status(200).json({ ok: true })
    }

    const valorTotal = ext.valor || 0
    const base = {
      item: ext.item || null,
      fornecedor: ext.fornecedor || null,
      responsavel: ext.responsavel || 'THE',
      qualidade: ext.qualidade || null,
      data: ext.data || new Date().toISOString().slice(0, 10),
      observacao: null,
      origem: 'telegram',
    }

    let linhaObra
    if (obrasParsedLegenda && obrasParsedLegenda.length > 0) {
      const rateio = calcularRateio(obrasParsedLegenda, valorTotal)
      const todosCodigos = rateio.map(r => r.codigo)
      const linhas = rateio.map(r => ({ ...base, obra_codigo: r.codigo, obras_codigos: todosCodigos, valor: r.valor, rateio_total: valorTotal }))
      const { error } = await supabase.from('despesas').insert(linhas)
      if (error) {
        await telegramApi('sendMessage', { chat_id: chatId, text: `❌ Erro ao salvar no sistema: ${error.message}` })
        return res.status(200).json({ ok: true })
      }
      linhaObra = rateio.length > 1
        ? `\n🏗️ Dividido: ${rateio.map(r => `${r.nome} (${r.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`).join(' | ')}`
        : `\n🏗️ Obra: ${rateio[0].nome}`
    } else {
      const { error } = await supabase.from('despesas').insert([{ ...base, obra_codigo: null, obras_codigos: [], valor: valorTotal }])
      if (error) {
        await telegramApi('sendMessage', { chat_id: chatId, text: `❌ Erro ao salvar no sistema: ${error.message}` })
        return res.status(200).json({ ok: true })
      }
      linhaObra = caption
        ? `\n⚠️ Não reconheci "${caption}" como obra. Obras cadastradas: ${(obras || []).map(o => `${o.codigo} (${o.nome})`).join(', ') || `nenhuma encontrada${erroObras ? ' (erro: ' + erroObras.message + ')' : ''}`}. Responda esta conversa com o nome certo.`
        : '\n⚠️ Obra não identificada — responda esta conversa com o código/nome da obra (ex: "BR", ou "BR, Feira" pra dividir) pra eu vincular, ou abra o app pra atribuir manualmente'
    }

    const valorFmt = valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    await telegramApi('sendMessage', {
      chat_id: chatId,
      text: `✅ Lançamento criado!\n💰 ${valorFmt}\n🏪 ${base.fornecedor || '—'}\n📅 ${base.data}\n🏷️ ${base.qualidade || '—'}${linhaObra}`
    })

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Telegram webhook error:', err)
    return res.status(200).json({ ok: true }) // sempre responde 200 pro Telegram não ficar reenviando
  }
}
