export async function extractPix(base64, mediaType) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 45000) // 45s
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
    if (e.name === 'AbortError') throw new Error('A leitura demorou demais e foi cancelada. Tente novamente com uma conexão melhor.')
    throw e
  } finally {
    clearTimeout(timeoutId)
  }
}
