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
  private maxReconnectAttempts = 5
  private reconnectDelay = 2000

  private constructor() {
    this.initializeSession()
    this.setupActivityTracking()
    this.setupHealthCheck()
    this.setupVisibilityHandling()
  }

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager()
    }
    return SessionManager.instance
  }

  private async initializeSession() {
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

      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (event, session) => {
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
            this.cleanup()
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

      this.notifyListeners()
    } catch (error) {
      console.error("Failed to initialize session:", error)
      this.sessionState.isConnected = false
      this.notifyListeners()
    }
  }

  private setupActivityTracking() {
    const updateActivity = () => {
      this.sessionState.lastActivity = Date.now()
      this.resetActivityTimer()
    }

    // Track various user activities
    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart", "click", "focus"]

    events.forEach((event) => {
      document.addEventListener(event, updateActivity, { passive: true })
    })

    // Cleanup function will be called when session manager is destroyed
    this.cleanup = () => {
      events.forEach((event) => {
        document.removeEventListener(event, updateActivity)
      })
      this.clearTimers()
    }
  }

  private resetActivityTimer() {
    if (this.activityTimer) {
      clearTimeout(this.activityTimer)
    }

    // Set inactivity timeout (30 minutes)
    this.activityTimer = setTimeout(
      () => {
        console.log("User inactive for 30 minutes, checking session validity")
        this.checkSessionValidity()
      },
      30 * 60 * 1000,
    )
  }

  private setupHealthCheck() {
    this.startHealthCheck()
  }

  private startHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
    }

    // Check connection health every 2 minutes
    this.healthCheckTimer = setInterval(
      async () => {
        if (this.sessionState.user) {
          await this.checkConnectionHealth()
        }
      },
      2 * 60 * 1000,
    )
  }

  private async checkConnectionHealth() {
    try {
      const { data, error } = await supabase.from("profiles").select("id").limit(1).single()

      if (error && error.code === "PGRST301") {
        // No rows returned is fine, connection is working
        this.sessionState.isConnected = true
      } else if (error) {
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
    if (this.sessionState.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log("Max reconnection attempts reached")
      return
    }

    this.sessionState.reconnectAttempts++
    console.log(`Attempting reconnection ${this.sessionState.reconnectAttempts}/${this.maxReconnectAttempts}`)

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    this.reconnectTimer = setTimeout(async () => {
      await this.checkSessionValidity()
    }, this.reconnectDelay * this.sessionState.reconnectAttempts)
  }

  private setupVisibilityHandling() {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        console.log("App became visible, checking session")
        this.sessionState.lastActivity = Date.now()

        // Check session when app becomes visible
        if (this.sessionState.user) {
          await this.checkSessionValidity()
          await this.checkConnectionHealth()
        }
      } else {
        console.log("App became hidden")
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
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
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  private cleanup() {
    this.clearTimers()
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => {
      try {
        listener({ ...this.sessionState })
      } catch (error) {
        console.error("Error notifying session listener:", error)
      }
    })
  }

  // Public methods
  subscribe(listener: (state: SessionState) => void): () => void {
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
    console.log("Forcing session refresh")
    await this.checkSessionValidity()
    await this.checkConnectionHealth()
  }

  async signOut(): Promise<void> {
    try {
      await supabase.auth.signOut()
      this.sessionState.session = null
      this.sessionState.user = null
      this.sessionState.isConnected = false
      this.cleanup()
      this.notifyListeners()
    } catch (error) {
      console.error("Sign out error:", error)
    }
  }

  destroy() {
    this.cleanup()
    this.listeners.clear()
  }
}
