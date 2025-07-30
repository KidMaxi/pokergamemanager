"use client"

import { useEffect, useRef, useCallback } from "react"
import type { GameSession } from "../types"
import { GameStateManager } from "../utils/gameStateManager"

interface UseGameStateSyncOptions {
  sessions: GameSession[]
  onSessionsUpdate: (sessions: GameSession[]) => void
  autoSaveInterval?: number
  enableVisibilitySync?: boolean
}

export function useGameStateSync({
  sessions,
  onSessionsUpdate,
  autoSaveInterval = 30000, // 30 seconds
  enableVisibilitySync = true,
}: UseGameStateSyncOptions) {
  const lastSaveRef = useRef<string>("")
  const autoSaveIntervalRef = useRef<NodeJS.Timeout>()
  const refreshCountRef = useRef(0)

  // Generate a hash of the sessions for comparison
  const generateSessionsHash = useCallback((sessions: GameSession[]): string => {
    return JSON.stringify(
      sessions.map((s) => ({
        id: s.id,
        status: s.status,
        playersInGame: s.playersInGame.map((p) => ({
          playerId: p.playerId,
          pointStack: p.pointStack,
          cashOutAmount: p.cashOutAmount,
          status: p.status,
          pointsLeftOnTable: p.pointsLeftOnTable,
        })),
        currentPhysicalPointsOnTable: s.currentPhysicalPointsOnTable,
      })),
    )
  }, [])

  // Save sessions to localStorage when they change
  const saveSessionsToStorage = useCallback(
    (sessions: GameSession[]) => {
      const currentHash = generateSessionsHash(sessions)

      // Only save if data has actually changed
      if (currentHash !== lastSaveRef.current) {
        GameStateManager.saveGameState(sessions)
        lastSaveRef.current = currentHash
        console.log("Sessions saved to storage due to changes")
      }
    },
    [generateSessionsHash],
  )

  // Load sessions from localStorage
  const loadSessionsFromStorage = useCallback(() => {
    const loadedSessions = GameStateManager.loadGameState()
    if (loadedSessions.length > 0) {
      onSessionsUpdate(loadedSessions)
      console.log("Sessions loaded from storage")
    }
  }, [onSessionsUpdate])

  // Handle page visibility change (user switches tabs or returns)
  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === "visible" && enableVisibilitySync) {
      // User returned to tab, check for updates
      console.log("Page became visible, checking for state updates")
      loadSessionsFromStorage()
    } else if (document.visibilityState === "hidden") {
      // User left tab, save current state
      console.log("Page became hidden, saving current state")
      saveSessionsToStorage(sessions)
    }
  }, [sessions, saveSessionsToStorage, loadSessionsFromStorage, enableVisibilitySync])

  // Handle page refresh/beforeunload
  const handleBeforeUnload = useCallback(() => {
    console.log("Page unloading, saving final state")
    saveSessionsToStorage(sessions)
  }, [sessions, saveSessionsToStorage])

  // Track refresh frequency
  const trackRefresh = useCallback(() => {
    refreshCountRef.current += 1
    const refreshData = {
      count: refreshCountRef.current,
      timestamp: new Date().toISOString(),
      sessionsCount: sessions.length,
    }
    localStorage.setItem("poker-refresh-tracking", JSON.stringify(refreshData))

    if (refreshCountRef.current > 5) {
      console.warn("High refresh frequency detected", refreshData)
    }
  }, [sessions.length])

  // Initialize on mount
  useEffect(() => {
    trackRefresh()
    loadSessionsFromStorage()
  }, []) // Only run on mount

  // Save sessions when they change
  useEffect(() => {
    if (sessions.length > 0) {
      saveSessionsToStorage(sessions)
    }
  }, [sessions, saveSessionsToStorage])

  // Set up auto-save interval
  useEffect(() => {
    if (autoSaveInterval > 0) {
      autoSaveIntervalRef.current = setInterval(() => {
        if (sessions.length > 0) {
          console.log("Auto-saving sessions")
          saveSessionsToStorage(sessions)
        }
      }, autoSaveInterval)

      return () => {
        if (autoSaveIntervalRef.current) {
          clearInterval(autoSaveIntervalRef.current)
        }
      }
    }
  }, [sessions, autoSaveInterval, saveSessionsToStorage])

  // Set up event listeners
  useEffect(() => {
    if (enableVisibilitySync) {
      document.addEventListener("visibilitychange", handleVisibilityChange)
    }
    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      if (enableVisibilitySync) {
        document.removeEventListener("visibilitychange", handleVisibilityChange)
      }
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [handleVisibilityChange, handleBeforeUnload, enableVisibilitySync])

  // Return utility functions
  return {
    forceSync: loadSessionsFromStorage,
    forceSave: () => saveSessionsToStorage(sessions),
    getDiagnostics: GameStateManager.getDiagnostics,
    getRefreshCount: () => refreshCountRef.current,
  }
}
