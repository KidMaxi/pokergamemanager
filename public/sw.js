const CACHE_NAME = "poker-manager-v2"
const STATIC_CACHE = "poker-static-v2"
const DYNAMIC_CACHE = "poker-dynamic-v2"

const urlsToCache = [
  "/",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/images/poker-dashboard-background.png",
  "/images/poker-chips-background.jpg",
]

self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker")
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log("[SW] Caching static assets")
        return cache.addAll(urlsToCache)
      })
      .catch((error) => {
        console.error("[SW] Failed to cache static assets:", error)
      }),
  )
  self.skipWaiting() // Force activation of new service worker
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Handle API requests with network-first strategy
  if (url.pathname.includes("/api/") || url.hostname.includes("supabase")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful API responses
          if (response.ok) {
            const responseClone = response.clone()
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return response
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse
            }
            // Return offline page for failed API requests
            return new Response(JSON.stringify({ error: "Offline", message: "No network connection" }), {
              status: 503,
              statusText: "Service Unavailable",
              headers: { "Content-Type": "application/json" },
            })
          })
        }),
    )
    return
  }

  // Handle static assets with cache-first strategy
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(request)
        .then((response) => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response
          }

          const responseToCache = response.clone()
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseToCache)
          })

          return response
        })
        .catch(() => {
          // Return offline fallback for navigation requests
          if (request.mode === "navigate") {
            return caches.match("/")
          }
          return new Response("Offline", { status: 503 })
        })
    }),
  )
})

self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker")
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log("[SW] Deleting old cache:", cacheName)
              return caches.delete(cacheName)
            }
          }),
        )
      })
      .then(() => {
        console.log("[SW] Service worker activated")
        return self.clients.claim() // Take control of all pages
      }),
  )
})

self.addEventListener("sync", (event) => {
  console.log("[SW] Background sync triggered:", event.tag)

  if (event.tag === "background-sync") {
    event.waitUntil(
      syncGameData()
        .then(() => {
          console.log("[SW] Background sync completed successfully")
        })
        .catch((error) => {
          console.error("[SW] Background sync failed:", error)
        }),
    )
  }
})

self.addEventListener("push", (event) => {
  console.log("[SW] Push notification received")

  const options = {
    body: event.data ? event.data.text() : "New poker game update!",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-96x96.png",
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
    },
    actions: [
      {
        action: "explore",
        title: "View Game",
        icon: "/icons/icon-96x96.png",
      },
      {
        action: "close",
        title: "Close",
        icon: "/icons/icon-96x96.png",
      },
    ],
  }

  event.waitUntil(self.registration.showNotification("Poker Manager", options))
})

self.addEventListener("notificationclick", (event) => {
  console.log("[SW] Notification clicked:", event.action)

  event.notification.close()

  if (event.action === "explore") {
    event.waitUntil(clients.openWindow("/"))
  }
})

async function syncGameData() {
  try {
    // Get stored game data that needs syncing
    const cache = await caches.open(DYNAMIC_CACHE)
    const requests = await cache.keys()

    // Attempt to sync any pending game updates
    for (const request of requests) {
      if (request.url.includes("game_sessions")) {
        try {
          await fetch(request)
          console.log("[SW] Synced:", request.url)
        } catch (error) {
          console.log("[SW] Failed to sync:", request.url, error)
        }
      }
    }
  } catch (error) {
    console.error("[SW] Sync error:", error)
    throw error
  }
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting()
  }
})
