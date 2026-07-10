import { useState, useEffect } from 'react'
import { getDespesas, getEntradas } from './lib/supabase'
import { OBRAS_DEFAULT } from './lib/utils'
import Dashboard from './pages/Dashboard'
import Despesas from './pages/Despesas'
import ResumoMensal from './pages/ResumoMensal'
import FluxoCaixa from './pages/FluxoCaixa'

const TABS = [
  { id: 'dashboard', label: '🏠 Dashboard' },
  { id: 'despesas',  label: '🧾 Despesas' },
  { id: 'resumo',    label: '📅 Resumo Mensal' },
  { id: 'fluxo',     label: '💰 Fluxo de Caixa' },
]

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [despesas, setDespesas] = useState([])
  const [entradas, setEntradas] = useState([])
  const [obras] = useState(OBRAS_DEFAULT)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [d, e] = await Promise.all([getDespesas(), getEntradas()])
        setDespesas(d)
        setEntradas(e)
      } catch (err) {
        setError(err.message)
      }
      setLoading(false)
    }
    load()
  }, [])

  const activeTab = TABS.find(t => t.id === tab)

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff', flexDirection: 'column', gap: 16 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 42, height: 42, background: '#e8f5e9', border: '1.5px solid #a5d6a7', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontWeight: 900, fontSize: 13, color: '#1b5e20', letterSpacing: '-0.5px' }}>THE</span>
      </div>
      <div style={{ width: 32, height: 32, border: '3px solid #e8f5e9', borderTopColor: '#4caf50', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <div style={{ color: '#4caf50', fontWeight: 700, fontSize: 14 }}>Carregando dados...</div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff', flexDirection: 'column', gap: 12, padding: 20 }}>
      <div style={{ fontWeight: 800, color: '#e11d48', fontSize: 18 }}>Erro ao conectar ao banco</div>
      <div style={{ color: '#64748b', fontSize: 14, textAlign: 'center', maxWidth: 400 }}>{error}</div>
      <button onClick={() => window.location.reload()} style={{ marginTop: 8, padding: '10px 24px', background: '#e8f5e9', color: '#1b5e20', border: '1.5px solid #a5d6a7', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
        Tentar novamente
      </button>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; }
        input:focus, select:focus { outline: none; }
        button { transition: opacity .15s; }
        button:active { transform: scale(.97); }
        body { background: #ffffff; }
      `}</style>

      {/* Header */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid #e8f5e9', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: '#e8f5e9', border: '1.5px solid #a5d6a7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontWeight: 900, fontSize: 13, color: '#1b5e20', letterSpacing: '-0.5px' }}>THE</span>
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16, color: '#1b5e20', lineHeight: 1.2 }}>THE Engenharia</div>
                <div style={{ fontSize: 11, color: '#81c784', fontWeight: 500 }}>Gestão de Obras</div>
              </div>
            </div>
            <nav style={{ display: 'flex', gap: 2 }}>
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  style={{ padding: '7px 14px', borderRadius: 10, fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: tab === t.id ? '#e8f5e9' : 'transparent', color: tab === t.id ? '#1b5e20' : '#64748b', whiteSpace: 'nowrap', boxShadow: tab === t.id ? 'inset 0 0 0 1.5px #a5d6a7' : 'none' }}>
                  {t.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#1b5e20' }}>{activeTab?.label}</h1>
        </div>
        <div style={{ animation: 'fadeIn .2s ease' }} key={tab}>
          {tab === 'dashboard' && <Dashboard despesas={despesas} entradas={entradas} obras={obras} />}
          {tab === 'despesas'  && <Despesas despesas={despesas} setDespesas={setDespesas} obras={obras} />}
          {tab === 'resumo'    && <ResumoMensal despesas={despesas} obras={obras} />}
          {tab === 'fluxo'     && <FluxoCaixa entradas={entradas} setEntradas={setEntradas} despesas={despesas} obras={obras} />}
        </div>
      </div>
    </div>
  )
}
