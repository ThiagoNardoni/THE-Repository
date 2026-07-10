import { useState } from 'react'
import { fmt, fmtDate, parseCur, todayStr, obraColor } from '../lib/utils'
import { saveMaoDeObra, updateMaoDeObra, deleteMaoDeObra } from '../lib/supabase'
import { Tag, Modal, Btn, FI, FS, G2, Card, EmptyState, TotalBar, SectionHeader } from '../components/UI'

const emptyForm = { funcionario: '', funcao: '', obra_codigo: '', valor: '', tipo_pagamento: 'Diária', dias: '1', data: todayStr(), observacao: '' }
const FUNCOES = ['Pedreiro', 'Servente', 'Eletricista', 'Encanador', 'Carpinteiro', 'Pintor', 'Armador', 'Mestre de obras', 'Ajudante', 'Outro']
const TIPOS_PAG = ['Diária', 'Empreitada', 'Mensalista', 'Por hora', 'Outro']

export default function MaoDeObra({ maoDeObra, setMaoDeObra, obras }) {
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [filterObra, setFilterObra] = useState('todas')
  const [filterMes, setFilterMes] = useState('')

  const obraMap = Object.fromEntries(obras.map(o => [o.codigo, o]))

  const save = async () => {
    if (!form.valor || !form.funcionario) return
    try {
      const d = { ...form, valor: parseCur(form.valor), dias: parseFloat(form.dias) || 1 }
      if (editId) {
        await updateMaoDeObra(editId, d)
        setMaoDeObra(p => p.map(m => m.id === editId ? { ...m, ...d } : m))
      } else {
        const saved = await saveMaoDeObra(d)
        setMaoDeObra(p => [saved, ...p])
      }
      setForm(emptyForm); setShowModal(false); setEditId(null)
    } catch (e) { alert('Erro: ' + e.message) }
  }

  const remove = async (id) => {
    if (!confirm('Remover registro?')) return
    await deleteMaoDeObra(id)
    setMaoDeObra(p => p.filter(m => m.id !== id))
  }

  const filtered = maoDeObra.filter(m => {
    const obraOk = filterObra === 'todas' || m.obra_codigo === filterObra
    const mesOk = !filterMes || m.data?.startsWith(filterMes)
    return obraOk && mesOk
  })
  const total = filtered.reduce((s, m) => s + (m.valor || 0), 0)

  // stats por funcionário
  const porFunc = {}
  filtered.forEach(m => {
    if (!porFunc[m.funcionario]) porFunc[m.funcionario] = { total: 0, registros: 0, funcao: m.funcao }
    porFunc[m.funcionario].total += m.valor || 0
    porFunc[m.funcionario].registros++
  })

  const ibtn = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 9px', cursor: 'pointer', fontSize: 14 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <Btn onClick={() => { setForm(emptyForm); setEditId(null); setShowModal(true) }}>+ Novo Registro</Btn>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={filterObra} onChange={e => setFilterObra(e.target.value)}
            style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '7px 12px', fontSize: 13, background: '#fff', fontFamily: 'inherit', outline: 'none' }}>
            <option value="todas">Todas as obras</option>
            {obras.map(o => <option key={o.codigo} value={o.codigo}>{o.codigo} – {o.nome}</option>)}
          </select>
          <input type="month" value={filterMes} onChange={e => setFilterMes(e.target.value)}
            style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '7px 12px', fontSize: 13, background: '#fff', fontFamily: 'inherit', outline: 'none' }} />
        </div>
      </div>

      {filtered.length > 0 && <TotalBar count={filtered.length} label="registros" total={total} />}

      {/* Resumo por funcionário */}
      {Object.keys(porFunc).length > 0 && (
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>👷 Por Funcionário</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {Object.entries(porFunc).sort((a, b) => b[1].total - a[1].total).map(([nome, st]) => (
              <Card key={nome} style={{ padding: '12px 14px', borderLeft: '4px solid #d97706' }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', marginBottom: 2 }}>{nome}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{st.funcao}</div>
                <div style={{ fontWeight: 800, color: '#d97706', fontSize: 16 }}>{fmt(st.total)}</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>{st.registros} registro{st.registros !== 1 ? 's' : ''}</div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Lista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 && <EmptyState icon="👷" title="Nenhum registro de mão de obra" sub="Clique em + Novo Registro para adicionar" />}
        {filtered.map(m => {
          const color = obraColor(obras, m.obra_codigo)
          if (editId === m.id) return (
            <Card key={m.id} style={{ border: '2px solid #d97706' }}>
              <MoForm form={editForm || form} setForm={setEditForm} obras={obras} />
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <Btn onClick={save} color="#d97706">✅ Salvar</Btn>
                <Btn onClick={() => setEditId(null)} outline color="#64748b">Cancelar</Btn>
              </div>
            </Card>
          )
          return (
            <Card key={m.id} style={{ display: 'flex', gap: 14, padding: '14px 16px 14px 20px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: '#d97706', borderRadius: '5px 0 0 5px' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                  {m.obra_codigo && <Tag label={m.obra_codigo + (obraMap[m.obra_codigo] ? ' · ' + obraMap[m.obra_codigo].nome : '')} color={color} />}
                  {m.funcao && <Tag label={m.funcao} color="#d97706" />}
                  {m.tipo_pagamento && <Tag label={m.tipo_pagamento} color="#64748b" />}
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 2 }}>👷 {m.funcionario}</div>
                {m.dias > 1 && <div style={{ fontSize: 13, color: '#64748b' }}>{m.dias} dias</div>}
                {m.observacao && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>💬 {m.observacao}</div>}
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{fmtDate(m.data)}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', minWidth: 90 }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#d97706' }}>{fmt(m.valor)}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={() => { setEditId(m.id); setForm({ ...m, valor: String(m.valor), dias: String(m.dias || 1) }) }} style={ibtn}>✏️</button>
                  <button onClick={() => remove(m.id)} style={{ ...ibtn, color: '#e11d48' }}>🗑️</button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="👷 Registro de Mão de Obra">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <G2>
            <FI label="Funcionário *" value={form.funcionario} onChange={v => setForm(f => ({ ...f, funcionario: v }))} />
            <FS label="Função" value={form.funcao} onChange={v => setForm(f => ({ ...f, funcao: v }))} options={FUNCOES} />
            <FS label="Obra" value={form.obra_codigo} onChange={v => setForm(f => ({ ...f, obra_codigo: v }))} options={obras.map(o => ({ v: o.codigo, l: `${o.codigo} – ${o.nome}` }))} />
            <FS label="Tipo de Pagamento" value={form.tipo_pagamento} onChange={v => setForm(f => ({ ...f, tipo_pagamento: v }))} options={TIPOS_PAG} />
            <FI label="Valor Total (R$) *" value={form.valor} onChange={v => setForm(f => ({ ...f, valor: v }))} placeholder="500,00" />
            <FI label="Dias / Qtd" value={form.dias} onChange={v => setForm(f => ({ ...f, dias: v }))} />
            <FI label="Data" type="date" value={form.data} onChange={v => setForm(f => ({ ...f, data: v }))} />
            <FI label="Observação" value={form.observacao} onChange={v => setForm(f => ({ ...f, observacao: v }))} span />
          </G2>
          <Btn onClick={save} disabled={!form.valor || !form.funcionario} full color="#d97706">Adicionar Registro</Btn>
        </div>
      </Modal>
    </div>
  )
}
