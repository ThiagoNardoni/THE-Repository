import { useState, useRef, useCallback, useEffect } from 'react'
import { fmt, fmtDate, parseCur, todayStr, obraColor, QUALIDADES } from '../lib/utils'
import { extractPix } from '../lib/claude'
import { saveDespesa, updateDespesa, deleteDespesa, deleteAllDespesas, deleteDespesasPorIds, saveDespesasBulk } from '../lib/supabase'
import { Tag, Modal, Btn, FI, Card, EmptyState, TotalBar } from '../components/UI'
import ExcelJS from 'exceljs'

const emptyForm = {
  obras_selecionadas: [], item: '', fornecedor: '', responsavel: 'THE',
  qualidade: '', qualidade_outro: '', valor: '', data: todayStr(), observacao: '', origem: 'manual',
  rateio: {}
}

// Divide um valor entre N obras (a última obra recebe o resto do arredondamento)
const initRateio = (obras_sel, valor) => {
  const n = obras_sel.length
  if (n === 0) return {}
  const v = parseCur(valor)
  const base = Math.floor((v / n) * 100) / 100
  const r = {}
  obras_sel.forEach((c, i) => { r[c] = i < n - 1 ? base : Math.round((v - base * (n - 1)) * 100) / 100 })
  return r
}

// Redimensiona/comprime imagens grandes (fotos de celular) antes de enviar,
// convertendo para JPEG e limitando a maior dimensão. PDFs passam direto.
const MAX_DIMENSAO = 1920
const QUALIDADE_JPEG = 0.82

const compressImage = (file) => new Promise((resolve, reject) => {
  if (!file.type.startsWith('image/')) { resolve(file); return }
  const img = new Image()
  const url = URL.createObjectURL(file)
  img.onload = () => {
    URL.revokeObjectURL(url)
    let { width, height } = img
    if (width > MAX_DIMENSAO || height > MAX_DIMENSAO) {
      const escala = MAX_DIMENSAO / Math.max(width, height)
      width = Math.round(width * escala)
      height = Math.round(height * escala)
    }
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, width, height)
    canvas.toBlob(
      (blob) => {
        if (!blob) { resolve(file); return } // fallback: manda o original se a compressão falhar
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
      },
      'image/jpeg', QUALIDADE_JPEG
    )
  }
  img.onerror = () => { URL.revokeObjectURL(url); resolve(file) } // fallback: manda o original se não conseguir ler
  img.src = url
})

// Mesma compressão acima, mas com um tempo-limite de segurança: se travar
// processando a imagem (ex: foto muito grande/pesada), desiste e usa o arquivo
// original em vez de deixar o app "pendurado" pra sempre.
const compressImageComTimeout = (file) => Promise.race([
  compressImage(file),
  new Promise(resolve => setTimeout(() => resolve(file), 15000)) // 15s: desiste e usa o original
])

// ── Formulário (componente estável fora do Despesas, evita perda de foco) ──
// Uma linha "label: valor" usada no card de lançamento (layout em coluna única, bom pra celular)
const CampoLinha = ({ label, children, last }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '5px 0', borderBottom: last ? 'none' : '1px solid #f1f5f9' }}>
    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0 }}>{label}</span>
    <span style={{ fontSize: 13, color: '#0f172a', textAlign: 'right' }}>{children}</span>
  </div>
)

