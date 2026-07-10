export async function extractPix(base64, mediaType) {
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, mediaType })
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e?.error || `Erro ${res.status}`)
  }
  const { result } = await res.json()
  return JSON.parse(result)
}
