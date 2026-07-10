import { useMemo, useState } from 'react'
import { fmt, fmtDate, obraColor, QUALIDADES } from '../lib/utils'
import { Card, StatCard, Tag } from '../components/UI'

export default function Dashboard({ despesas, entradas, obras }) {
  const [filterObra, setFilterObra] = useState('todas')
  const [filterQual, setFilterQual] = useState('todas')
  const [filterMes, setFilterMes] = useState('')

  const obraMap = useMemo(() => Object.fromEntries(obras.map(o => [o.codigo, o])), [obras])

  const filtered = useMemo(() => despesas.filter(d => {
    const obraOk = filterObra === 'todas' || d.obra_codigo === filterObra
    const qualOk = filterQual === 'todas' || d.qualidade === filterQual
    const mesOk = !filterMes || d.data?.startsWith(filterMes)
    return obraOk && qualOk && mesOk
  }), [despesas, filterObra, filterQual, filterMes])

  const totalDespesas = filtered.reduce((s, d) => s + (d.valor || 0), 0)
  const totalEntradas = entradas.reduce((s, e) => s + (e.valor || 0), 0)
  const saldo = totalEntradas - totalDespesas

  // Stats por obra (filtrado)
  const obraStats = useMemo(() => {
    const stats = {}
    obras.forEach(o => { stats[o.codigo] = { total: 0, count: 0 } })
    filtered.forEach(d => {
      if (d.obra_codigo && stats[d.obra_codigo]) {
        stats[d.obra_codigo].total += d.valor || 0
        stats[d.obra_codigo].count++
      }
    })
    return stats
  }, [filtered, obras])

  // Gastos por mês
  const porMes = useMemo(() => {
    const map = {}
    filtered.forEach(d => {
      if (!d.data) return
      const key = d.data.substring(0, 7)
      map[key] = (map[key] || 0) + (d.valor || 0)
    })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-6)
  }, [filtered])

  // Gastos por qualidade
  const porQual = useMemo(() => {
    const map = {}
    filtered.forEach(d => {
      const q = d.qualidade || 'Sem categoria'
      map[q] = (map[q] || 0) + (d.valor || 0)
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [filtered])

  const maxMes = Math.max(...porMes.map(([, v]) => v), 1)
  const maxQual = Math.max(...porQual.map(([, v]) => v), 1)
  const mNames = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

  // Recentes
  const recentes = useMemo(() => filtered.slice(0, 5), [filtered])

  // Qualidades únicas nos dados
  const qualsUsadas = useMemo(() => [...new Set(despesas.map(d => d.qualidade).filter(Boolean))], [despesas])

  const QUAL_COLORS = ['#16a34a','#0284c7','#7c3aed','#d97706','#e11d48','#0891b2','#65a30d','#c2410c']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Filtros */}
      <div style={{ background: '#f8fafc', borderRadius: 14, padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>🔍 Filtros:</span>
        <select value={filterObra} onChange={e => setFilterObra(e.target.value)}
          style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '7px 12px', fontSize: 13, background: '#fff', fontFamily: 'inherit', outline: 'none' }}>
          <option value="todas">Todas as obras</option>
          {obras.map(o => <option key={o.codigo} value={o.codigo}>{o.codigo} – {o.nome}</option>)}
        </select>
        <select value={filterQual} onChange={e => setFilterQual(e.target.value)}
          style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '7px 12px', fontSize: 13, background: '#fff', fontFamily: 'inherit', outline: 'none' }}>
          <option value="todas">Todas as qualidades</option>
          {QUALIDADES.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
        <input type="month" value={filterMes} onChange={e => setFilterMes(e.target.value)}
          style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '7px 12px', fontSize: 13, background: '#fff', fontFamily: 'inherit', outline: 'none' }} />
        {(filterObra !== 'todas' || filterQual !== 'todas' || filterMes) && (
          <button onClick={() => { setFilterObra('todas'); setFilterQual('todas'); setFilterMes('') }}
            style={{ fontSize: 12, color: '#e11d48', background: 'none', border: '1px solid #fecdd3', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
            ✕ Limpar filtros
          </button>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        <StatCard label="Total Entradas" value={fmt(totalEntradas)} icon="💰" color="#16a34a" />
        <StatCard label="Total Despesas" value={fmt(totalDespesas)} icon="🧾" color="#e11d48" sub={filtered.length + ' lançamentos'} />
        <StatCard label="Saldo" value={fmt(saldo)} icon={saldo >= 0 ? '📈' : '📉'} color={saldo >= 0 ? '#16a34a' : '#e11d48'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Por obra */}
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>📊 Por Obra</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {obras.map(o => {
              const st = obraStats[o.codigo] || { total: 0, count: 0 }
              const color = obraColor(obras, o.codigo)
              const pct = totalDespesas > 0 ? (st.total / totalDespesas) * 100 : 0
              return (
                <Card key={o.codigo} style={{ padding: '12px 16px', borderLeft: `4px solid ${color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div>
                      <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>{o.codigo}</span>
                      <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>{o.nome}</span>
                    </div>
                    <span style={{ fontWeight: 800, color, fontSize: 14 }}>{fmt(st.total)}</span>
                  </div>
                  <div style={{ background: '#f1f5f9', borderRadius: 99, height: 5, overflow: 'hidden', marginBottom: 3 }}>
                    <div style={{ background: color, width: `${pct.toFixed(1)}%`, height: '100%', borderRadius: 99, transition: 'width .4s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
                    <span>{pct.toFixed(1)}% do total</span>
                    <span>{st.count} lançamentos</span>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Gráfico mensal */}
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>📅 Gastos por Mês</h2>
            <Card>
              {porMes.length === 0
                ? <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px 0', fontSize: 13 }}>Sem dados</div>
                : <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
                    {porMes.map(([mes, val]) => {
                      const h = Math.max((val / maxMes) * 100, 4)
                      const [y, m] = mes.split('-')
                      return (
                        <div key={mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textAlign: 'center' }}>{fmt(val).replace('R$', '').trim()}</div>
                          <div style={{ width: '100%', height: `${h}px`, background: '#16a34a', borderRadius: '4px 4px 0 0', minHeight: 4 }} />
                          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{mNames[parseInt(m) - 1]}</div>
                        </div>
                      )
                    })}
                  </div>
              }
            </Card>
          </div>

          {/* Gráfico por qualidade */}
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>🏷️ Por Qualidade</h2>
            <Card>
              {porQual.length === 0
                ? <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px 0', fontSize: 13 }}>Sem dados</div>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {porQual.map(([qual, val], i) => {
                      const pct = (val / maxQual) * 100
                      const color = QUAL_COLORS[i % QUAL_COLORS.length]
                      return (
                        <div key={qual}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>{qual}</span>
                            <span style={{ color, fontWeight: 800 }}>{fmt(val)}</span>
                          </div>
                          <div style={{ background: '#f1f5f9', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                            <div style={{ background: color, width: `${pct.toFixed(1)}%`, height: '100%', borderRadius: 99, transition: 'width .4s' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
              }
            </Card>
          </div>
        </div>
      </div>

      {/* Últimos lançamentos */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>🕐 Últimos Lançamentos</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recentes.length === 0
            ? <Card><div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Sem lançamentos</div></Card>
            : recentes.map(d => {
                const color = obraColor(obras, d.obra_codigo)
                return (
                  <Card key={d.id} style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                        {d.obra_codigo && <Tag label={d.obra_codigo} color={color} />}
                        {d.qualidade && <Tag label={d.qualidade} color="#f59e0b" />}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.item || d.fornecedor || '—'}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtDate(d.data)}</div>
                    </div>
                    <div style={{ fontWeight: 800, color: '#e11d48', whiteSpace: 'nowrap' }}>{fmt(d.valor)}</div>
                  </Card>
                )
              })
          }
        </div>
      </div>
    </div>
  )
}
