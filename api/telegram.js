import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://iugricxbqlixlfcwsoim.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1Z3JpY3hicWxpeGxmY3dzb2ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NDA1MzQsImV4cCI6MjA5NDAxNjUzNH0.Ng80yig__ikGknVKjdZDwJPIBwJd6buiRMA0scjJ3fU'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Mesma lista de obras usada no site (é fixa no código, não vem de uma tabela do banco)
const OBRAS = [
  { codigo: 'F', nome: 'Feira' },
  { codigo: 'E', nome: 'Esquina' },
  { codigo: 'B', nome: 'BR' },
  { codigo: 'FA', nome: 'Estranho (Faro)' },
  { codigo: 'P', nome: 'Passarela' },
  { codigo: '3', nome: '3 Lotes' },
  { codigo: 'T', nome: 'THE' },
]

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

export default async function handler(req, res) {
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

    if (message.text === '/start' || message.text === '/ajuda') {
      await telegramApi('sendMessage', {
        chat_id: chatId,
        text: '👋 Envie uma foto ou PDF do comprovante de pagamento. Eu guardo na fila e processo automaticamente (se o Google estiver instável, fico tentando de novo sozinho até conseguir).\n\nVocê pode informar a obra na legenda da própria foto, OU numa mensagem separada logo depois:\n• Uma obra: "BR"\n• Dividir entre várias, igualmente: "BR, Feira"\n• Dividir com valores definidos: "BR: 600, Feira: 819"\n\nSem informar a obra, o lançamento entra sem obra e você atribui depois.'
      })
      return res.status(200).json({ ok: true })
    }

    // Acha o arquivo (foto ou documento/PDF) na mensagem
    let fileId = null, mediaType = 'image/jpeg'
    if (message.photo?.length > 0) {
      fileId = message.photo[message.photo.length - 1].file_id
      mediaType = 'image/jpeg'
    } else if (message.document) {
      fileId = message.document.file_id
      mediaType = message.document.mime_type || 'application/octet-stream'
    }

    // Texto sem arquivo → tenta usar como obra(s) pra completar o ÚLTIMO lançamento sem obra
    if (!fileId && message.text) {
      const { data: pendentes } = await supabase
        .from('despesas')
        .select('id, valor, fornecedor, item, data, observacao, responsavel, qualidade')
        .eq('origem', 'telegram')
        .is('obra_codigo', null)
        .order('created_at', { ascending: false })
        .limit(1)

      const obrasParsed = parseObrasTexto(message.text, OBRAS)

      if (!pendentes?.length) {
        await telegramApi('sendMessage', { chat_id: chatId, text: 'Não encontrei nenhum lançamento recente sem obra pra vincular. Envie a foto do comprovante primeiro.' })
      } else if (!obrasParsed) {
        const lista = OBRAS.map(o => `${o.codigo} (${o.nome})`).join(', ')
        await telegramApi('sendMessage', { chat_id: chatId, text: `Não reconheci "${message.text}" como obra(s). Pra dividir entre várias, separe por vírgula (ex: "BR, Feira") ou com valores (ex: "BR: 600, Feira: 819"). Obras cadastradas: ${lista}` })
      } else {
        const pendente = pendentes[0]
        const rateio = calcularRateio(obrasParsed, pendente.valor || 0)
        const todosCodigos = rateio.map(r => r.codigo)

        await supabase.from('despesas').update({
          obra_codigo: rateio[0].codigo,
          obras_codigos: todosCodigos,
          valor: rateio[0].valor,
          rateio_total: pendente.valor
        }).eq('id', pendente.id)

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

    // Baixa o arquivo do Telegram e coloca na FILA — quem realmente lê com a IA
    // é o processo separado (api/processar-fila.js), chamado a cada minuto.
    // Isso evita ficar preso ao tempo de resposta do webhook do Telegram.
    const fileInfo = await telegramApi('getFile', { file_id: fileId })
    const filePath = fileInfo?.result?.file_path
    if (!filePath) {
      await telegramApi('sendMessage', { chat_id: chatId, text: '❌ Não consegui baixar o arquivo enviado. Tente novamente.' })
      return res.status(200).json({ ok: true })
    }
    const fileResp = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`)
    const arrayBuffer = await fileResp.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const { error } = await supabase.from('fila_comprovantes').insert([{
      chat_id: chatId, arquivo_base64: base64, media_type: mediaType, caption: caption || null
    }])

    if (error) {
      await telegramApi('sendMessage', { chat_id: chatId, text: `❌ Erro ao guardar o comprovante na fila: ${error.message}` })
      return res.status(200).json({ ok: true })
    }

    await telegramApi('sendMessage', { chat_id: chatId, text: '📥 Recebido! Coloquei na fila de processamento e já te aviso assim que estiver lançado (pode levar de alguns segundos a alguns minutos).' })
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Telegram webhook error:', err)
    return res.status(200).json({ ok: true })
  }
}
