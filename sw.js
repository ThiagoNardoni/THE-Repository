const CACHE = 'the-obras-v2'

self.addEventListener('install', e => {
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

// Handle share target POST
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  if (e.request.method === 'POST' && url.searchParams.get('share') === 'true') {
    e.respondWith((async () => {
      try {
        const formData = await e.request.formData()
        const file = formData.get('file')

        if (file) {
          // Store file in IndexedDB so the app can pick it up
          const db = await openDB()
          await storeFile(db, file)
        }
      } catch (err) {
        console.error('Share target error:', err)
      }
      // Redirect to app
      return Response.redirect('/?opened=share', 303)
    })())
  }
})

// IndexedDB helpers
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('the-obras', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('shared')
    req.onsuccess = () => resolve(req.result)
    req.onerror = reject
  })
}

function storeFile(db, file) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('shared', 'readwrite')
    tx.objectStore('shared').put(file, 'pending')
    tx.oncomplete = resolve
    tx.onerror = reject
  })
}
