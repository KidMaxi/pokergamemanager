const CACHE_NAME = "poker-home-game-v1"
const urlsToCache = ["/", "/static/js/bundle.js", "/static/css/main.css", "/manifest.json"]

// Install event
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Opened cache")
      return cache.addAll(urlsToCache)
    }),
  )
  // Force the waiting service worker to become the active service worker
  self.skipWaiting()
})

// Activate event
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("Deleting old cache:", cacheName)
            return caches.delete(cacheName)
          }
        }),
      )
    }),
  )
  // Claim all clients immediately
  self.clients.claim()
})

// Fetch event with network-first strategy for API calls
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)

  // Handle Supabase API calls with network-first strategy
  if (url.hostname.includes("supabase") || event.request.url.includes("/rest/v1/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // If network request succeeds, return it
          if (response.ok) {
            return response
          }
          throw new Error("Network response was not ok")
        })
        .catch(() => {
          // If network fails, try to serve from cache
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse
            }
            // If no cache, return a custom offline response
            return new Response(
              JSON.stringify({
                error: "Network unavailable",
                offline: true,
              }),
              {
                status: 503,
                statusText: "Service Unavailable",
                headers: { "Content-Type": "application/json" },
              },
            )
          })
        }),
    )
    return
  }

  // For other requests, use cache-first strategy
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached version or fetch from network
      return response || fetch(event.request)
    }),
  )
})

// Handle background sync for offline actions
self.addEventListener("sync", (event) => {
  if (event.tag === "background-sync") {
    event.waitUntil(
      // Notify all clients that sync is happening
      self.clients
        .matchAll()
        .then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: "BACKGROUND_SYNC",
              payload: { syncing: true },
            })
          })
        }),
    )
  }
})

// Handle messages from the main thread
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting()
  }

  if (event.data && event.data.type === "CHECK_CONNECTION") {
    // Test connection to Supabase
    fetch("https://your-supabase-url.supabase.co/rest/v1/", {
      method: "HEAD",
    })
      .then(() => {
        event.ports[0].postMessage({ connected: true })
      })
      .catch(() => {
        event.ports[0].postMessage({ connected: false })
      })
  }
})
