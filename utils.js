export const OBRAS_DEFAULT = [
  { codigo: 'F',  nome: 'Feira' },
  { codigo: 'E',  nome: 'Esquina' },
  { codigo: 'B',  nome: 'BR' },
  { codigo: 'FA', nome: 'Estranho (Faro)' },
  { codigo: 'P',  nome: 'Passarela' },
  { codigo: '3',  nome: '3 Lotes' },
  { codigo: 'T',  nome: 'THE' },
]

export const QUALIDADES = [
  'Documentos',
  'Materiais',
  'Mão de Obra',
  'Lote',
  'Miudezas',
]

export const PALETTE = [
  '#16a34a','#0284c7','#7c3aed','#d97706',
  '#e11d48','#0891b2','#65a30d','#c2410c','#9333ea',
]

export const obraColor = (obras, codigo) => {
  if (!codigo) return '#64748b'
  const i = obras.findIndex(o => o.codigo === codigo)
  return PALETTE[Math.max(i, 0) % PALETTE.length]
}

export const fmt = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

export const fmtDate = (s) => {
  if (!s) return '—'
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export const todayStr = () => new Date().toISOString().split('T')[0]

export const monthLabel = (yyyy, mm) => {
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[parseInt(mm) - 1]}/${yyyy}`
}

export const parseCur = (s) => {
  if (s === null || s === undefined || s === '') return 0
  if (typeof s === 'number') return s
  let str = String(s).trim().replace(/R\$\s?/g, '')
  if (str === '') return 0

  const hasComma = str.includes(',')
  const hasDot = str.includes('.')

  if (hasComma && hasDot) {
    // Formato "1.234,56" -> remove pontos (milhar), vírgula -> ponto decimal
    str = str.replace(/\./g, '').replace(',', '.')
  } else if (hasComma) {
    // "56,90" -> vírgula é decimal
    str = str.replace(',', '.')
  } else if (hasDot) {
    // Ambíguo: "56.90" (decimal) vs "1.234" (milhar)
    const parts = str.split('.')
    if (parts.length === 2 && parts[1].length <= 2) {
      // até 2 dígitos após o ponto -> decimal, mantém
    } else {
      // mais dígitos ou múltiplos pontos -> separador de milhar
      str = str.replace(/\./g, '')
    }
  }
  return parseFloat(str) || 0
}
