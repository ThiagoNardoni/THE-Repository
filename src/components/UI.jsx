import { fmt } from '../lib/utils'

export const Tag = ({ label, color = '#64748b' }) => (
  <span style={{ background: color + '1a', color, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700, display: 'inline-block', whiteSpace: 'nowrap' }}>
    {label}
  </span>
)

export const Modal = ({ open, onClose, title, children, wide }) => {
  if (!open) return null
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 24px 60px rgba(0,0,0,.2)', width: '100%', maxWidth: wide ? 720 : 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px 14px', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <span style={{ fontWeight: 800, fontSize: 17, color: '#0f172a' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '20px 24px' }}>{children}</div>
      </div>
    </div>
  )
}

export const Btn = ({ children, onClick, color = '#16a34a', disabled, outline, small, full, danger }) => {
  const bg = danger ? '#e11d48' : outline ? 'transparent' : disabled ? '#e2e8f0' : color
  const fg = danger ? '#fff' : outline ? color : disabled ? '#94a3b8' : '#fff'
  const border = outline ? `2px solid ${color}` : 'none'
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background: bg, color: fg, border, borderRadius: 10, padding: small ? '6px 14px' : '10px 22px', fontWeight: 700, fontSize: small ? 13 : 14, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', width: full ? '100%' : undefined, transition: 'opacity .15s', whiteSpace: 'nowrap' }}
      onMouseOver={e => { if (!disabled) e.currentTarget.style.opacity = '.85' }}
      onMouseOut={e => { e.currentTarget.style.opacity = '1' }}>
      {children}
    </button>
  )
}

export const FI = ({ label, value, onChange, type = 'text', placeholder, span, readOnly }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: span ? '1 / -1' : undefined }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</label>
    <input type={type} value={value ?? ''} onChange={e => onChange?.(e.target.value)} placeholder={placeholder} readOnly={readOnly}
      style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', color: '#0f172a', background: readOnly ? '#f8fafc' : '#fafafa', width: '100%' }}
      onFocus={e => !readOnly && (e.target.style.borderColor = '#16a34a')}
      onBlur={e => (e.target.style.borderColor = '#e2e8f0')} />
  </div>
)

export const FS = ({ label, value, onChange, options, span, ph = '— selecionar —' }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: span ? '1 / -1' : undefined }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</label>
    <select value={value ?? ''} onChange={e => onChange?.(e.target.value)}
      style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', color: value ? '#0f172a' : '#94a3b8', background: '#fafafa', appearance: 'none', width: '100%' }}
      onFocus={e => (e.target.style.borderColor = '#16a34a')}
      onBlur={e => (e.target.style.borderColor = '#e2e8f0')}>
      <option value=''>{ph}</option>
      {options.map(o => <option key={o.v ?? o} value={o.v ?? o}>{o.l ?? o}</option>)}
    </select>
  </div>
)

export const G2 = ({ children, cols = 2 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>{children}</div>
)

export const Card = ({ children, style }) => (
  <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,.06)', padding: 20, ...style }}>
    {children}
  </div>
)

export const Spinner = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
    <div style={{ width: 32, height: 32, border: '4px solid #e2e8f0', borderTopColor: '#16a34a', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
  </div>
)

export const StatCard = ({ label, value, sub, color = '#16a34a', icon }) => (
  <Card>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{sub}</div>}
      </div>
      {icon && <div style={{ fontSize: 24 }}>{icon}</div>}
    </div>
  </Card>
)

export const EmptyState = ({ icon, title, sub }) => (
  <div style={{ textAlign: 'center', padding: '60px 20px', color: '#cbd5e1' }}>
    <div style={{ fontSize: 40, marginBottom: 10 }}>{icon}</div>
    <div style={{ fontWeight: 700, fontSize: 16, color: '#94a3b8' }}>{title}</div>
    {sub && <div style={{ fontSize: 13, marginTop: 4 }}>{sub}</div>}
  </div>
)

export const SectionHeader = ({ title, action }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
    <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{title}</h2>
    {action}
  </div>
)

export const TotalBar = ({ count, label, total }) => (
  <div style={{ background: '#0f172a', borderRadius: 14, padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span style={{ color: '#94a3b8', fontSize: 13 }}>{count} {label}</span>
    <span style={{ color: '#4ade80', fontWeight: 800, fontSize: 18 }}>{fmt(total)}</span>
  </div>
)
