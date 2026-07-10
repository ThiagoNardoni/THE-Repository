import { useMemo, useState } from 'react'
import { fmt, obraColor, monthLabel, QUALIDADES } from '../lib/utils'
import { Card, EmptyState } from '../components/UI'

export default function ResumoMensal({ despesas, obras }) {
  const [selectedObra, setSelectedObra] = useState('todas')
  const [selectedMes, setSelectedMes] = useState('')

  const obraMap = Object.fromEntries(obras.map(o => [o.codigo, o]))

  const data = useMemo(() => {
    const map = {}
    despesas.forEach(d => {
      if (!d.data) return
      const mes = d.data.substring(0, 7)
      const obra = d.obra_codigo || 'SEM'
      if (!map[mes]) map[mes] = {}
      if (!map[mes][obra]) map[mes][obra] = { total: 0, qualidades: {} }
      map[mes][obra].total += d.valor || 0
      const q = d.qualidade || 'Sem categoria'
      map[mes][obra].qualidades[q] = (map[mes][obra].qualidades[q] || 0) + (d.valor || 0)
    })
    return map
  }, [despesas])

  const meses = Object.keys(data).sort((a, b) => b.localeCompare(a))
  const allObras = [...new Set(despesas.map(d => d.obra_codigo || 'SEM').filter(Boolean))]

  const filteredMeses = meses
    .filter(mes => !selectedMes || mes === selectedMes)
    .map(mes => {
      const obrasNoMes = selectedObra === 'todas'
        ? Object.entries(data[mes] || {})
        : [[selectedObra, data[mes]?.[selectedObra] || { total: 0, qualidades: {} }]]
      const totalMes = obrasNoMes.reduce((s, [, v]) => s + v.total, 0)
      return { mes, obrasNoMes, totalMes }
    }).filter(m => m.totalMes > 0)

  const totalGeral = filteredMeses.reduce((s, m) => s + m.totalMes, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Filtros */}
      <div style={{ background: '#f8fafc', borderRadius: 14, padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>🔍 Filtrar:</span>
        <select value={selectedObra} onChange={e => setSelectedObra(e.target.value)}
          style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '7px 12px', fontSize: 13, background: '#fff', fontFamily: 'inherit', outline: 'none' }}>
          <option value="todas">Todas as obras</option>
          {allObras.map(c => <option key={c} value={c}>{c} – {obraMap[c]?.nome || c}</option>)}
        </select>
        <input type="month" value={selectedMes} onChange={e => setSelectedMes(e.target.value)}
          style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '7px 12px', fontSize: 13, background: '#fff', fontFamily: 'inherit', outline: 'none' }} />
        {(selectedObra !== 'todas' || selectedMes) && (
          <button onClick={() => { setSelectedObra('todas'); setSelectedMes('') }}
            style={{ fontSize: 12, color: '#e11d48', background: 'none', border: '1px solid #fecdd3', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
            ✕ Limpar
          </button>
        )}
        {totalGeral > 0 && (
          <span style={{ marginLeft: 'auto', fontWeight: 800, color: '#e11d48', fontSize: 15 }}>
            Total: {fmt(totalGeral)}
          </span>
        )}
      </div>

      {filteredMeses.length === 0 && (
        <EmptyState icon="📅" title="Sem dados" sub="Adicione lançamentos para ver o resumo mensal" />
      )}

      {filteredMeses.map(({ mes, obrasNoMes, totalMes }) => {
        const [y, m] = mes.split('-')
        return (
          <div key={mes}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{monthLabel(y, m)}</h2>
              <span style={{ fontWeight: 800, color: '#e11d48', fontSize: 17 }}>{fmt(totalMes)}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {obrasNoMes.map(([cod, vals]) => {
                const color = obraColor(obras, cod)
                const obra = obraMap[cod]
                const quals = Object.entries(vals.qualidades).sort((a, b) => b[1] - a[1])
                return (
                  <Card key={cod} style={{ borderTop: `4px solid ${color}`, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 15 }}>{cod}</span>
                        {obra && <div style={{ fontSize: 11, color: '#94a3b8' }}>{obra.nome}</div>}
                      </div>
                      <span style={{ fontWeight: 800, color, fontSize: 16 }}>{fmt(vals.total)}</span>
                    </div>
                    {quals.length > 0 && (
                      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {quals.map(([q, v]) => (
                          <div key={q} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                            <span style={{ color: '#64748b' }}>{q}</span>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>{fmt(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
