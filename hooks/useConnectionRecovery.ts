"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"

interface ConnectionRecoveryOptions {
  onReconnect?: () => void
  onDisconnect?: () => void
  checkInterval?: number
  maxRetries?: number
}

export function useConnectionRecovery({
  onReconnect,
  onDisconnect,
  checkInterval = 30000, // 30 seconds
  maxRetries = 5,
}: ConnectionRecoveryOptions = {}) {
  const { user } = useAuth()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isConnected, setIsConnected] = useState(true)
  const [retryCount, setRetryCount] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastActivityRef = useRef<number>(Date.now())
  const reconnectingRef = useRef(false)

  // Update last activity timestamp
  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
  }, [])

  // Check if the connection to Supabase is working
  const checkConnection = useCallback(async (): Promise<boolean> => {
    try {
      const { error } = await supabase.from("profiles").select("id").limit(1).single()

      return !error
    } catch {
      return false
    }
  }, [])

  // Refresh auth session
  const refreshSession = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (error) {
        console.warn("Session refresh failed:", error)
        return false
      }
      console.log("✅ Session refreshed successfully")
      return true
    } catch (error) {
      console.warn("Session refresh error:", error)
      return false
    }
  }, [])

  // Handle reconnection logic
  const handleReconnection = useCallback(async () => {
    if (reconnectingRef.current) return

    reconnectingRef.current = true
    console.log("🔄 Attempting to reconnect...")

    try {
      // First, refresh the auth session
      await refreshSession()

      // Then check database connection
      const connected = await checkConnection()

      if (connected) {
        console.log("✅ Connection restored")
        setIsConnected(true)
        setRetryCount(0)
        onReconnect?.()
      } else {
        throw new Error("Connection check failed")
      }
    } catch (error) {
      console.warn("❌ Reconnection failed:", error)
      setRetryCount((prev) => prev + 1)

      if (retryCount < maxRetries) {
        // Exponential backoff: 2s, 4s, 8s, 16s, 32s
        const delay = Math.min(2000 * Math.pow(2, retryCount), 32000)
        setTimeout(handleReconnection, delay)
      }
    } finally {
      reconnectingRef.current = false
    }
  }, [checkConnection, refreshSession, onReconnect, retryCount, maxRetries])

  // Handle visibility change (when user returns to tab)
  const handleVisibilityChange = useCallback(async () => {
    if (document.visibilityState === "visible") {
      const timeSinceLastActivity = Date.now() - lastActivityRef.current

      // If user was away for more than 5 minutes, check connection
      if (timeSinceLastActivity > 5 * 60 * 1000) {
        console.log("🔍 User returned after long absence, checking connection...")

        const connected = await checkConnection()
        if (!connected) {
          setIsConnected(false)
          onDisconnect?.()
          handleReconnection()
        } else {
          // Refresh session preventively
          await refreshSession()
        }
      }

      updateActivity()
    }
  }, [checkConnection, refreshSession, handleReconnection, onDisconnect, updateActivity])

  // Handle online/offline events
  const handleOnline = useCallback(() => {
    console.log("🌐 Network connection restored")
    setIsOnline(true)
    handleReconnection()
  }, [handleReconnection])

  const handleOffline = useCallback(() => {
    console.log("📵 Network connection lost")
    setIsOnline(false)
    setIsConnected(false)
    onDisconnect?.()
  }, [onDisconnect])

  // Periodic connection check
  const startPeriodicCheck = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    intervalRef.current = setInterval(async () => {
      if (!isOnline) return

      const connected = await checkConnection()

      if (!connected && isConnected) {
        console.log("⚠️ Connection lost during periodic check")
        setIsConnected(false)
        onDisconnect?.()
        handleReconnection()
      } else if (connected && !isConnected) {
        console.log("✅ Connection restored during periodic check")
        setIsConnected(true)
        setRetryCount(0)
        onReconnect?.()
      }
    }, checkInterval)
  }, [checkConnection, isOnline, isConnected, onReconnect, onDisconnect, handleReconnection, checkInterval])

  // Setup event listeners
  useEffect(() => {
    // Network status listeners
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    // Visibility change listener
    document.addEventListener("visibilitychange", handleVisibilityChange)

    // Activity listeners to track user engagement
    const activityEvents = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"]
    activityEvents.forEach((event) => {
      document.addEventListener(event, updateActivity, { passive: true })
    })

    // Start periodic connection check
    if (user) {
      startPeriodicCheck()
    }

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      document.removeEventListener("visibilitychange", handleVisibilityChange)

      activityEvents.forEach((event) => {
        document.removeEventListener(event, updateActivity)
      })

      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [user, handleOnline, handleOffline, handleVisibilityChange, updateActivity, startPeriodicCheck])

  // Force reconnection function
  const forceReconnect = useCallback(() => {
    setRetryCount(0)
    handleReconnection()
  }, [handleReconnection])

  return {
    isOnline,
    isConnected,
    retryCount,
    forceReconnect,
    isReconnecting: reconnectingRef.current,
  }
}
