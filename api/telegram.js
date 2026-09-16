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
  "item": string ou null (texto EXATO do campo Descrição/Mensagem - é o item comprado. Se for "MO" escreva "Mão de Obra")
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
        text: '👋 Envie uma foto ou PDF do comprovante de pagamento.\n\nDica: escreva o código ou nome da obra na legenda da foto (ex: "BR") pra eu já lançar na obra certa. Sem legenda, o lançamento entra sem obra e você atribui depois no app.'
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

    // Tenta identificar a obra pela legenda da mensagem
    const { data: obras } = await supabase.from('obras').select('codigo, nome')
    let obraCodigo = null, obraNome = null
    if (caption && obras) {
      const alvo = caption.toLowerCase()
      const encontrada = obras.find(o =>
        o.codigo?.toLowerCase() === alvo ||
        o.nome?.toLowerCase() === alvo ||
        o.nome?.toLowerCase().includes(alvo)
      )
      if (encontrada) { obraCodigo = encontrada.codigo; obraNome = encontrada.nome }
    }

    // Lê o comprovante com a IA
    let ext
    try {
      ext = await extrairDadosComprovante(base64, mediaType)
    } catch (e) {
      await telegramApi('sendMessage', { chat_id: chatId, text: `❌ Não consegui ler o comprovante: ${e.message}` })
      return res.status(200).json({ ok: true })
    }

    const registro = {
      item: ext.item || null,
      fornecedor: ext.fornecedor || null,
      responsavel: ext.responsavel || 'THE',
      qualidade: null,
      data: ext.data || new Date().toISOString().slice(0, 10),
      observacao: null,
      origem: 'telegram',
      obra_codigo: obraCodigo,
      obras_codigos: obraCodigo ? [obraCodigo] : [],
      valor: ext.valor || 0,
    }

    const { error } = await supabase.from('despesas').insert([registro])
    if (error) {
      await telegramApi('sendMessage', { chat_id: chatId, text: `❌ Erro ao salvar no sistema: ${error.message}` })
      return res.status(200).json({ ok: true })
    }

    const valorFmt = (registro.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const linhaObra = obraNome ? `\n🏗️ Obra: ${obraNome}` : '\n⚠️ Obra não identificada — abra o app pra atribuir esse lançamento a uma obra'
    await telegramApi('sendMessage', {
      chat_id: chatId,
      text: `✅ Lançamento criado!\n💰 ${valorFmt}\n🏪 ${registro.fornecedor || '—'}\n📅 ${registro.data}${linhaObra}`
    })

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Telegram webhook error:', err)
    return res.status(200).json({ ok: true }) // sempre responde 200 pro Telegram não ficar reenviando
  }
}
