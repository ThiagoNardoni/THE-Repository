import { useState } from 'react'
import { fmt, fmtDate, parseCur, todayStr, obraColor } from '../lib/utils'
import { saveEntrada, updateEntrada, deleteEntrada } from '../lib/supabase'
import { Tag, Modal, Btn, FI, FS, G2, Card, EmptyState, SectionHeader } from '../components/UI'

const emptyForm = { descricao: '', valor: '', data: todayStr(), obra_codigo: '', tipo: 'Recebimento de cliente', observacao: '' }
const TIPOS = ['Recebimento de cliente', 'Aporte próprio', 'Financiamento', 'Outro']

export default function FluxoCaixa({ entradas, setEntradas, despesas, obras }) {
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [filterMes, setFilterMes] = useState('')

  const obraMap = Object.fromEntries(obras.map(o => [o.codigo, o]))

  const totalEntradas = entradas.reduce((s, e) => s + (e.valor || 0), 0)
  const totalSaidas = despesas.reduce((s, d) => s + (d.valor || 0), 0)
  const saldo = totalEntradas - totalSaidas

  const save = async () => {
    if (!form.valor || !form.descricao) return
    try {
      const d = { ...form, valor: parseCur(form.valor) }
      if (editId) {
        await updateEntrada(editId, d)
        setEntradas(p => p.map(e => e.id === editId ? { ...e, ...d } : e))
      } else {
        const saved = await saveEntrada(d)
        setEntradas(p => [saved, ...p])
      }
      setForm(emptyForm); setShowModal(false); setEditId(null)
    } catch (e) { alert('Erro: ' + e.message) }
  }

  const remove = async (id) => {
    if (!confirm('Remover entrada?')) return
    await deleteEntrada(id)
    setEntradas(p => p.filter(e => e.id !== id))
  }

  const filteredEntradas = entradas.filter(e => !filterMes || e.data?.startsWith(filterMes))
  const filteredSaidas = despesas.filter(d => !filterMes || d.data?.startsWith(filterMes))
  const filteredSaldo = filteredEntradas.reduce((s, e) => s + (e.valor || 0), 0) - filteredSaidas.reduce((s, d) => s + (d.valor || 0), 0)

  const ibtn = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 9px', cursor: 'pointer', fontSize: 14 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <Card style={{ borderTop: '4px solid #16a34a' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Total Entradas</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#16a34a' }}>{fmt(totalEntradas)}</div>
        </Card>
        <Card style={{ borderTop: '4px solid #e11d48' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Total Saídas</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#e11d48' }}>{fmt(totalSaidas)}</div>
        </Card>
        <Card style={{ borderTop: `4px solid ${saldo >= 0 ? '#16a34a' : '#e11d48'}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Saldo</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: saldo >= 0 ? '#16a34a' : '#e11d48' }}>{fmt(saldo)}</div>
        </Card>
      </div>

      {/* Filtro mês */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Mês:</span>
        <input type="month" value={filterMes} onChange={e => setFilterMes(e.target.value)}
          style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '7px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
        {filterMes && (
          <>
            <button onClick={() => setFilterMes('')}
              style={{ fontSize: 12, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>✕ Limpar</button>
            <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 800, color: filteredSaldo >= 0 ? '#16a34a' : '#e11d48' }}>
              Saldo do mês: {fmt(filteredSaldo)}
            </span>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Entradas */}
        <div>
          <SectionHeader title="💰 Entradas" action={<Btn onClick={() => { setForm(emptyForm); setEditId(null); setShowModal(true) }} small>+ Nova Entrada</Btn>} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredEntradas.length === 0 && <EmptyState icon="💰" title="Sem entradas" />}
            {filteredEntradas.map(e => (
              <Card key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderLeft: '4px solid #16a34a' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 3 }}>{e.descricao}</div>
                  {e.obra_codigo && <Tag label={`${e.obra_codigo} · ${obraMap[e.obra_codigo]?.nome || ''}`} color={obraColor(obras, e.obra_codigo)} />}
                  {e.tipo && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{e.tipo}</div>}
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{fmtDate(e.data)}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <div style={{ fontWeight: 800, color: '#16a34a', fontSize: 15, whiteSpace: 'nowrap' }}>{fmt(e.valor)}</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => { setEditId(e.id); setForm({ ...e, valor: String(e.valor) }); setShowModal(true) }} style={ibtn}>✏️</button>
                    <button onClick={() => remove(e.id)} style={{ ...ibtn, color: '#e11d48' }}>🗑️</button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Saídas */}
        <div>
          <SectionHeader title="🧾 Saídas (Despesas)" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredSaidas.length === 0 && <EmptyState icon="🧾" title="Sem saídas" />}
            {filteredSaidas.slice(0, 15).map(d => {
              const color = obraColor(obras, d.obra_codigo)
              return (
                <Card key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderLeft: '4px solid #e11d48' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 3 }}>{d.item || '—'}</div>
                    {d.obra_codigo && <Tag label={d.obra_codigo} color={color} />}
                    {d.qualidade && <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, marginLeft: 6 }}>{d.qualidade}</span>}
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{fmtDate(d.data)}</div>
                  </div>
                  <div style={{ fontWeight: 800, color: '#e11d48', fontSize: 15, whiteSpace: 'nowrap' }}>{fmt(d.valor)}</div>
                </Card>
              )
            })}
            {filteredSaidas.length > 15 && (
              <div style={{ textAlign: 'center', fontSize: 13, color: '#94a3b8', padding: 8 }}>
                + {filteredSaidas.length - 15} itens — veja em Despesas
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editId ? '✏️ Editar Entrada' : '💰 Nova Entrada'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <G2>
            <FI label="Descrição *" value={form.descricao} onChange={v => setForm(f => ({ ...f, descricao: v }))} span />
            <FI label="Valor (R$) *" value={form.valor} onChange={v => setForm(f => ({ ...f, valor: v }))} placeholder="10000,00" />
            <FI label="Data" type="date" value={form.data} onChange={v => setForm(f => ({ ...f, data: v }))} />
            <FS label="Obra" value={form.obra_codigo} onChange={v => setForm(f => ({ ...f, obra_codigo: v }))} options={obras.map(o => ({ v: o.codigo, l: `${o.codigo} – ${o.nome}` }))} />
            <FS label="Tipo" value={form.tipo} onChange={v => setForm(f => ({ ...f, tipo: v }))} options={TIPOS} />
            <FI label="Observação" value={form.observacao} onChange={v => setForm(f => ({ ...f, observacao: v }))} span />
          </G2>
          <Btn onClick={save} disabled={!form.valor || !form.descricao} full>{editId ? 'Salvar' : 'Adicionar Entrada'}</Btn>
        </div>
      </Modal>
    </div>
  )
}
