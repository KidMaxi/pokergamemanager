"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "../lib/supabase"

interface ConnectionRecoveryOptions {
  onReconnect?: () => void
  onDisconnect?: () => void
  checkInterval?: number
  maxRetries?: number
}

interface ConnectionState {
  isOnline: boolean
  isConnected: boolean
  isReconnecting: boolean
  retryCount: number
}

export function useConnectionRecovery({
  onReconnect,
  onDisconnect,
  checkInterval = 30000,
  maxRetries = 5,
}: ConnectionRecoveryOptions = {}) {
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    isConnected: true,
    isReconnecting: false,
    retryCount: 0,
  })

  const retryTimeoutRef = useRef<NodeJS.Timeout>()
  const checkIntervalRef = useRef<NodeJS.Timeout>()
  const lastActivityRef = useRef<number>(Date.now())

  // Test database connection
  const testConnection = useCallback(async (): Promise<boolean> => {
    try {
      const { error } = await supabase.from("profiles").select("id").limit(1).single()

      return !error
    } catch (error) {
      console.error("Connection test failed:", error)
      return false
    }
  }, [])

  // Refresh auth session
  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (error) {
        console.error("Session refresh failed:", error)
        return false
      }
      console.log("✅ Session refreshed successfully")
      return true
    } catch (error) {
      console.error("Session refresh error:", error)
      return false
    }
  }, [])

  // Attempt reconnection with exponential backoff
  const attemptReconnection = useCallback(async () => {
    if (connectionState.isReconnecting || connectionState.retryCount >= maxRetries) {
      return
    }

    setConnectionState((prev) => ({
      ...prev,
      isReconnecting: true,
      retryCount: prev.retryCount + 1,
    }))

    console.log(`🔄 Attempting reconnection (${connectionState.retryCount + 1}/${maxRetries})...`)

    try {
      // First refresh the auth session
      const sessionRefreshed = await refreshSession()

      // Then test database connection
      const isConnected = await testConnection()

      if (isConnected && sessionRefreshed) {
        console.log("✅ Reconnection successful")
        setConnectionState((prev) => ({
          ...prev,
          isConnected: true,
          isReconnecting: false,
          retryCount: 0,
        }))
        onReconnect?.()
      } else {
        throw new Error("Connection test failed")
      }
    } catch (error) {
      console.error("Reconnection failed:", error)

      // Schedule next retry with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, connectionState.retryCount), 30000)

      retryTimeoutRef.current = setTimeout(() => {
        setConnectionState((prev) => ({ ...prev, isReconnecting: false }))
        attemptReconnection()
      }, delay)
    }
  }, [
    connectionState.isReconnecting,
    connectionState.retryCount,
    maxRetries,
    refreshSession,
    testConnection,
    onReconnect,
  ])

  // Force reconnection (manual retry)
  const forceReconnect = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
    }

    setConnectionState((prev) => ({
      ...prev,
      retryCount: 0,
      isReconnecting: false,
    }))

    attemptReconnection()
  }, [attemptReconnection])

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      console.log("🌐 Network connection restored")
      setConnectionState((prev) => ({ ...prev, isOnline: true }))

      // Test database connection when coming back online
      testConnection().then((isConnected) => {
        if (isConnected) {
          setConnectionState((prev) => ({ ...prev, isConnected: true, retryCount: 0 }))
          onReconnect?.()
        } else {
          attemptReconnection()
        }
      })
    }

    const handleOffline = () => {
      console.log("📵 Network connection lost")
      setConnectionState((prev) => ({
        ...prev,
        isOnline: false,
        isConnected: false,
        isReconnecting: false,
      }))
      onDisconnect?.()
    }

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline)
      window.addEventListener("offline", handleOffline)

      return () => {
        window.removeEventListener("online", handleOnline)
        window.removeEventListener("offline", handleOffline)
      }
    }
  }, [testConnection, attemptReconnection, onReconnect, onDisconnect])

  // Handle visibility change (tab switching, phone lock/unlock)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (typeof document === "undefined") return

      if (document.visibilityState === "visible") {
        const timeSinceLastActivity = Date.now() - lastActivityRef.current

        // If user was away for more than 5 minutes, check connection
        if (timeSinceLastActivity > 5 * 60 * 1000) {
          console.log("🔄 User returned after long absence, checking connection...")

          const isConnected = await testConnection()
          if (!isConnected) {
            setConnectionState((prev) => ({ ...prev, isConnected: false }))
            attemptReconnection()
          } else {
            // Refresh session to prevent token expiration
            await refreshSession()
            onReconnect?.()
          }
        }

        lastActivityRef.current = Date.now()
      }
    }

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange)

      return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange)
      }
    }
  }, [testConnection, attemptReconnection, refreshSession, onReconnect])

  // Periodic connection check
  useEffect(() => {
    if (checkInterval > 0) {
      checkIntervalRef.current = setInterval(async () => {
        if (connectionState.isOnline && !connectionState.isReconnecting) {
          const isConnected = await testConnection()

          if (!isConnected && connectionState.isConnected) {
            console.log("⚠️ Connection lost during periodic check")
            setConnectionState((prev) => ({ ...prev, isConnected: false }))
            onDisconnect?.()
            attemptReconnection()
          }
        }
      }, checkInterval)

      return () => {
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current)
        }
      }
    }
  }, [
    checkInterval,
    connectionState.isOnline,
    connectionState.isReconnecting,
    connectionState.isConnected,
    testConnection,
    onDisconnect,
    attemptReconnection,
  ])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
      }
    }
  }, [])

  return {
    isOnline: connectionState.isOnline,
    isConnected: connectionState.isConnected,
    isReconnecting: connectionState.isReconnecting,
    retryCount: connectionState.retryCount,
    forceReconnect,
  }
}
