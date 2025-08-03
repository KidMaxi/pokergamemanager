const CACHE_NAME = "poker-home-game-v52"
const STATIC_CACHE = "poker-static-v52"
const DYNAMIC_CACHE = "poker-dynamic-v52"

// Files to cache immediately
const STATIC_FILES = [
  "/",
  "/manifest.json",
  "/images/poker-table-background.jpg",
  "/images/poker-dashboard-background.png",
  "/images/poker-chips-background.jpg",
]

// API endpoints that should use network-first strategy
const API_ENDPOINTS = ["/api/", "supabase.co"]

// Install event - cache static files
self.addEventListener("install", (event) => {
  console.log("🔧 Service Worker installing...")

  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log("📦 Caching static files")
        return cache.addAll(STATIC_FILES)
      })
      .then(() => {
        console.log("✅ Static files cached successfully")
        return self.skipWaiting()
      })
      .catch((error) => {
        console.error("❌ Failed to cache static files:", error)
      }),
  )
})

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("🚀 Service Worker activating...")

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log("🗑️ Deleting old cache:", cacheName)
              return caches.delete(cacheName)
            }
          }),
        )
      })
      .then(() => {
        console.log("✅ Service Worker activated")
        return self.clients.claim()
      }),
  )
})

// Test network connectivity
async function testNetworkConnectivity() {
  try {
    const response = await fetch("/", {
      method: "HEAD",
      cache: "no-cache",
    })
    return response.ok
  } catch (error) {
    return false
  }
}

// Network-first strategy for API calls
async function networkFirstStrategy(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request.clone())

    if (networkResponse.ok) {
      // Cache successful responses
      const cache = await caches.open(DYNAMIC_CACHE)
      cache.put(request.clone(), networkResponse.clone())
      return networkResponse
    }

    throw new Error("Network response not ok")
  } catch (error) {
    console.log("🔄 Network failed, trying cache for:", request.url)

    // Fallback to cache
    const cachedResponse = await caches.match(request)
    if (cachedResponse) {
      return cachedResponse
    }

    // If no cache, return a custom offline response for API calls
    if (request.url.includes("/api/") || request.url.includes("supabase.co")) {
      return new Response(
        JSON.stringify({
          error: "Offline",
          message: "This request failed because you are offline",
        }),
        {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Content-Type": "application/json" },
        },
      )
    }

    throw error
  }
}

// Cache-first strategy for static assets
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request)

  if (cachedResponse) {
    return cachedResponse
  }

  try {
    const networkResponse = await fetch(request)

    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE)
      cache.put(request.clone(), networkResponse.clone())
    }

    return networkResponse
  } catch (error) {
    console.error("❌ Failed to fetch:", request.url, error)
    throw error
  }
}

// Fetch event - handle all requests
self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== "GET") {
    return
  }

  // Skip chrome-extension requests
  if (url.protocol === "chrome-extension:") {
    return
  }

  // Determine strategy based on request type
  if (API_ENDPOINTS.some((endpoint) => request.url.includes(endpoint))) {
    // Use network-first for API calls
    event.respondWith(networkFirstStrategy(request))
  } else if (STATIC_FILES.some((file) => request.url.endsWith(file))) {
    // Use cache-first for static files
    event.respondWith(cacheFirstStrategy(request))
  } else {
    // Default network-first with cache fallback
    event.respondWith(networkFirstStrategy(request))
  }
})

// Background sync for offline actions
self.addEventListener("sync", (event) => {
  console.log("🔄 Background sync triggered:", event.tag)

  if (event.tag === "background-sync") {
    event.waitUntil(
      // Notify clients that sync is happening
      self.clients
        .matchAll()
        .then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: "BACKGROUND_SYNC",
              payload: { status: "syncing" },
            })
          })
        }),
    )
  }
})

// Handle messages from the main thread
self.addEventListener("message", (event) => {
  const { type, payload } = event.data

  switch (type) {
    case "SKIP_WAITING":
      self.skipWaiting()
      break

    case "TEST_CONNECTION":
      testNetworkConnectivity().then((isOnline) => {
        event.ports[0].postMessage({ isOnline })
      })
      break

    case "CLEAR_CACHE":
      caches
        .keys()
        .then((cacheNames) => {
          return Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
        })
        .then(() => {
          event.ports[0].postMessage({ success: true })
        })
      break

    default:
      console.log("Unknown message type:", type)
  }
})

// Periodic cleanup of old cache entries
setInterval(
  () => {
    caches.open(DYNAMIC_CACHE).then((cache) => {
      cache.keys().then((requests) => {
        // Remove entries older than 24 hours
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000

        requests.forEach((request) => {
          cache.match(request).then((response) => {
            if (response) {
              const dateHeader = response.headers.get("date")
              if (dateHeader) {
                const responseDate = new Date(dateHeader).getTime()
                if (responseDate < oneDayAgo) {
                  cache.delete(request)
                }
              }
            }
          })
        })
      })
    })
  },
  60 * 60 * 1000,
) // Run every hour

console.log("🎮 Poker Home Game Service Worker loaded")
