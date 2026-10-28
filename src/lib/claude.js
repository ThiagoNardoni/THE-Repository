async function chamarGemini(base64, mediaType, timeoutMs) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64, mediaType }),
      signal: controller.signal
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      throw new Error(e?.error || `Erro ${res.status}`)
    }
    const { result } = await res.json()
    return JSON.parse(result)
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('A leitura demorou demais e foi cancelada.')
    throw e
  } finally {
    clearTimeout(timeoutId)
  }
}

// Lê o comprovante com a IA. Se a primeira tentativa falhar (ex: a função do
// servidor "dormindo" - cold start - demorando demais pra acordar), tenta
// uma segunda vez sozinho antes de mostrar erro pra pessoa, já que nesses
// casos a segunda tentativa quase sempre funciona rápido.
export async function extractPix(base64, mediaType) {
  try {
    return await chamarGemini(base64, mediaType, 25000) // 1ª tentativa: 25s
  } catch (e1) {
    return await chamarGemini(base64, mediaType, 55000) // 2ª tentativa: 55s (deixa o erro subir se falhar de novo)
  }
}
