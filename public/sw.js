const CACHE = 'the-obras-v2'
const SHARE_CACHE = 'the-obras-share'

self.addEventListener('install', e => {
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE && k !== SHARE_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// Handle share target POST
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  if (e.request.method === 'POST' && url.searchParams.get('share') === 'true') {
    e.respondWith((async () => {
      let status = 'ok'
      try {
        const cache = await caches.open(SHARE_CACHE)
        const formData = await e.request.formData()
        const file = formData.get('file')

        if (file && file.size > 0) {
          // Guarda o arquivo no Cache Storage, pra o app buscar assim que abrir
          await cache.put('/__shared-file', new Response(file, {
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
              'X-File-Name': encodeURIComponent(file.name || 'comprovante')
            }
          }))
        } else {
          status = 'sem_arquivo' // o app do banco não enviou nenhum arquivo no campo esperado
        }
        await cache.put('/__shared-status', new Response(status))
      } catch (err) {
        status = 'erro: ' + err.message
        try {
          const cache = await caches.open(SHARE_CACHE)
          await cache.put('/__shared-status', new Response(status))
        } catch {}
        console.error('Share target error:', err)
      }
      // Redirect to app
      return Response.redirect('/?opened=share', 303)
    })())
  }
})
