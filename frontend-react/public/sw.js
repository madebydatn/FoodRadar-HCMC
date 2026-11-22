
const CACHE_PREFIX = 'foodradar-'
const CACHE_VERSION = 'v9'
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`

// Tự xác định thư mục gốc của ứng dụng.
// Ví dụ: https://madebydatn.github.io/FoodRadar-HCMC/
const APP_SCOPE = self.registration.scope

const APP_SHELL = [
  '',
  'index.html',
  'manifest.json',
  'favicon-48.png',
  'icon-apple-180.png',
  'icon-pwa-192.png',
  'icon-pwa-512.png',
].map(path => new URL(path, APP_SCOPE).href)

// Chỉ cache response hợp lệ, cùng origin và thành công.
async function cacheResponse(request, response) {
  if (
    !response ||
    !response.ok ||
    response.type !== 'basic'
  ) {
    return response
  }

  const cache = await caches.open(CACHE_NAME)
  await cache.put(request, response.clone())

  return response
}

// INSTALL: chuẩn bị bộ khung ứng dụng.
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)

      await cache.addAll(APP_SHELL)

      await self.skipWaiting()
    })()
  )
})

// ACTIVATE: chỉ xóa cache cũ của FoodRadar.
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()

      await Promise.all(
        keys
          .filter(
            key =>
              key.startsWith(CACHE_PREFIX) &&
              key !== CACHE_NAME
          )
          .map(key => caches.delete(key))
      )

      await self.clients.claim()
    })()
  )
})

// NETWORK FIRST: HTML và dữ liệu nhà hàng.
async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request)

    if (response.ok) {
      await cacheResponse(request, response)
    }

    return response
  } catch (error) {
    const cached = await caches.match(request)

    if (cached) return cached

    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl)

      if (fallback) return fallback
    }

    return new Response(
      'FoodRadar hiện không có kết nối mạng.',
      {
        status: 503,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      }
    )
  }
}

// CACHE FIRST: tài nguyên tĩnh.
async function cacheFirst(request) {
  const cached = await caches.match(request)

  if (cached) return cached

  try {
    const response = await fetch(request)

    if (response.ok) {
      await cacheResponse(request, response)
    }

    return response
  } catch (error) {
    return new Response(
      'Tài nguyên hiện không khả dụng.',
      { status: 503 }
    )
  }
}

// FETCH: chỉ xử lý GET cùng origin và trong phạm vi ứng dụng.
self.addEventListener('fetch', event => {
  const request = event.request

  if (request.method !== 'GET') return
  if (request.headers.has('range')) return

  const url = new URL(request.url)

  if (url.origin !== self.location.origin) return

  // Không xử lý request nằm ngoài FoodRadar.
  if (!url.href.startsWith(APP_SCOPE)) return

  // Trang HTML: ưu tiên phiên bản mới.
  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(
        request,
        new URL('index.html', APP_SCOPE).href
      )
    )
    return
  }

  // Dữ liệu nhà hàng: ưu tiên dữ liệu mới.
  if (url.pathname.endsWith('/restaurants.json')) {
    event.respondWith(networkFirst(request))
    return
  }

  // Cache first cho tài nguyên tĩnh.
  const staticDestinations = [
    'style',
    'script',
    'image',
    'font',
    'manifest',
  ]

  if (staticDestinations.includes(request.destination)) {
    event.respondWith(cacheFirst(request))
  }
})
