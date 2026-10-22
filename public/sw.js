// Minimal service worker so Chrome treats the site as an installable app.
// It only handles same-origin page navigations, network-first, keeping the last copy of each page
// for offline. API calls, Next.js assets and Firebase traffic never pass through it.
// To remove: delete this file and src/components/sw-register.tsx.
const CACHE = 'pages-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || request.mode !== 'navigate') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)))
        }
        return response
      })
      .catch(async () => (await caches.match(request)) || (await caches.match('/')) || Response.error())
  )
})