function DespesaForm({ form, setForm, obras, obraMap }) {
  const s = k => v => setForm(f => ({ ...f, [k]: v }))
  const obras_sel = form.obras_selecionadas || []
  const totalVal = parseCur(form.valor)
  const somaRateio = obras_sel.reduce((acc, c) => acc + parseCur(form.rateio?.[c] || 0), 0)
  const diff = Math.abs(totalVal - somaRateio)
  const rateioOk = obras_sel.length <= 1 || diff < 0.01

  const toggleObra = (cod) => {
    const cur = form.obras_selecionadas || []
    const next = cur.includes(cod) ? cur.filter(c => c !== cod) : [...cur, cod]
    const rateio = initRateio(next, form.valor)
    setForm(f => ({ ...f, obras_selecionadas: next, rateio }))
  }

  const updateValor = (v) => {
    const rateio = initRateio(form.obras_selecionadas || [], v)
    setForm(f => ({ ...f, valor: v, rateio }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Lista de obras */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', display: 'block', marginBottom: 8 }}>
          Obra(s) {obras_sel.length > 0 && <span style={{ color: '#16a34a', fontWeight: 900 }}>· {obras_sel.length} selecionada{obras_sel.length > 1 ? 's' : ''}</span>}
        </label>
        <div style={{ border: '1.5px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
          {obras.map((o, i) => {
            const sel = obras_sel.includes(o.codigo)
            const color = obraColor(obras, o.codigo)
            return (
              <div key={o.codigo} onClick={() => toggleObra(o.codigo)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', cursor: 'pointer', background: sel ? color + '10' : '#fff', borderBottom: i < obras.length - 1 ? '1px solid #f1f5f9' : 'none', transition: 'background .15s' }}>
                <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${sel ? color : '#cbd5e1'}`, background: sel ? color : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}>
                  {sel && <span style={{ color: '#fff', fontSize: 12, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                </div>
                <span style={{ fontWeight: 800, color: sel ? color : '#64748b', fontSize: 13, minWidth: 28 }}>{o.codigo}</span>
                <span style={{ fontSize: 13, color: sel ? '#0f172a' : '#94a3b8' }}>{o.nome}</span>
                {sel && obras_sel.length > 1 && (
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: color, fontWeight: 700 }}>
                    R$ {parseCur(form.rateio?.[o.codigo] || 0).toFixed(2)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Rateio manual quando mais de uma obra */}
      {obras_sel.length > 1 && (
        <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 12, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>⚖️ Defina o valor por obra</span>
            <button onClick={() => setForm(f => ({ ...f, rateio: initRateio(obras_sel, form.valor) }))}
              style={{ fontSize: 12, color: '#d97706', background: 'none', border: '1px solid #fde68a', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
              Dividir igual
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {obras_sel.map(cod => (
              <div key={cod} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: obraColor(obras, cod), flexShrink: 0 }} />
                <span style={{ fontWeight: 700, color: obraColor(obras, cod), minWidth: 32, fontSize: 13 }}>{cod}</span>
                <span style={{ fontSize: 12, color: '#64748b', flex: 1 }}>{obraMap[cod]?.nome}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>R$</span>
                  <input value={form.rateio?.[cod] ?? ''} onChange={e => setForm(f => ({ ...f, rateio: { ...f.rateio, [cod]: e.target.value } }))}
                    style={{ width: 100, border: `1.5px solid ${rateioOk ? '#fde68a' : '#fca5a5'}`, borderRadius: 8, padding: '7px 10px', fontSize: 14, fontFamily: 'inherit', textAlign: 'right', background: '#fff' }} />
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, paddingTop: 8, borderTop: '1px solid #fde68a' }}>
              <span style={{ color: '#92400e' }}>Soma: <strong>R$ {somaRateio.toFixed(2)}</strong></span>
              <span style={{ color: '#92400e' }}>Total: <strong>R$ {totalVal.toFixed(2)}</strong></span>
              {!rateioOk && <span style={{ color: '#e11d48', fontWeight: 700 }}>⚠️ Diferença: R$ {diff.toFixed(2)}</span>}
              {rateioOk && obras_sel.length > 0 && <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ OK</span>}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Qualidade */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>Qualidade</label>
          <select value={form.qualidade || ''} onChange={e => setForm(f => ({ ...f, qualidade: e.target.value, qualidade_outro: '' }))}
            style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', background: '#fafafa', appearance: 'none' }}
            onFocus={e => e.target.style.borderColor = '#16a34a'} onBlur={e => e.target.style.borderColor = '#e2e8f0'}>
            <option value=''>— selecionar —</option>
            {QUALIDADES.map(q => <option key={q} value={q}>{q}</option>)}
            <option value='Outro'>Outro (digitar)</option>
          </select>
          {form.qualidade === 'Outro' && (
            <input value={form.qualidade_outro || ''} onChange={e => setForm(f => ({ ...f, qualidade_outro: e.target.value }))}
              placeholder="Digite..." autoFocus
              style={{ border: '1.5px solid #86efac', borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', background: '#f0fdf4', marginTop: 6 }} />
          )}
        </div>

        <FI label="Valor Total (R$) *" value={form.valor || ''} onChange={updateValor} placeholder="5600,00" />
        <FI label="Descrição / Item *" value={form.item || ''} onChange={s('item')} />
        <FI label="Fornecedor (quem recebeu)" value={form.fornecedor || ''} onChange={s('fornecedor')} />
        <FI label="Data" type="date" value={form.data || ''} onChange={s('data')} />
        <FI label="Observação" value={form.observacao || ''} onChange={s('observacao')} />
      </div>
    </div>
  )
}

// ── Página Despesas ──
export default function Despesas({ despesas, setDespesas, obras }) {
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState(null)
  const fileRef = useRef()
  const [showPreview, setShowPreview] = useState(false)
  const [preview, setPreview] = useState(null)
  const [showManual, setShowManual] = useState(false)
  const [manual, setManual] = useState(emptyForm)
  const [obrasExcluidas, setObrasExcluidas] = useState([])
  const [showObraFilter, setShowObraFilter] = useState(false)
  const [filterMes, setFilterMes] = useState('')
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [showImport, setShowImport] = useState(false)
  const [importObra, setImportObra] = useState('')
  const [importRows, setImportRows] = useState(null)
  const [importErr, setImportErr] = useState(null)
  const [importing, setImporting] = useState(false)
  const importFileRef = useRef()
  const [debugInfo, setDebugInfo] = useState(null)
  const [testandoIA, setTestandoIA] = useState(false)
  const [testeIAResultado, setTesteIAResultado] = useState(null)

  // 🔧 Diagnóstico temporário: registra, toda vez que o app abre, a URL exata
  // que foi usada — assim conseguimos ver se um compartilhamento chegou até aqui.
  useEffect(() => {
    setDebugInfo({ url: window.location.href, hora: new Date().toLocaleTimeString('pt-BR') })
  }, [])

  // 🔧 Teste manual: verifica se o site consegue se comunicar com a IA do Google,
  // sem depender de nenhum comprovante real — usa uma imagem mínima de teste.
  const testarConexaoIA = async () => {
    setTestandoIA(true); setTesteIAResultado(null)
    const IMAGEM_TESTE_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    try {
      const inicio = Date.now()
      await extractPix(IMAGEM_TESTE_1PX, 'image/png')
      const segundos = ((Date.now() - inicio) / 1000).toFixed(1)
      setTesteIAResultado({ ok: true, msg: `✅ Comunicação com a IA funcionando! (respondeu em ${segundos}s)` })
    } catch (e) {
      setTesteIAResultado({ ok: false, msg: `❌ Falha na comunicação com a IA: ${e.message}` })
    }
    setTestandoIA(false)
  }

  const obraMap = Object.fromEntries(obras.map(o => [o.codigo, o]))
  const getQualFinal = (form) => form.qualidade === 'Outro' ? (form.qualidade_outro || '') : form.qualidade

  // Upload PIX
  const handleFile = useCallback(async (file) => {
    if (!file) return
    setUploadErr(null); setUploading(true)
    try {
      const fileFinal = await compressImageComTimeout(file)
      const mediaType = fileFinal.type || 'image/jpeg'
      const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = () => rej(new Error('Não foi possível ler o arquivo selecionado.')); r.readAsDataURL(fileFinal) })
      const ext = await extractPix(b64, mediaType)
      setPreview({
        obras_selecionadas: [], item: ext.item || '',
        fornecedor: ext.fornecedor || '', responsavel: ext.responsavel || 'THE',
        qualidade: '', qualidade_outro: '', valor: String(ext.valor || ''),
        data: ext.data || todayStr(), observacao: '', origem: 'pix', rateio: {}, _raw: ext,
      })
      setShowPreview(true)
    } catch (e) { setUploadErr(`Erro ao ler comprovante: ${e.message}`) }
    setUploading(false)
  }, [])

  // Check for file shared via WhatsApp / Web Share Target
  useEffect(() => {
    const checkShared = async () => {
      // 🔧 Diagnóstico temporário: se o app abriu com QUALQUER parâmetro na URL
      // que não seja o esperado, mostra ele na tela pra sabermos o que o Android mandou.
      if (location.search && !(location.search.includes('opened=share') || location.search.includes('share=true'))) {
        setUploadErr(`[Diagnóstico] O app abriu com esta URL: ${location.href}`)
        return
      }
      if (!(location.search.includes('opened=share') || location.search.includes('share=true'))) return
      history.replaceState({}, '', '/')
      try {
        if (!window.getSharedFile) {
          setUploadErr('Não consegui abrir o arquivo compartilhado (recurso indisponível neste navegador). Tente selecionar o arquivo manualmente pelo botão de enviar comprovante.')
          return
        }
        // Tenta algumas vezes: pode haver uma pequena demora até o arquivo
        // ficar disponível no IndexedDB logo após o compartilhamento.
        let resultado = null
        for (let tentativa = 0; tentativa < 4 && !resultado; tentativa++) {
          if (tentativa > 0) await new Promise(r => setTimeout(r, 400))
          resultado = await window.getSharedFile()
        }
        if (resultado?.file) {
          handleFile(resultado.file)
        } else if (resultado?.status && resultado.status !== 'ok') {
          if (resultado.status === 'sem_arquivo') {
            setUploadErr('O app do banco não enviou o comprovante no formato esperado. Tente salvar o comprovante como imagem/PDF primeiro e depois enviar pelo botão manual.')
          } else {
            setUploadErr(`Erro ao receber o comprovante compartilhado (${resultado.status}). Tente enviar manualmente pelo botão de enviar comprovante.`)
          }
        } else {
          setUploadErr('O comprovante compartilhado não chegou até o app. Tente novamente ou selecione o arquivo manualmente pelo botão de enviar comprovante.')
        }
      } catch (e) {
        setUploadErr(`Erro ao processar o arquivo compartilhado: ${e.message}`)
      }
    }
    checkShared()
  }, [handleFile])

  // ── Importar planilha de lançamentos já existente ─────────────────────────
  // Aceita o mesmo layout do modelo: título na linha 2, cabeçalho na linha 3
  // (Descrição, Fornecedor, Qualidade, Data, Valor, Observação) a partir da coluna B,
  // mas também tenta achar o cabeçalho automaticamente se estiver em outra linha/coluna.
  const excelDateParaISO = (v) => {
    if (v == null || v === '') return null
    if (v instanceof Date) {
      const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
    if (typeof v === 'number') {
      // número de série do Excel (dias desde 1899-12-30)
      const dt = new Date(Math.round((v - 25569) * 86400 * 1000))
      const y = dt.getUTCFullYear(), m = String(dt.getUTCMonth() + 1).padStart(2, '0'), d = String(dt.getUTCDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
    if (typeof v === 'string') {
      const s = v.trim()
      let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/) // dd/mm/yyyy
      if (m) { let [, d, mo, y] = m; if (y.length === 2) y = '20' + y; return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}` }
      m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/) // yyyy-mm-dd
      if (m) { const [, y, mo, d] = m; return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}` }
    }
    return null
  }

  const parseImportFile = async (file) => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await file.arrayBuffer())
    const ws = wb.worksheets[0]
    if (!ws) throw new Error('Planilha vazia ou em formato não reconhecido.')

    // Procura a linha de cabeçalho (a que contém "Descrição" e "Valor")
    let headerRow = null, colMap = {}
    for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
      const row = ws.getRow(r)
      const found = {}
      row.eachCell((cell, col) => {
        const v = String(cell.value || '').trim().toLowerCase()
        if (v.startsWith('descri')) found.item = col
        else if (v.startsWith('fornecedor')) found.fornecedor = col
        else if (v.startsWith('qualidade')) found.qualidade = col
        else if (v.startsWith('data')) found.data = col
        else if (v.startsWith('valor')) found.valor = col
        else if (v.startsWith('observa')) found.observacao = col
      })
      if (found.item && found.valor) { headerRow = r; colMap = found; break }
    }
    if (!headerRow) throw new Error('Não encontrei as colunas esperadas (Descrição, Fornecedor, Qualidade, Data, Valor, Observação). Confira se a planilha segue o modelo.')

    const linhas = []
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const item = row.getCell(colMap.item).value
      const itemStr = String(item || '').trim()
      if (!itemStr || /^total$/i.test(itemStr)) continue // pula linhas em branco ou de TOTAL
      const valorCell = row.getCell(colMap.valor).value
      const valor = typeof valorCell === 'object' && valorCell?.result != null ? valorCell.result : valorCell
      if (typeof valor !== 'number') continue // pula linhas sem valor numérico válido
      linhas.push({
        item: itemStr,
        fornecedor: colMap.fornecedor ? String(row.getCell(colMap.fornecedor).value || '').trim() : '',
        qualidade: colMap.qualidade ? String(row.getCell(colMap.qualidade).value || '').trim() : '',
        data: colMap.data ? excelDateParaISO(row.getCell(colMap.data).value) : null,
        valor,
        observacao: colMap.observacao ? String(row.getCell(colMap.observacao).value || '').trim() : '',
      })
    }
    return linhas
  }

  const handleImportFile = async (file) => {
    if (!file) return
    setImportErr(null); setImportRows(null)
    try {
      const linhas = await parseImportFile(file)
      if (linhas.length === 0) throw new Error('Nenhum lançamento encontrado nessa planilha.')
      setImportRows(linhas)
    } catch (e) { setImportErr(e.message) }
  }

  const confirmImport = async () => {
    if (!importObra || !importRows || importRows.length === 0) return
    setImporting(true)
    try {
      const paraSalvar = importRows.map(l => ({
        item: l.item, fornecedor: l.fornecedor, qualidade: l.qualidade,
        data: l.data || todayStr(), valor: l.valor, observacao: l.observacao,
        responsavel: 'THE', origem: 'importacao', obra_codigo: importObra, obras_codigos: [importObra],
      }))
      const salvos = await saveDespesasBulk(paraSalvar)
      setDespesas(p => [...salvos, ...p])
      setShowImport(false); setImportRows(null); setImportObra(''); setImportErr(null)
      if (importFileRef.current) importFileRef.current.value = ''
    } catch (e) { setImportErr('Erro ao importar: ' + e.message) }
    setImporting(false)
  }


  // Save rows - one per obra
  const saveRows = async (form, origem) => {
    const base = {
      item: form.item, fornecedor: form.fornecedor, responsavel: form.responsavel,
      qualidade: getQualFinal(form), data: form.data, observacao: form.observacao, origem,
    }
    const obras_sel = form.obras_selecionadas || []
    if (obras_sel.length === 0) {
      return [await saveDespesa({ ...base, obra_codigo: null, obras_codigos: [], valor: parseCur(form.valor) })]
    }
    const totalVal = parseCur(form.valor)
    return await Promise.all(obras_sel.map(cod => {
      const val = form.rateio[cod] != null ? parseCur(form.rateio[cod]) : Math.round((totalVal / obras_sel.length) * 100) / 100
      return saveDespesa({ ...base, obra_codigo: cod, obras_codigos: obras_sel, valor: val, rateio_total: totalVal })
    }))
  }

  const confirmPreview = async () => {
    try {
      const saved = await saveRows(preview, 'pix')
      setDespesas(p => [...saved, ...p]); setShowPreview(false); setPreview(null)
    } catch (e) { alert('Erro ao salvar: ' + e.message) }
  }

  const addManual = async () => {
    if (!manual.valor || !manual.item) return
    try {
      const saved = await saveRows(manual, 'manual')
      setDespesas(p => [...saved, ...p]); setManual(emptyForm); setShowManual(false)
    } catch (e) { alert('Erro ao salvar: ' + e.message) }
  }

  const saveEdit = async () => {
    try {
      const d = { item: editForm.item, fornecedor: editForm.fornecedor, responsavel: editForm.responsavel, qualidade: getQualFinal(editForm), valor: parseCur(editForm.valor), data: editForm.data, observacao: editForm.observacao, obra_codigo: editForm.obra_codigo || null, obras_codigos: editForm.obra_codigo ? [editForm.obra_codigo] : [] }
      await updateDespesa(editId, d)
      setDespesas(p => p.map(x => x.id === editId ? { ...x, ...d } : x)); setEditId(null)
    } catch (e) { alert('Erro: ' + e.message) }
  }

  const remove = async (id) => {
    if (!confirm('Remover lançamento?')) return
    await deleteDespesa(id); setDespesas(p => p.filter(x => x.id !== id))
  }

  const removeAll = async () => {
    // Respeita o filtro de obra(s)/mês que estiver ativo na tela
    const alvo = despesas.filter(d => {
      const obraOk = !obrasExcluidas.includes(d.obra_codigo || 'SEM')
      const mesOk = !filterMes || d.data?.startsWith(filterMes)
      return obraOk && mesOk
    })
    if (alvo.length === 0) return
    const temFiltro = obrasExcluidas.length > 0 || !!filterMes
    const obrasIncluidasNomes = temFiltro && obrasExcluidas.length > 0
      ? [...new Set(alvo.map(d => obraMap[d.obra_codigo]?.nome || d.obra_codigo || 'Sem obra'))].join(', ')
      : null

    const msg = temFiltro
      ? `⚠️ Isso vai apagar os ${alvo.length} lançamentos filtrados${obrasIncluidasNomes ? ` (obras: ${obrasIncluidasNomes})` : ''}${filterMes ? ` (mês ${filterMes})` : ''}. Essa ação não pode ser desfeita.\n\nDeseja continuar?`
      : `⚠️ Isso vai apagar TODOS os ${alvo.length} lançamentos de TODAS as obras, de todos os usuários. Essa ação não pode ser desfeita.\n\nDeseja continuar?`
    const ok = confirm(msg)
    if (!ok) return

    try {
      if (temFiltro) {
        await deleteDespesasPorIds(alvo.map(d => d.id))
      } else {
        await deleteAllDespesas()
      }
      const idsRemovidos = new Set(alvo.map(d => d.id))
      setDespesas(p => p.filter(x => !idsRemovidos.has(x.id)))
    } catch (e) { alert('Erro ao excluir: ' + e.message) }
  }

  const exportExcel = async () => {
    const THIN = { style: 'thin' }
    const BORDER_ALL = { top: THIN, left: THIN, bottom: THIN, right: THIN }
    const FONT = { name: 'Calibri', size: 11 }
    const CURRENCY_FMT = '_-"R$"\\ * #,##0.00_-;\\-"R$"\\ * #,##0.00_-;_-"R$"\\ * "-"??_-;_-@_-'
    const DATE_FMT = 'mm-dd-yy'
    const COL_WIDTHS = [8.89, 23.44, 19.55, 14, 10.56, 14.11, 15.33] // A..G

    // Converte 'YYYY-MM-DD' em Date local (evita deslocamento de fuso horário)
    const parseDataLocal = (s) => {
      if (!s) return null
      const [y, m, d] = s.split('-').map(Number)
      return new Date(y, (m || 1) - 1, d || 1)
    }

    const styleHeaderRow = (ws, rowNum, values) => {
      const row = ws.getRow(rowNum)
      values.forEach((v, i) => {
        const cell = row.getCell(i + 2) // começa na coluna B
        cell.value = v
        cell.font = { ...FONT, bold: true }
        cell.alignment = { horizontal: 'center', vertical: 'center' }
        cell.border = BORDER_ALL
      })
    }

    const buildSheet = (wb, sheetName, rows) => {
      const ws = wb.addWorksheet(sheetName.substring(0, 31))
      COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w })

      // Título mesclado B2:G2
      ws.mergeCells('B2:G2')
      const titleCell = ws.getCell('B2')
      titleCell.value = 'Planilha de Gastos'
      titleCell.font = { ...FONT, bold: true }
      titleCell.alignment = { horizontal: 'center', vertical: 'center' }
      for (let c = 2; c <= 7; c++) ws.getRow(2).getCell(c).border = BORDER_ALL

      // Cabeçalho na linha 3
      styleHeaderRow(ws, 3, ['Descrição', 'Fornecedor', 'Qualidade', 'Data', 'Valor', 'Observação'])

      // Linhas de dados, ordenadas por data crescente
      const ordenadas = [...rows].sort((a, b) => (a.data || '').localeCompare(b.data || ''))
      let r = 4
      ordenadas.forEach(d => {
        const row = ws.getRow(r)
        const dataLocal = parseDataLocal(d.data)
        const valores = [d.item || '', d.fornecedor || '', d.qualidade || '', dataLocal, d.valor || 0, d.observacao || '']
        valores.forEach((v, i) => {
          const cell = row.getCell(i + 2)
          cell.value = v
          cell.font = FONT
          cell.alignment = { horizontal: 'center', vertical: 'center', wrapText: true }
          cell.border = BORDER_ALL
          if (i === 3) cell.numFmt = DATE_FMT
          if (i === 4) cell.numFmt = CURRENCY_FMT
        })
        r++
      })

      // Filtro automático do Excel nas colunas do cabeçalho (linha 3 até a última linha de dados)
      if (ordenadas.length > 0) {
        ws.autoFilter = { from: { row: 3, column: 2 }, to: { row: r - 1, column: 7 } }
      }

      // Linha de total
      if (ordenadas.length > 0) {
        const row = ws.getRow(r)
        row.getCell(5).value = 'TOTAL'
        row.getCell(5).font = { ...FONT, bold: true }
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'center' }
        row.getCell(5).border = BORDER_ALL
        const totalCell = row.getCell(6)
        totalCell.value = { formula: `SUM(F4:F${r - 1})` }
        totalCell.font = { ...FONT, bold: true }
        totalCell.alignment = { horizontal: 'center', vertical: 'center' }
        totalCell.border = BORDER_ALL
        totalCell.numFmt = CURRENCY_FMT
        row.getCell(2).border = BORDER_ALL
        row.getCell(3).border = BORDER_ALL
        row.getCell(4).border = BORDER_ALL
        row.getCell(7).border = BORDER_ALL
      }
      return ws
    }

    const wb = new ExcelJS.Workbook()
    const allObras = [...new Set(despesas.map(d => d.obra_codigo || 'SEM'))]
    allObras.forEach(cod => {
      const rows = despesas.filter(d => (d.obra_codigo || 'SEM') === cod)
      buildSheet(wb, obraMap[cod]?.nome || cod, rows)
    })

    // Aba de resumo
    const wsR = wb.addWorksheet('Resumo')
    wsR.getColumn(1).width = 24; wsR.getColumn(2).width = 10; wsR.getColumn(3).width = 18
    styleHeaderRowSimples(wsR, 1, ['Obra', 'Qtd', 'Total (R$)'])
    let rr = 2
    allObras.forEach(cod => {
      const rows = despesas.filter(d => (d.obra_codigo || 'SEM') === cod)
      const total = rows.reduce((s, d) => s + (d.valor || 0), 0)
      const row = wsR.getRow(rr)
      row.getCell(1).value = obraMap[cod]?.nome || cod
      row.getCell(2).value = rows.length
      row.getCell(3).value = total
      row.getCell(3).numFmt = CURRENCY_FMT;
      [1, 2, 3].forEach(c => { row.getCell(c).font = FONT; row.getCell(c).border = BORDER_ALL; row.getCell(c).alignment = { horizontal: 'center', vertical: 'center' } })
      rr++
    })

    function styleHeaderRowSimples(ws, rowNum, values) {
      const row = ws.getRow(rowNum)
      values.forEach((v, i) => {
        const cell = row.getCell(i + 1)
        cell.value = v
        cell.font = { ...FONT, bold: true }
        cell.alignment = { horizontal: 'center', vertical: 'center' }
        cell.border = BORDER_ALL
      })
    }

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `Despesas_${todayStr()}.xlsx`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const toggleObraFiltro = (codigo) => {
    setObrasExcluidas(p => p.includes(codigo) ? p.filter(c => c !== codigo) : [...p, codigo])
  }

  const filtered = despesas.filter(d => {
    const obraOk = !obrasExcluidas.includes(d.obra_codigo || 'SEM')
    const mesOk = !filterMes || d.data?.startsWith(filterMes)
    return obraOk && mesOk
  })
  const total = filtered.reduce((s, d) => s + (d.valor || 0), 0)
  const ibtn = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 9px', cursor: 'pointer', fontSize: 14 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 🔧 Painel de diagnóstico temporário */}
      <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 12, padding: '10px 14px', fontSize: 12, color: '#475569', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div>🔧 <b>Diagnóstico</b> — App aberto às {debugInfo?.hora} com a URL: <code style={{ wordBreak: 'break-all' }}>{debugInfo?.url}</code></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Btn onClick={testarConexaoIA} outline small disabled={testandoIA}>{testandoIA ? 'Testando...' : '🔧 Testar conexão com a IA'}</Btn>
          {testeIAResultado && <span style={{ color: testeIAResultado.ok ? '#16a34a' : '#e11d48', fontWeight: 600 }}>{testeIAResultado.msg}</span>}
        </div>
      </div>

      <div onClick={() => fileRef.current?.click()} onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }} onDragOver={e => e.preventDefault()}
        style={{ border: '2.5px dashed #86efac', borderRadius: 18, background: '#f0fdf4', padding: '24px 20px', textAlign: 'center', cursor: 'pointer' }}>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; e.target.value = ''; handleFile(f) }} />
        {uploading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, border: '4px solid #86efac', borderTopColor: '#16a34a', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <span style={{ color: '#16a34a', fontWeight: 700 }}>Lendo comprovante com IA...</span>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 28, marginBottom: 6 }}>📄</div>
            <div style={{ fontWeight: 700, color: '#15803d' }}>Arraste ou clique para enviar comprovante PIX</div>
            <div style={{ fontSize: 12, color: '#4ade80', marginTop: 3 }}>PNG · JPG · PDF — IA extrai os dados automaticamente</div>
          </>
        )}
      </div>

      {uploadErr && <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 12, padding: '10px 14px', color: '#e11d48', fontSize: 13 }}>⚠️ {uploadErr}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <Btn onClick={() => setShowManual(true)} outline color="#16a34a">+ Manual</Btn>
        <Btn onClick={exportExcel} outline color="#0284c7" small disabled={despesas.length === 0}>⬇️ Excel</Btn>
        <Btn onClick={() => setShowImport(true)} outline color="#16a34a" small>📥 Importar Planilha</Btn>
        <Btn onClick={removeAll} outline color="#e11d48" small disabled={despesas.length === 0}>
          {obrasExcluidas.length > 0 || filterMes ? `🗑️ Excluir Filtrados (${filtered.length})` : '🗑️ Excluir Tudo'}
        </Btn>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowObraFilter(s => !s)}
              style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '7px 12px', fontSize: 13, background: '#fff', fontFamily: 'inherit', outline: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              🏗️ {obrasExcluidas.length === 0 ? 'Todas as obras' : `${obras.length + 1 - obrasExcluidas.length} de ${obras.length + 1} selecionadas`} ▾
            </button>
            {showObraFilter && (
              <div style={{ position: 'absolute', top: '110%', right: 0, zIndex: 20, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 10, minWidth: 220, boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
                  <button onClick={() => setObrasExcluidas([])} style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer' }}>Marcar todas</button>
                  <button onClick={() => setObrasExcluidas([...obras.map(o => o.codigo), 'SEM'])} style={{ fontSize: 11, fontWeight: 700, color: '#e11d48', background: 'none', border: 'none', cursor: 'pointer' }}>Desmarcar todas</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
                  {obras.map(o => (
                    <label key={o.codigo} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#0f172a', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!obrasExcluidas.includes(o.codigo)} onChange={() => toggleObraFiltro(o.codigo)} />
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: obraColor(obras, o.codigo), flexShrink: 0 }} />
                      {o.codigo} – {o.nome}
                    </label>
                  ))}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#64748b', cursor: 'pointer', borderTop: '1px solid #f1f5f9', paddingTop: 6, marginTop: 2 }}>
                    <input type="checkbox" checked={!obrasExcluidas.includes('SEM')} onChange={() => toggleObraFiltro('SEM')} />
                    Sem obra
                  </label>
                </div>
              </div>
            )}
          </div>
          <input type="month" value={filterMes} onChange={e => setFilterMes(e.target.value)}
            style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '7px 12px', fontSize: 13, background: '#fff', fontFamily: 'inherit', outline: 'none' }} />
        </div>
      </div>

      {filtered.length > 0 && <TotalBar count={filtered.length} label="lançamentos" total={total} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 && <EmptyState icon="🧾" title="Nenhum lançamento" sub="Envie um comprovante PIX ou adicione manualmente" />}
        {filtered.map(d => {
          const color = obraColor(obras, d.obra_codigo)
          if (editId === d.id) return (
            <Card key={d.id} style={{ border: '2px solid #16a34a' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>Obra</label>
                  <select value={editForm.obra_codigo || ''} onChange={e => setEditForm(f => ({ ...f, obra_codigo: e.target.value || null }))}
                    style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', background: '#fafafa', appearance: 'none' }}>
                    <option value=''>— sem obra —</option>
                    {obras.map(o => <option key={o.codigo} value={o.codigo}>{o.codigo} – {o.nome}</option>)}
                  </select>
                </div>
                <FI label="Descrição / Item" value={editForm.item || ''} onChange={v => setEditForm(f => ({ ...f, item: v }))} />
                <FI label="Fornecedor" value={editForm.fornecedor || ''} onChange={v => setEditForm(f => ({ ...f, fornecedor: v }))} />
                <FI label="Valor (R$)" value={String(editForm.valor ?? '')} onChange={v => setEditForm(f => ({ ...f, valor: v }))} />
                <FI label="Data" type="date" value={editForm.data || ''} onChange={v => setEditForm(f => ({ ...f, data: v }))} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>Qualidade</label>
                  <select value={editForm.qualidade || ''} onChange={e => setEditForm(f => ({ ...f, qualidade: e.target.value }))}
                    style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', background: '#fafafa', appearance: 'none' }}>
                    <option value=''>— selecionar —</option>
                    {QUALIDADES.map(q => <option key={q} value={q}>{q}</option>)}
                    <option value='Outro'>Outro</option>
                  </select>
                </div>
                <FI label="Observação" value={editForm.observacao || ''} onChange={v => setEditForm(f => ({ ...f, observacao: v }))} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <Btn onClick={saveEdit}>✅ Salvar</Btn>
                <Btn onClick={() => setEditId(null)} outline color="#64748b">Cancelar</Btn>
              </div>
            </Card>
          )
          return (
            <Card key={d.id} style={{ padding: '14px 16px 10px 20px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: color, borderRadius: '5px 0 0 5px' }} />

              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Tag label={d.origem === 'pix' ? 'PIX' : d.origem === 'importacao' ? 'Importado' : 'Manual'} color={d.origem === 'pix' ? '#0284c7' : d.origem === 'importacao' ? '#16a34a' : '#64748b'} />
                <button onClick={() => { setEditId(d.id); setEditForm({ ...d, qualidade_outro: '' }) }} style={ibtn}>✏️</button>
                <button onClick={() => remove(d.id)} style={{ ...ibtn, color: '#e11d48' }}>🗑️</button>
              </div>

              <CampoLinha label="Obra">
                {d.obra_codigo ? `${d.obra_codigo} · ${obraMap[d.obra_codigo]?.nome || ''}` : '—'}
                {d.obras_codigos?.length > 1 && <span style={{ color: '#7c3aed', fontWeight: 700 }}> (÷{d.obras_codigos.length} obras)</span>}
              </CampoLinha>
              <CampoLinha label="Qualidade">{d.qualidade || '—'}</CampoLinha>
              <CampoLinha label="Valor">
                <b style={{ color: '#e11d48', fontSize: 15 }}>{fmt(d.valor)}</b>
                {d.obras_codigos?.length > 1 && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>(total {fmt(d.rateio_total)})</span>}
              </CampoLinha>
              <CampoLinha label="Descrição">{d.item || '—'}</CampoLinha>
              <CampoLinha label="Fornecedor">{d.fornecedor || '—'}</CampoLinha>
              <CampoLinha label="Data">{fmtDate(d.data)}</CampoLinha>
              <CampoLinha label="Observação" last>{d.observacao || '—'}</CampoLinha>
            </Card>
          )
        })}
      </div>

      <Modal open={showPreview} onClose={() => setShowPreview(false)} title="📄 Revisar dados extraídos do PIX" wide>
        {preview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#15803d' }}>
              ✅ IA extraiu os dados. Selecione a <b>obra</b> e a <b>qualidade</b>, depois confirme.
            </div>
            <DespesaForm form={preview} setForm={setPreview} obras={obras} obraMap={obraMap} />
            <Btn onClick={confirmPreview} full>✅ Confirmar e Salvar</Btn>
          </div>
        )}
      </Modal>

      <Modal open={showManual} onClose={() => setShowManual(false)} title="✍️ Lançamento Manual" wide>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <DespesaForm form={manual} setForm={setManual} obras={obras} obraMap={obraMap} />
          <Btn onClick={addManual} disabled={!manual.valor || !manual.item} full>Adicionar Despesa</Btn>
        </div>
      </Modal>

      <Modal open={showImport} onClose={() => { setShowImport(false); setImportRows(null); setImportErr(null); setImportObra('') }} title="📥 Importar Planilha de Lançamentos" wide>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#1e40af' }}>
            A planilha deve seguir o modelo padrão, com as colunas <b>Descrição, Fornecedor, Qualidade, Data, Valor</b> e <b>Observação</b>.
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6, display: 'block' }}>Obra de destino</label>
            <select value={importObra} onChange={e => setImportObra(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14 }}>
              <option value="">Selecione a obra...</option>
              {obras.map(o => <option key={o.codigo} value={o.codigo}>{o.nome}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6, display: 'block' }}>Arquivo (.xlsx)</label>
            <input ref={importFileRef} type="file" accept=".xlsx" onChange={e => handleImportFile(e.target.files[0])} style={{ width: '100%' }} />
          </div>

          {importErr && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#b91c1c' }}>{importErr}</div>}

          {importRows && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#15803d' }}>
              ✅ {importRows.length} lançamento{importRows.length > 1 ? 's' : ''} encontrado{importRows.length > 1 ? 's' : ''} na planilha, pronto{importRows.length > 1 ? 's' : ''} para importar.
            </div>
          )}

          <Btn onClick={confirmImport} disabled={!importObra || !importRows || importing} full>
            {importing ? 'Importando...' : `✅ Confirmar Importação${importRows ? ` (${importRows.length})` : ''}`}
          </Btn>
        </div>
      </Modal>
    </div>
  )
}
