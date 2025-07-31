"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { GameSession } from "../types"
import { StatePersistenceManager } from "../utils/statePersistenceManager"
import { PerformanceMonitor } from "../utils/performanceMonitor"
import { supabase } from "../lib/supabase"

interface UseEnhancedGameStateOptions {
  userId?: string
  autoSave?: boolean
  autoSaveInterval?: number
}

interface UseEnhancedGameStateReturn {
  sessions: GameSession[]
  loading: boolean
  error: string | null
  isOnline: boolean
  lastSyncTime: number | null
  setSessions: (sessions: GameSession[]) => void
  addSession: (session: GameSession) => void
  updateSession: (sessionId: string, updates: Partial<GameSession>) => void
  removeSession: (sessionId: string) => void
  syncWithDatabase: () => Promise<void>
  forceRefresh: () => Promise<void>
  clearError: () => void
}

export function useEnhancedGameState(options: UseEnhancedGameStateOptions = {}): UseEnhancedGameStateReturn {
  const { userId, autoSave = true, autoSaveInterval = 60000 } = options // Increased interval to 1 minute

  const [sessions, setSessions] = useState<GameSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(typeof window !== "undefined" ? navigator.onLine : true)
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null)

  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const performanceMonitorRef = useRef<PerformanceMonitor | null>(null)
  const lastSaveHashRef = useRef<string>("")
  const syncInProgressRef = useRef(false)
  const lastSyncAttemptRef = useRef(0)
  const syncCooldownRef = useRef(30000) // 30 seconds minimum between syncs
  const isClient = typeof window !== "undefined"

  // Initialize performance monitor on client side only
  useEffect(() => {
    if (isClient && !performanceMonitorRef.current) {
      performanceMonitorRef.current = PerformanceMonitor.getInstance()
    }
  }, [isClient])

  // Generate hash for change detection
  const generateSessionsHash = useCallback((sessions: GameSession[]): string => {
    return JSON.stringify(
      sessions.map((s) => ({
        id: s.id,
        status: s.status,
        playersCount: s.playersInGame.length,
        endTime: s.endTime,
      })),
    )
  }, [])

  // Save to local storage with debouncing
  const saveToLocalStorage = useCallback(
    (sessionsToSave: GameSession[]) => {
      if (!isClient) return

      const currentHash = generateSessionsHash(sessionsToSave)

      if (currentHash !== lastSaveHashRef.current) {
        StatePersistenceManager.saveState({ sessions: sessionsToSave })
        lastSaveHashRef.current = currentHash
        console.log("Sessions saved to local storage", { count: sessionsToSave.length })
      }
    },
    [generateSessionsHash, isClient],
  )

  // Load from local storage
  const loadFromLocalStorage = useCallback((): GameSession[] => {
    if (!isClient) return []
    const state = StatePersistenceManager.loadState()
    return state?.sessions || []
  }, [isClient])

  // Sync with database with cooldown and deduplication
  const syncWithDatabase = useCallback(async () => {
    if (!userId || !isClient || syncInProgressRef.current) return

    // Implement cooldown to prevent excessive syncing
    const now = Date.now()
    if (now - lastSyncAttemptRef.current < syncCooldownRef.current) {
      console.log("Sync skipped due to cooldown")
      return
    }

    lastSyncAttemptRef.current = now
    syncInProgressRef.current = true

    try {
      setError(null)
      performanceMonitorRef.current?.markRenderStart()

      // Load games created by the user
      const { data: ownedGames, error: ownedError } = await supabase
        .from("game_sessions")
        .select("id, name, start_time, end_time, status, point_to_cash_rate, players_data, invited_users, user_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50) // Limit to prevent excessive data loading

      if (ownedError) throw ownedError

      // Load games where user was invited (with limit)
      let invitedGames: any[] = []
      try {
        const { data: invitations, error: invitationsError } = await supabase
          .from("game_invitations")
          .select(`
            game_session_id,
            game_session:game_sessions(
              id, name, start_time, end_time, status, point_to_cash_rate, players_data, invited_users, user_id
            )
          `)
          .eq("invitee_id", userId)
          .eq("status", "accepted")
          .limit(25) // Limit invited games

        if (!invitationsError && invitations) {
          invitedGames = invitations.filter((inv) => inv.game_session).map((inv) => inv.game_session)
        }
      } catch (error) {
        console.log("Game invitations not available, skipping")
      }

      // Combine and deduplicate games
      const allGamesMap = new Map()

      ownedGames?.forEach((game) => {
        allGamesMap.set(game.id, { ...game, isOwner: true })
      })

      invitedGames.forEach((game) => {
        if (!allGamesMap.has(game.id)) {
          allGamesMap.set(game.id, { ...game, isOwner: false })
        }
      })

      // Transform to GameSession format
      const transformedSessions: GameSession[] = Array.from(allGamesMap.values()).map((session) => ({
        id: session.id,
        name: session.name,
        startTime: session.start_time,
        endTime: session.end_time,
        status: session.status,
        pointToCashRate: session.point_to_cash_rate,
        standardBuyInAmount: 25,
        currentPhysicalPointsOnTable: 0,
        playersInGame: session.players_data || [],
        invitedUsers: session.invited_users || [],
        isOwner: session.isOwner,
      }))

      // Calculate physical points for active games only
      transformedSessions.forEach((session) => {
        if (session.status === "active" || session.status === "pending_close") {
          let calculatedPoints = 0
          session.playersInGame.forEach((player) => {
            if (player.status === "active") {
              calculatedPoints += player.pointStack || 0
            } else if (player.status === "cashed_out_early") {
              calculatedPoints += player.pointsLeftOnTable || 0
            }
          })
          session.currentPhysicalPointsOnTable = calculatedPoints
        }
      })

      setSessions(transformedSessions)
      saveToLocalStorage(transformedSessions)
      setLastSyncTime(Date.now())

      performanceMonitorRef.current?.markRenderEnd()
      console.log("Database sync completed", { sessionCount: transformedSessions.length })
    } catch (error) {
      console.error("Database sync failed:", error)
      setError(`Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`)

      // Fallback to local storage
      const localSessions = loadFromLocalStorage()
      if (localSessions.length > 0) {
        setSessions(localSessions)
        console.log("Loaded from local storage as fallback")
      }
    } finally {
      syncInProgressRef.current = false
    }
  }, [userId, saveToLocalStorage, loadFromLocalStorage, isClient])

  // Force refresh with reset
  const forceRefresh = useCallback(async () => {
    setLoading(true)
    syncInProgressRef.current = false
    lastSyncAttemptRef.current = 0
    try {
      await syncWithDatabase()
    } finally {
      setLoading(false)
    }
  }, [syncWithDatabase])

  // Auto-save functionality with increased debouncing
  useEffect(() => {
    if (!isClient) return

    if (autoSave && sessions.length > 0) {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }

      autoSaveTimeoutRef.current = setTimeout(() => {
        saveToLocalStorage(sessions)
      }, 2000) // Increased debounce to 2 seconds
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [sessions, autoSave, saveToLocalStorage, isClient])

  // Periodic auto-save with longer intervals
  useEffect(() => {
    if (!isClient) return

    if (autoSave && autoSaveInterval > 0) {
      const interval = setInterval(() => {
        if (sessions.length > 0) {
          saveToLocalStorage(sessions)
        }
      }, autoSaveInterval)

      return () => clearInterval(interval)
    }
  }, [autoSave, autoSaveInterval, sessions, saveToLocalStorage, isClient])

  // Online/offline detection with debouncing
  useEffect(() => {
    if (!isClient) return

    let onlineTimeout: NodeJS.Timeout | null = null

    const handleOnline = () => {
      setIsOnline(true)
      console.log("App came online")

      // Debounce sync when coming online
      if (onlineTimeout) clearTimeout(onlineTimeout)
      onlineTimeout = setTimeout(() => {
        if (userId) {
          syncWithDatabase()
        }
      }, 2000)
    }

    const handleOffline = () => {
      setIsOnline(false)
      console.log("App went offline")
      if (onlineTimeout) clearTimeout(onlineTimeout)
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      if (onlineTimeout) clearTimeout(onlineTimeout)
    }
  }, [userId, syncWithDatabase, isClient])

  // Initial load with optimization
  useEffect(() => {
    const initialize = async () => {
      setLoading(true)

      // Load from local storage first for immediate UI
      const localSessions = loadFromLocalStorage()
      if (localSessions.length > 0) {
        setSessions(localSessions)
        console.log("Loaded initial state from local storage")
      }

      // Then sync with database if online and user is available
      if (userId && isOnline) {
        // Delay initial sync to allow UI to render first
        setTimeout(() => {
          syncWithDatabase()
        }, 1000)
      }

      setLoading(false)
    }

    initialize()
  }, [userId, isOnline, loadFromLocalStorage, syncWithDatabase])

  // Session management functions with optimizations
  const addSession = useCallback(
    (session: GameSession) => {
      setSessions((prev) => {
        const updated = [session, ...prev] // Add to beginning for better UX
        saveToLocalStorage(updated)
        return updated
      })
    },
    [saveToLocalStorage],
  )

  const updateSession = useCallback(
    (sessionId: string, updates: Partial<GameSession>) => {
      setSessions((prev) => {
        const updated = prev.map((session) => (session.id === sessionId ? { ...session, ...updates } : session))
        saveToLocalStorage(updated)
        return updated
      })
    },
    [saveToLocalStorage],
  )

  const removeSession = useCallback(
    (sessionId: string) => {
      setSessions((prev) => {
        const updated = prev.filter((session) => session.id !== sessionId)
        saveToLocalStorage(updated)
        return updated
      })
    },
    [saveToLocalStorage],
  )

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
      syncInProgressRef.current = false
    }
  }, [])

  return {
    sessions,
    loading,
    error,
    isOnline,
    lastSyncTime,
    setSessions,
    addSession,
    updateSession,
    removeSession,
    syncWithDatabase,
    forceRefresh,
    clearError,
  }
}
