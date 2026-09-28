import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://iugricxbqlixlfcwsoim.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1Z3JpY3hicWxpeGxmY3dzb2ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NDA1MzQsImV4cCI6MjA5NDAxNjUzNH0.Ng80yig__ikGknVKjdZDwJPIBwJd6buiRMA0scjJ3fU'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const OBRAS = [
  { codigo: 'F', nome: 'Feira' },
  { codigo: 'E', nome: 'Esquina' },
  { codigo: 'B', nome: 'BR' },
  { codigo: 'FA', nome: 'Estranho (Faro)' },
  { codigo: 'P', nome: 'Passarela' },
  { codigo: '3', nome: '3 Lotes' },
  { codigo: 'T', nome: 'THE' },
]

const MAX_TENTATIVAS = 20 // ~20 minutos de tentativas (1 por minuto), depois desiste e avisa

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
  const exata = obrasDisponiveis.find(o => normalizar(o.codigo) === alvo || normalizar(o.nome) === alvo)
  if (exata) return exata
  if (alvo.length >= 3) {
    return obrasDisponiveis.find(o =>
      normalizar(o.nome).includes(alvo) || alvo.includes(normalizar(o.codigo))
    ) || null
  }
  return null
}

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
    if (!achada) return null
    resultado.push({ codigo: achada.codigo, nome: achada.nome, valor: valorParte })
  }
  return resultado
}

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

// ── Extração com IA (mesma lógica usada em api/gemini.js) ──────────────────
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
    return ordenados.length > 0 ? ordenados.slice(0, 2) : MODELOS_RESERVA
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
      }, 25000)
      data = await response.json()
      if (!data.error) break
    } catch (e) {
      data = { error: { message: e.message } }
    }
  }
  if (data?.error) {
    const msg = /abort/i.test(data.error.message)
      ? 'A IA demorou demais pra responder (instabilidade momentânea do Google).'
      : data.error.message
    throw new Error(msg)
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
  const clean = text.replace(/```json|```/g, '').trim()
  return JSON.parse(clean)
}

export default async function handler(req, res) {
  // Mesmo segredo do webhook do Telegram, só pra confirmar que quem chamou
  // esse endpoint fomos nós mesmos (via agendador externo), não qualquer um.
  if (req.query.secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'forbidden' })
  }

  // Pega só 1 item por vez, o mais antigo da fila, pra ficar bem dentro do tempo-limite
  const { data: itens, error: erroBusca } = await supabase
    .from('fila_comprovantes')
    .select('*')
    .eq('status', 'pendente')
    .order('created_at', { ascending: true })
    .limit(1)

  if (erroBusca) return res.status(500).json({ ok: false, error: erroBusca.message })
  if (!itens?.length) return res.status(200).json({ ok: true, processado: false, motivo: 'fila vazia' })

  const item = itens[0]

  try {
    const ext = await extrairDadosComprovante(item.arquivo_base64, item.media_type)

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

    const obrasParsed = item.caption ? parseObrasTexto(item.caption, OBRAS) : null
    let linhaObra
    if (obrasParsed && obrasParsed.length > 0) {
      const rateio = calcularRateio(obrasParsed, valorTotal)
      const todosCodigos = rateio.map(r => r.codigo)
      const linhas = rateio.map(r => ({ ...base, obra_codigo: r.codigo, obras_codigos: todosCodigos, valor: r.valor, rateio_total: valorTotal }))
      await supabase.from('despesas').insert(linhas)
      linhaObra = rateio.length > 1
        ? `\n🏗️ Dividido: ${rateio.map(r => `${r.nome} (${r.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`).join(' | ')}`
        : `\n🏗️ Obra: ${rateio[0].nome}`
    } else {
      await supabase.from('despesas').insert([{ ...base, obra_codigo: null, obras_codigos: [], valor: valorTotal }])
      linhaObra = item.caption
        ? `\n⚠️ Não reconheci "${item.caption}" como obra. Obras cadastradas: ${OBRAS.map(o => `${o.codigo} (${o.nome})`).join(', ')}. Responda esta conversa com o nome certo.`
        : '\n⚠️ Obra não identificada — responda esta conversa com o código/nome da obra pra eu vincular, ou abra o app pra atribuir manualmente'
    }

    await supabase.from('fila_comprovantes').update({ status: 'concluido', updated_at: new Date().toISOString() }).eq('id', item.id)

    const valorFmt = valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    await telegramApi('sendMessage', {
      chat_id: item.chat_id,
      text: `✅ Lançamento criado!\n💰 ${valorFmt}\n🏪 ${base.fornecedor || '—'}\n📅 ${base.data}\n🏷️ ${base.qualidade || '—'}${linhaObra}`
    })

    return res.status(200).json({ ok: true, processado: true, resultado: 'sucesso' })
  } catch (e) {
    const novasTentativas = (item.tentativas || 0) + 1
    if (novasTentativas >= MAX_TENTATIVAS) {
      await supabase.from('fila_comprovantes').update({
        status: 'falhou', tentativas: novasTentativas, erro_ultimo: e.message, updated_at: new Date().toISOString()
      }).eq('id', item.id)
      await telegramApi('sendMessage', {
        chat_id: item.chat_id,
        text: `❌ Não consegui ler esse comprovante depois de várias tentativas (${e.message}). Envie de novo mais tarde, ou lance manualmente no app.`
      })
      return res.status(200).json({ ok: true, processado: true, resultado: 'desistiu' })
    } else {
      await supabase.from('fila_comprovantes').update({
        tentativas: novasTentativas, erro_ultimo: e.message, updated_at: new Date().toISOString()
      }).eq('id', item.id)
      return res.status(200).json({ ok: true, processado: true, resultado: 'tentativa_falhou', tentativas: novasTentativas })
    }
  }
}
