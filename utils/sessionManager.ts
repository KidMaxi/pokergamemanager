import { supabase } from "../lib/supabase"
import type { User, Session } from "@supabase/supabase-js"

export interface SessionState {
  user: User | null
  session: Session | null
  isConnected: boolean
  lastActivity: number
  reconnectAttempts: number
}

export class SessionManager {
  private static instance: SessionManager
  private sessionState: SessionState = {
    user: null,
    session: null,
    isConnected: false,
    lastActivity: Date.now(),
    reconnectAttempts: 0,
  }
  private listeners: Set<(state: SessionState) => void> = new Set()
  private activityTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private healthCheckTimer: NodeJS.Timeout | null = null
  private maxReconnectAttempts = 3 // Reduced from 5 to prevent excessive retries
  private reconnectDelay = 5000 // Increased delay to reduce frequency
  private isClient = typeof window !== "undefined"
  private cleanupFunctions: (() => void)[] = []
  private isDestroyed = false
  private lastHealthCheck = 0
  private healthCheckCooldown = 60000 // 1 minute cooldown between health checks
  private authSubscription: any = null

  private constructor() {
    if (this.isClient && !this.isDestroyed) {
      this.initializeSession()
      this.setupActivityTracking()
      this.setupVisibilityHandling()
      this.setupBeforeUnloadHandler()
    }
  }

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager()
    }
    return SessionManager.instance
  }

  private async initializeSession() {
    if (!this.isClient || this.isDestroyed) return

    try {
      // Get initial session
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession()

      if (error) {
        console.error("Error getting initial session:", error)
        this.sessionState.isConnected = false
      } else {
        this.sessionState.session = session
        this.sessionState.user = session?.user || null
        this.sessionState.isConnected = !!session
        this.sessionState.lastActivity = Date.now()
      }

      // Listen for auth changes with proper cleanup
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (this.isDestroyed) return

        console.log("Auth state changed:", event, session?.user?.id)

        this.sessionState.session = session
        this.sessionState.user = session?.user || null
        this.sessionState.isConnected = !!session
        this.sessionState.lastActivity = Date.now()
        this.sessionState.reconnectAttempts = 0

        // Handle different auth events
        switch (event) {
          case "SIGNED_IN":
            this.sessionState.isConnected = true
            this.startHealthCheck()
            break
          case "SIGNED_OUT":
            this.sessionState.isConnected = false
            this.stopHealthCheck()
            break
          case "TOKEN_REFRESHED":
            this.sessionState.isConnected = true
            this.sessionState.reconnectAttempts = 0
            break
          case "USER_UPDATED":
            this.sessionState.lastActivity = Date.now()
            break
        }

        this.notifyListeners()
      })

      this.authSubscription = subscription
      this.cleanupFunctions.push(() => subscription.unsubscribe())

      this.notifyListeners()
    } catch (error) {
      console.error("Failed to initialize session:", error)
      this.sessionState.isConnected = false
      this.notifyListeners()
    }
  }

  private setupActivityTracking() {
    if (!this.isClient || this.isDestroyed) return

    const updateActivity = () => {
      if (this.isDestroyed) return
      this.sessionState.lastActivity = Date.now()
      this.resetActivityTimer()
    }

    // Track various user activities with passive listeners
    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart", "click", "focus"]

    const eventCleanup = () => {
      events.forEach((event) => {
        document.removeEventListener(event, updateActivity)
      })
    }

    events.forEach((event) => {
      document.addEventListener(event, updateActivity, { passive: true })
    })

    this.cleanupFunctions.push(eventCleanup)
    this.resetActivityTimer()
  }

  private resetActivityTimer() {
    if (!this.isClient || this.isDestroyed) return

    if (this.activityTimer) {
      clearTimeout(this.activityTimer)
    }

    // Set inactivity timeout (45 minutes - increased to reduce frequency)
    this.activityTimer = setTimeout(
      () => {
        if (!this.isDestroyed) {
          console.log("User inactive for 45 minutes, checking session validity")
          this.checkSessionValidity()
        }
      },
      45 * 60 * 1000,
    )
  }

  private startHealthCheck() {
    if (!this.isClient || this.isDestroyed) return

    this.stopHealthCheck() // Clear any existing timer

    // Check connection health every 5 minutes (increased interval)
    this.healthCheckTimer = setInterval(
      async () => {
        if (!this.isDestroyed && this.sessionState.user) {
          await this.checkConnectionHealth()
        }
      },
      5 * 60 * 1000,
    )
  }

  private stopHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  private async checkConnectionHealth() {
    if (!this.isClient || this.isDestroyed) return

    // Implement cooldown to prevent excessive health checks
    const now = Date.now()
    if (now - this.lastHealthCheck < this.healthCheckCooldown) {
      return
    }
    this.lastHealthCheck = now

    try {
      // Use a lightweight query to check connection
      const { error } = await supabase.from("profiles").select("id").limit(1).single()

      if (error && error.code === "PGRST301") {
        // No rows returned is fine, connection is working
        this.sessionState.isConnected = true
        this.sessionState.reconnectAttempts = 0
      } else if (error && error.code !== "PGRST116") {
        // PGRST116 is "not found" which is acceptable
        console.warn("Connection health check failed:", error)
        this.sessionState.isConnected = false
        this.attemptReconnection()
      } else {
        this.sessionState.isConnected = true
        this.sessionState.reconnectAttempts = 0
      }
    } catch (error) {
      console.error("Health check error:", error)
      this.sessionState.isConnected = false
      this.attemptReconnection()
    }

    this.notifyListeners()
  }

  private async checkSessionValidity() {
    if (!this.isClient || this.isDestroyed) return

    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession()

      if (error || !session) {
        console.log("Session invalid, attempting refresh")
        await this.attemptSessionRefresh()
      } else {
        this.sessionState.session = session
        this.sessionState.user = session.user
        this.sessionState.isConnected = true
        this.notifyListeners()
      }
    } catch (error) {
      console.error("Session validity check failed:", error)
      this.attemptReconnection()
    }
  }

  private async attemptSessionRefresh() {
    if (!this.isClient || this.isDestroyed) return

    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.refreshSession()

      if (error || !session) {
        console.log("Session refresh failed, user needs to re-authenticate")
        this.sessionState.session = null
        this.sessionState.user = null
        this.sessionState.isConnected = false
      } else {
        this.sessionState.session = session
        this.sessionState.user = session.user
        this.sessionState.isConnected = true
        console.log("Session refreshed successfully")
      }
    } catch (error) {
      console.error("Session refresh error:", error)
      this.sessionState.isConnected = false
    }

    this.notifyListeners()
  }

  private async attemptReconnection() {
    if (!this.isClient || this.isDestroyed) return

    if (this.sessionState.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log("Max reconnection attempts reached")
      return
    }

    this.sessionState.reconnectAttempts++
    console.log(`Attempting reconnection ${this.sessionState.reconnectAttempts}/${this.maxReconnectAttempts}`)

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    // Exponential backoff for reconnection attempts
    const delay = this.reconnectDelay * Math.pow(2, this.sessionState.reconnectAttempts - 1)

    this.reconnectTimer = setTimeout(async () => {
      if (!this.isDestroyed) {
        await this.checkSessionValidity()
      }
    }, delay)
  }

  private setupVisibilityHandling() {
    if (!this.isClient || this.isDestroyed) return

    const handleVisibilityChange = async () => {
      if (this.isDestroyed) return

      if (document.visibilityState === "visible") {
        console.log("App became visible, checking session")
        this.sessionState.lastActivity = Date.now()

        // Only check session if user exists and enough time has passed
        if (this.sessionState.user && Date.now() - this.lastHealthCheck > 30000) {
          await this.checkSessionValidity()
        }
      } else {
        console.log("App became hidden")
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    this.cleanupFunctions.push(() => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    })
  }

  private setupBeforeUnloadHandler() {
    if (!this.isClient || this.isDestroyed) return

    const handleBeforeUnload = () => {
      // Save current state before unload
      if (this.sessionState.user) {
        localStorage.setItem(
          "poker-session-backup",
          JSON.stringify({
            userId: this.sessionState.user.id,
            timestamp: Date.now(),
          }),
        )
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    this.cleanupFunctions.push(() => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    })
  }

  private clearTimers() {
    if (this.activityTimer) {
      clearTimeout(this.activityTimer)
      this.activityTimer = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.stopHealthCheck()
  }

  private cleanup() {
    this.clearTimers()
    this.cleanupFunctions.forEach((cleanup) => {
      try {
        cleanup()
      } catch (error) {
        console.error("Error during cleanup:", error)
      }
    })
    this.cleanupFunctions = []
  }

  private notifyListeners() {
    if (this.isDestroyed) return

    // Use requestAnimationFrame to batch notifications and prevent excessive updates
    requestAnimationFrame(() => {
      if (this.isDestroyed) return

      const state = { ...this.sessionState }
      this.listeners.forEach((listener) => {
        try {
          listener(state)
        } catch (error) {
          console.error("Error notifying session listener:", error)
        }
      })
    })
  }

  // Public methods
  subscribe(listener: (state: SessionState) => void): () => void {
    if (this.isDestroyed) {
      console.warn("Cannot subscribe to destroyed SessionManager")
      return () => {}
    }

    this.listeners.add(listener)

    // Immediately notify with current state
    listener({ ...this.sessionState })

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener)
    }
  }

  getState(): SessionState {
    return { ...this.sessionState }
  }

  async forceRefresh(): Promise<void> {
    if (!this.isClient || this.isDestroyed) return

    console.log("Forcing session refresh")
    await this.checkSessionValidity()

    // Only check connection health if enough time has passed
    if (Date.now() - this.lastHealthCheck > 10000) {
      await this.checkConnectionHealth()
    }
  }

  async signOut(): Promise<void> {
    if (!this.isClient || this.isDestroyed) return

    try {
      await supabase.auth.signOut()
      this.sessionState.session = null
      this.sessionState.user = null
      this.sessionState.isConnected = false
      this.stopHealthCheck()
      this.notifyListeners()
    } catch (error) {
      console.error("Sign out error:", error)
    }
  }

  destroy() {
    this.isDestroyed = true
    this.cleanup()
    this.listeners.clear()

    if (this.authSubscription) {
      this.authSubscription.unsubscribe()
    }
  }
}
