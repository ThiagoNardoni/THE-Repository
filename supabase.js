import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://iugricxbqlixlfcwsoim.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1Z3JpY3hicWxpeGxmY3dzb2ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NDA1MzQsImV4cCI6MjA5NDAxNjUzNH0.Ng80yig__ikGknVKjdZDwJPIBwJd6buiRMA0scjJ3fU'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Despesas ──────────────────────────────────────────────────────────────
export async function getDespesas() {
  const { data, error } = await supabase
    .from('despesas')
    .select('*')
    .order('data', { ascending: false })
  if (error) throw error
  return data || []
}

export async function saveDespesa(d) {
  const { data, error } = await supabase.from('despesas').insert([d]).select()
  if (error) throw error
  return data[0]
}

export async function updateDespesa(id, d) {
  const { error } = await supabase.from('despesas').update(d).eq('id', id)
  if (error) throw error
}

export async function deleteDespesa(id) {
  const { error } = await supabase.from('despesas').delete().eq('id', id)
  if (error) throw error
}

// Apaga TODOS os lançamentos de despesas (todas as obras, todos os usuários)
export async function deleteAllDespesas() {
  const { error } = await supabase.from('despesas').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

// ── Entradas (fluxo de caixa) ─────────────────────────────────────────────
export async function getEntradas() {
  const { data, error } = await supabase
    .from('entradas')
    .select('*')
    .order('data', { ascending: false })
  if (error) throw error
  return data || []
}

export async function saveEntrada(e) {
  const { data, error } = await supabase.from('entradas').insert([e]).select()
  if (error) throw error
  return data[0]
}

export async function updateEntrada(id, e) {
  const { error } = await supabase.from('entradas').update(e).eq('id', id)
  if (error) throw error
}

export async function deleteEntrada(id) {
  const { error } = await supabase.from('entradas').delete().eq('id', id)
  if (error) throw error
}

// ── Mão de obra ───────────────────────────────────────────────────────────
export async function getMaoDeObra() {
  const { data, error } = await supabase
    .from('mao_de_obra')
    .select('*')
    .order('data', { ascending: false })
  if (error) throw error
  return data || []
}

export async function saveMaoDeObra(m) {
  const { data, error } = await supabase.from('mao_de_obra').insert([m]).select()
  if (error) throw error
  return data[0]
}

export async function updateMaoDeObra(id, m) {
  const { error } = await supabase.from('mao_de_obra').update(m).eq('id', id)
  if (error) throw error
}

export async function deleteMaoDeObra(id) {
  const { error } = await supabase.from('mao_de_obra').delete().eq('id', id)
  if (error) throw error
}

// ── Obras (orçamento) ─────────────────────────────────────────────────────
export async function getObras() {
  const { data, error } = await supabase.from('obras').select('*').order('nome')
  if (error) throw error
  return data || []
}

export async function saveObra(o) {
  const { data, error } = await supabase.from('obras').insert([o]).select()
  if (error) throw error
  return data[0]
}

export async function updateObra(id, o) {
  const { error } = await supabase.from('obras').update(o).eq('id', id)
  if (error) throw error
}

export async function deleteObra(id) {
  const { error } = await supabase.from('obras').delete().eq('id', id)
  if (error) throw error
}
