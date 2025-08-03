const CACHE_NAME = "poker-manager-v1"
const STATIC_CACHE = "poker-static-v1"

// Files to cache immediately
const STATIC_FILES = [
  "/",
  "/manifest.json",
  "/images/poker-table-background.jpg",
  "/images/poker-dashboard-background.png",
  "/images/poker-chips-background.jpg",
]

// Install event - cache static files
self.addEventListener("install", (event) => {
  console.log("Service Worker: Installing...")

  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log("Service Worker: Caching static files")
        return cache.addAll(STATIC_FILES)
      })
      .then(() => {
        console.log("Service Worker: Static files cached")
        return self.skipWaiting()
      })
      .catch((error) => {
        console.error("Service Worker: Cache failed", error)
      }),
  )
})

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("Service Worker: Activating...")

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE) {
              console.log("Service Worker: Deleting old cache", cacheName)
              return caches.delete(cacheName)
            }
          }),
        )
      })
      .then(() => {
        console.log("Service Worker: Activated")
        return self.clients.claim()
      }),
  )
})

// Fetch event - network first with cache fallback
self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== "GET") {
    return
  }

  // Skip chrome-extension and other non-http requests
  if (!url.protocol.startsWith("http")) {
    return
  }

  // Handle API requests (Supabase)
  if (url.hostname.includes("supabase") || url.pathname.includes("/rest/v1/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache successful responses
          if (response.status === 200) {
            const responseClone = response.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return response
        })
        .catch(() => {
          // Return cached version if network fails
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              console.log("Service Worker: Serving cached API response")
              return cachedResponse
            }
            // Return offline response for API calls
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

  // Handle static files and pages
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Serve from cache, but also fetch in background to update cache
        fetch(request)
          .then((response) => {
            if (response.status === 200) {
              const responseClone = response.clone()
              caches.open(STATIC_CACHE).then((cache) => {
                cache.put(request, responseClone)
              })
            }
          })
          .catch(() => {
            // Ignore background fetch errors
          })

        return cachedResponse
      }

      // Not in cache, fetch from network
      return fetch(request)
        .then((response) => {
          // Cache successful responses
          if (response.status === 200) {
            const responseClone = response.clone()
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return response
        })
        .catch(() => {
          // Network failed and not in cache
          if (request.destination === "document") {
            // Return offline page for navigation requests
            return new Response(
              `
                <!DOCTYPE html>
                <html>
                <head>
                  <title>Offline - Poker Manager</title>
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <style>
                    body { 
                      font-family: system-ui, sans-serif; 
                      text-align: center; 
                      padding: 2rem;
                      background: #1a1a1a;
                      color: #fff;
                    }
                    .offline-message {
                      max-width: 400px;
                      margin: 0 auto;
                      padding: 2rem;
                      background: #2a2a2a;
                      border-radius: 8px;
                    }
                    button {
                      background: #3b82f6;
                      color: white;
                      border: none;
                      padding: 0.75rem 1.5rem;
                      border-radius: 6px;
                      cursor: pointer;
                      margin-top: 1rem;
                    }
                    button:hover { background: #2563eb; }
                  </style>
                </head>
                <body>
                  <div class="offline-message">
                    <h1>📵 You're Offline</h1>
                    <p>Please check your internet connection and try again.</p>
                    <button onclick="window.location.reload()">Retry</button>
                  </div>
                </body>
                </html>
                `,
              {
                status: 503,
                statusText: "Service Unavailable",
                headers: { "Content-Type": "text/html" },
              },
            )
          }

          // For other requests, return a generic error
          return new Response("Network error", {
            status: 503,
            statusText: "Service Unavailable",
          })
        })
    }),
  )
})

// Background sync for offline actions
self.addEventListener("sync", (event) => {
  console.log("Service Worker: Background sync triggered", event.tag)

  if (event.tag === "background-sync") {
    event.waitUntil(
      // Attempt to sync any pending actions
      syncPendingActions(),
    )
  }
})

// Handle push notifications (for future use)
self.addEventListener("push", (event) => {
  console.log("Service Worker: Push received")

  const options = {
    body: event.data ? event.data.text() : "New poker game update!",
    icon: "/images/icon-192x192.png",
    badge: "/images/icon-72x72.png",
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
    },
  }

  event.waitUntil(self.registration.showNotification("Poker Manager", options))
})

// Sync pending actions when connection is restored
async function syncPendingActions() {
  try {
    // Check if we can reach the server
    const response = await fetch("/api/health-check")

    if (response.ok) {
      console.log("Service Worker: Connection restored, syncing...")

      // Notify all clients that connection is restored
      const clients = await self.clients.matchAll()
      clients.forEach((client) => {
        client.postMessage({
          type: "CONNECTION_RESTORED",
          timestamp: Date.now(),
        })
      })
    }
  } catch (error) {
    console.log("Service Worker: Still offline, will retry sync later")
  }
}

// Clean up old cache entries periodically
setInterval(
  () => {
    caches.open(CACHE_NAME).then((cache) => {
      cache.keys().then((requests) => {
        requests.forEach((request) => {
          cache.match(request).then((response) => {
            if (response) {
              const dateHeader = response.headers.get("date")
              if (dateHeader) {
                const responseDate = new Date(dateHeader)
                const now = new Date()
                const daysDiff = (now.getTime() - responseDate.getTime()) / (1000 * 60 * 60 * 24)

                // Remove entries older than 7 days
                if (daysDiff > 7) {
                  cache.delete(request)
                  console.log("Service Worker: Removed old cache entry", request.url)
                }
              }
            }
          })
        })
      })
    })
  },
  24 * 60 * 60 * 1000,
) // Run daily
