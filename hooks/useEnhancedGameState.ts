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
  const { userId, autoSave = true, autoSaveInterval = 30000 } = options

  const [sessions, setSessions] = useState<GameSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null)

  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const performanceMonitor = useRef(PerformanceMonitor.getInstance())
  const lastSaveHashRef = useRef<string>("")

  // Generate hash for change detection
  const generateSessionsHash = useCallback((sessions: GameSession[]): string => {
    return JSON.stringify(
      sessions.map((s) => ({
        id: s.id,
        status: s.status,
        playersInGame: s.playersInGame,
        endTime: s.endTime,
      })),
    )
  }, [])

  // Save to local storage
  const saveToLocalStorage = useCallback(
    (sessionsToSave: GameSession[]) => {
      const currentHash = generateSessionsHash(sessionsToSave)

      if (currentHash !== lastSaveHashRef.current) {
        StatePersistenceManager.saveState({ sessions: sessionsToSave })
        lastSaveHashRef.current = currentHash
        console.log("Sessions saved to local storage", { count: sessionsToSave.length })
      }
    },
    [generateSessionsHash],
  )

  // Load from local storage
  const loadFromLocalStorage = useCallback((): GameSession[] => {
    const state = StatePersistenceManager.loadState()
    return state?.sessions || []
  }, [])

  // Sync with database
  const syncWithDatabase = useCallback(async () => {
    if (!userId) return

    try {
      setError(null)
      performanceMonitor.current.markRenderStart()

      // Load games created by the user
      const { data: ownedGames, error: ownedError } = await supabase
        .from("game_sessions")
        .select("id, name, start_time, end_time, status, point_to_cash_rate, players_data, invited_users, user_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })

      if (ownedError) throw ownedError

      // Load games where user was invited
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

      // Calculate physical points for active games
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

      performanceMonitor.current.markRenderEnd()
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
    }
  }, [userId, saveToLocalStorage, loadFromLocalStorage])

  // Force refresh
  const forceRefresh = useCallback(async () => {
    setLoading(true)
    try {
      await syncWithDatabase()
    } finally {
      setLoading(false)
    }
  }, [syncWithDatabase])

  // Auto-save functionality
  useEffect(() => {
    if (autoSave && sessions.length > 0) {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }

      autoSaveTimeoutRef.current = setTimeout(() => {
        saveToLocalStorage(sessions)
      }, 1000) // Debounce saves
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [sessions, autoSave, saveToLocalStorage])

  // Periodic auto-save
  useEffect(() => {
    if (autoSave && autoSaveInterval > 0) {
      const interval = setInterval(() => {
        if (sessions.length > 0) {
          saveToLocalStorage(sessions)
        }
      }, autoSaveInterval)

      return () => clearInterval(interval)
    }
  }, [autoSave, autoSaveInterval, sessions, saveToLocalStorage])

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      console.log("App came online, syncing with database")
      if (userId) {
        syncWithDatabase()
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
      console.log("App went offline")
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [userId, syncWithDatabase])

  // Initial load
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
        await syncWithDatabase()
      }

      setLoading(false)
    }

    initialize()
  }, [userId, isOnline, loadFromLocalStorage, syncWithDatabase])

  // Session management functions
  const addSession = useCallback(
    (session: GameSession) => {
      setSessions((prev) => {
        const updated = [...prev, session]
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
