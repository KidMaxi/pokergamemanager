"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { supabase } from "../lib/supabase"

interface ConnectionRecoveryOptions {
  onReconnect?: () => void
  onDisconnect?: () => void
  checkInterval?: number
  maxRetries?: number
}

interface ConnectionStatus {
  isOnline: boolean
  isConnected: boolean
  isReconnecting: boolean
}

export function useConnectionRecovery({
  onReconnect,
  onDisconnect,
  checkInterval = 30000,
  maxRetries = 5,
}: ConnectionRecoveryOptions = {}) {
  const [status, setStatus] = useState<ConnectionStatus>({
    isOnline: navigator.onLine,
    isConnected: true,
    isReconnecting: false,
  })

  const retryCount = useRef(0)
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null)
  const checkTimer = useRef<NodeJS.Timeout | null>(null)

  // Test database connection
  const testConnection = useCallback(async (): Promise<boolean> => {
    try {
      const { error } = await supabase.from("profiles").select("id").limit(1).single()

      return !error
    } catch {
      return false
    }
  }, [])

  // Force reconnection attempt
  const forceReconnect = useCallback(async () => {
    if (status.isReconnecting) return

    setStatus((prev) => ({ ...prev, isReconnecting: true }))

    try {
      // Refresh auth session
      const { error } = await supabase.auth.refreshSession()
      if (error) {
        console.warn("Session refresh failed:", error)
      }

      // Test connection
      const isConnected = await testConnection()

      if (isConnected) {
        retryCount.current = 0
        setStatus((prev) => ({
          ...prev,
          isConnected: true,
          isReconnecting: false,
        }))
        onReconnect?.()
      } else {
        throw new Error("Connection test failed")
      }
    } catch (error) {
      console.error("Reconnection failed:", error)

      retryCount.current++

      if (retryCount.current < maxRetries) {
        // Exponential backoff: 2s, 4s, 8s, 16s, 32s
        const delay = Math.min(2000 * Math.pow(2, retryCount.current - 1), 32000)

        reconnectTimer.current = setTimeout(() => {
          forceReconnect()
        }, delay)
      } else {
        setStatus((prev) => ({
          ...prev,
          isConnected: false,
          isReconnecting: false,
        }))
      }
    }
  }, [status.isReconnecting, testConnection, maxRetries, onReconnect])

  // Periodic connection check
  const checkConnection = useCallback(async () => {
    if (!status.isOnline) return

    const isConnected = await testConnection()

    if (!isConnected && status.isConnected) {
      setStatus((prev) => ({ ...prev, isConnected: false }))
      onDisconnect?.()

      // Start reconnection attempts
      forceReconnect()
    } else if (isConnected && !status.isConnected && !status.isReconnecting) {
      setStatus((prev) => ({ ...prev, isConnected: true }))
      onReconnect?.()
    }
  }, [
    status.isOnline,
    status.isConnected,
    status.isReconnecting,
    testConnection,
    onDisconnect,
    onReconnect,
    forceReconnect,
  ])

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setStatus((prev) => ({ ...prev, isOnline: true }))
      // Test connection when coming back online
      setTimeout(checkConnection, 1000)
    }

    const handleOffline = () => {
      setStatus((prev) => ({
        ...prev,
        isOnline: false,
        isConnected: false,
        isReconnecting: false,
      }))
      onDisconnect?.()
    }

    const handleVisibilityChange = () => {
      if (!document.hidden && status.isOnline) {
        // Check connection when tab becomes visible
        setTimeout(checkConnection, 500)
      }
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [checkConnection, status.isOnline, onDisconnect])

  // Periodic connection checks
  useEffect(() => {
    if (checkInterval > 0) {
      checkTimer.current = setInterval(checkConnection, checkInterval)

      return () => {
        if (checkTimer.current) {
          clearInterval(checkTimer.current)
        }
      }
    }
  }, [checkConnection, checkInterval])

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
      }
      if (checkTimer.current) {
        clearInterval(checkTimer.current)
      }
    }
  }, [])

  return {
    isOnline: status.isOnline,
    isConnected: status.isConnected,
    isReconnecting: status.isReconnecting,
    forceReconnect,
  }
}
