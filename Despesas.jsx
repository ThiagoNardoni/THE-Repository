import { useState, useRef, useCallback, useEffect } from 'react'
import { fmt, fmtDate, parseCur, todayStr, obraColor, QUALIDADES } from '../lib/utils'
import { extractPix } from '../lib/claude'
import { saveDespesa, updateDespesa, deleteDespesa, deleteAllDespesas } from '../lib/supabase'
import { Tag, Modal, Btn, FI, Card, EmptyState, TotalBar } from '../components/UI'
import * as XLSX from 'xlsx'

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

// ── Formulário (componente estável fora do Despesas, evita perda de foco) ──
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
        <FI label="Descrição / Item *" value={form.item || ''} onChange={s('item')} span />
        <FI label="Fornecedor (quem recebeu)" value={form.fornecedor || ''} onChange={s('fornecedor')} />
        <FI label="Responsável (quem pagou)" value={form.responsavel || ''} onChange={s('responsavel')} />
        <FI label="Data" type="date" value={form.data || ''} onChange={s('data')} />
        <FI label="Observação" value={form.observacao || ''} onChange={s('observacao')} span />
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
  const [filterObra, setFilterObra] = useState('todas')
  const [filterMes, setFilterMes] = useState('')
  const [editId, setEditId] = useState(null)
  const [editForm, setEditForm] = useState({})

  const obraMap = Object.fromEntries(obras.map(o => [o.codigo, o]))
  const getQualFinal = (form) => form.qualidade === 'Outro' ? (form.qualidade_outro || '') : form.qualidade

  // Upload PIX
  const handleFile = useCallback(async (file) => {
    if (!file) return
    setUploadErr(null); setUploading(true)
    try {
      const mediaType = file.type || 'image/jpeg'
      const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file) })
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
      if (location.search.includes('opened=share') || location.search.includes('share=true')) {
        history.replaceState({}, '', '/')
        if (window.getSharedFile) {
          const file = await window.getSharedFile()
          if (file) handleFile(file)
        }
      }
    }
    checkShared()
  }, [handleFile])

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
      const d = { item: editForm.item, fornecedor: editForm.fornecedor, responsavel: editForm.responsavel, qualidade: getQualFinal(editForm), valor: parseCur(editForm.valor), data: editForm.data, observacao: editForm.observacao, obra_codigo: editForm.obra_codigo }
      await updateDespesa(editId, d)
      setDespesas(p => p.map(x => x.id === editId ? { ...x, ...d } : x)); setEditId(null)
    } catch (e) { alert('Erro: ' + e.message) }
  }

  const remove = async (id) => {
    if (!confirm('Remover lançamento?')) return
    await deleteDespesa(id); setDespesas(p => p.filter(x => x.id !== id))
  }

  const removeAll = async () => {
    if (despesas.length === 0) return
    const ok1 = confirm(`⚠️ Isso vai apagar TODOS os ${despesas.length} lançamentos de TODAS as obras, de todos os usuários. Essa ação não pode ser desfeita.\n\nDeseja continuar?`)
    if (!ok1) return
    const digitado = prompt('Para confirmar, digite EXCLUIR em maiúsculas:')
    if (digitado !== 'EXCLUIR') { alert('Cancelado.'); return }
    try {
      await deleteAllDespesas()
      setDespesas([])
    } catch (e) { alert('Erro ao excluir tudo: ' + e.message) }
  }

  const exportExcel = () => {
    const wb = XLSX.utils.book_new()
    const allObras = [...new Set(despesas.map(d => d.obra_codigo || 'SEM'))]
    allObras.forEach(cod => {
      const rows = despesas.filter(d => (d.obra_codigo || 'SEM') === cod)
      const wsData = [['Descrição', 'Fornecedor', 'Qualidade', 'Data', 'Valor', 'Observação']]
      rows.forEach(d => wsData.push([d.item || '', d.fornecedor || '', d.qualidade || '', fmtDate(d.data), d.valor || 0, d.observacao || '']))
      if (rows.length > 0) wsData.push(['', '', '', 'TOTAL', { f: `SUM(E2:E${rows.length + 1})` }, ''])
      const ws = XLSX.utils.aoa_to_sheet(wsData)
      ws['!cols'] = [{ wch: 24 }, { wch: 22 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 28 }]
      for (let r = 1; r <= rows.length + 1; r++) {
        const ref = XLSX.utils.encode_cell({ r, c: 4 })
        if (ws[ref]) ws[ref].z = '"R$" #,##0.00'
      }
      XLSX.utils.book_append_sheet(wb, ws, (obraMap[cod]?.nome || cod).substring(0, 31))
    })
    const resumo = [['Obra', 'Qtd', 'Total (R$)'], ...allObras.map(cod => { const rows = despesas.filter(d => (d.obra_codigo || 'SEM') === cod); return [obraMap[cod]?.nome || cod, rows.length, rows.reduce((s, d) => s + (d.valor || 0), 0)] })]
    const wsR = XLSX.utils.aoa_to_sheet(resumo)
    wsR['!cols'] = [{ wch: 20 }, { wch: 8 }, { wch: 16 }]
    for (let r = 1; r <= allObras.length; r++) {
      const ref = XLSX.utils.encode_cell({ r, c: 2 })
      if (wsR[ref]) wsR[ref].z = '"R$" #,##0.00'
    }
    XLSX.utils.book_append_sheet(wb, wsR, 'Resumo')
    XLSX.writeFile(wb, `Despesas_${todayStr()}.xlsx`)
  }

  const filtered = despesas.filter(d => {
    const obraOk = filterObra === 'todas' || (d.obra_codigo || 'SEM') === filterObra
    const mesOk = !filterMes || d.data?.startsWith(filterMes)
    return obraOk && mesOk
  })
  const total = filtered.reduce((s, d) => s + (d.valor || 0), 0)
  const ibtn = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 9px', cursor: 'pointer', fontSize: 14 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div onClick={() => fileRef.current?.click()} onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }} onDragOver={e => e.preventDefault()}
        style={{ border: '2.5px dashed #86efac', borderRadius: 18, background: '#f0fdf4', padding: '24px 20px', textAlign: 'center', cursor: 'pointer' }}>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
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
        <Btn onClick={removeAll} outline color="#e11d48" small disabled={despesas.length === 0}>🗑️ Excluir Tudo</Btn>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <select value={filterObra} onChange={e => setFilterObra(e.target.value)}
            style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '7px 12px', fontSize: 13, background: '#fff', fontFamily: 'inherit', outline: 'none' }}>
            <option value="todas">Todas as obras</option>
            {obras.map(o => <option key={o.codigo} value={o.codigo}>{o.codigo} – {o.nome}</option>)}
            <option value="SEM">Sem obra</option>
          </select>
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
            <Card key={d.id} style={{ display: 'flex', gap: 14, padding: '14px 16px 14px 20px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: color, borderRadius: '5px 0 0 5px' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                  {d.obra_codigo && <Tag label={`${d.obra_codigo} · ${obraMap[d.obra_codigo]?.nome || ''}`} color={color} />}
                  {d.qualidade && <Tag label={d.qualidade} color="#f59e0b" />}
                  {d.obras_codigos?.length > 1 && <Tag label={`÷${d.obras_codigos.length} obras`} color="#7c3aed" />}
                  <Tag label={d.origem === 'pix' ? 'PIX' : 'Manual'} color={d.origem === 'pix' ? '#0284c7' : '#64748b'} />
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 2 }}>{d.item || '—'}</div>
                {d.fornecedor && <div style={{ fontSize: 13, color: '#64748b' }}>👤 {d.fornecedor}</div>}
                {d.observacao && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>💬 {d.observacao}</div>}
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{fmtDate(d.data)}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', minWidth: 90 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#e11d48' }}>{fmt(d.valor)}</div>
                {d.obras_codigos?.length > 1 && <div style={{ fontSize: 11, color: '#94a3b8' }}>total {fmt(d.rateio_total)}</div>}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={() => { setEditId(d.id); setEditForm({ ...d, qualidade_outro: '' }) }} style={ibtn}>✏️</button>
                  <button onClick={() => remove(d.id)} style={{ ...ibtn, color: '#e11d48' }}>🗑️</button>
                </div>
              </div>
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
    </div>
  )
}
