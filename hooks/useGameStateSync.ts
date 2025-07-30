"use client"

import { useEffect, useRef, useCallback } from "react"
import type { GameSession } from "../types"
import { GameStateManager } from "../utils/gameStateManager"
import { GameStateValidator } from "../utils/gameStateValidator"

interface UseGameStateSyncOptions {
  sessions: GameSession[]
  onSessionsUpdate: (sessions: GameSession[]) => void
  autoSaveInterval?: number
  enableVisibilitySync?: boolean
}

interface GameStateSyncReturn {
  forceSync: () => void
  saveState: () => void
  loadState: () => GameSession[]
  clearState: () => void
  getRefreshCount: () => number
  getDiagnostics: () => any
}

export function useGameStateSync({
  sessions,
  onSessionsUpdate,
  autoSaveInterval = 30000,
  enableVisibilitySync = true,
}: UseGameStateSyncOptions): GameStateSyncReturn {
  const lastSaveHash = useRef<string>("")
  const refreshCountRef = useRef<number>(0)
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Generate hash for sessions to detect changes
  const generateSessionsHash = useCallback((sessions: GameSession[]): string => {
    return JSON.stringify(sessions.map((s) => ({ id: s.id, status: s.status, playersInGame: s.playersInGame })))
  }, [])

  // Save state to localStorage
  const saveState = useCallback(() => {
    const currentHash = generateSessionsHash(sessions)
    if (currentHash !== lastSaveHash.current) {
      try {
        // Validate sessions before saving
        const validatedSessions = sessions.map((session) => {
          const validation = GameStateValidator.validateSession(session)
          if (!validation.isValid) {
            console.warn(`Session ${session.name} has validation issues:`, validation.errors)
            return GameStateValidator.repairSession(session)
          }
          return session
        })

        GameStateManager.saveGameState(validatedSessions)
        lastSaveHash.current = currentHash
        console.log("Game state auto-saved", { sessionCount: validatedSessions.length })
      } catch (error) {
        console.error("Failed to auto-save game state:", error)
      }
    }
  }, [sessions, generateSessionsHash])

  // Load state from localStorage
  const loadState = useCallback((): GameSession[] => {
    try {
      const loadedSessions = GameStateManager.loadGameState()
      console.log("Game state loaded from storage", { sessionCount: loadedSessions.length })
      return loadedSessions
    } catch (error) {
      console.error("Failed to load game state:", error)
      return []
    }
  }, [])

  // Force sync - load from storage and update state
  const forceSync = useCallback(() => {
    const loadedSessions = loadState()
    if (loadedSessions.length > 0) {
      onSessionsUpdate(loadedSessions)
      console.log("Forced sync completed", { sessionCount: loadedSessions.length })
    }
  }, [loadState, onSessionsUpdate])

  // Clear all stored state
  const clearState = useCallback(() => {
    GameStateManager.clearAllData()
    lastSaveHash.current = ""
    console.log("Game state cleared")
  }, [])

  // Get refresh count
  const getRefreshCount = useCallback(() => {
    return refreshCountRef.current
  }, [])

  // Get diagnostics
  const getDiagnostics = useCallback(() => {
    return {
      ...GameStateManager.getDiagnostics(),
      refreshCount: refreshCountRef.current,
      lastSaveHash: lastSaveHash.current,
      currentSessionsCount: sessions.length,
    }
  }, [sessions.length])

  // Track page refreshes
  useEffect(() => {
    const handleBeforeUnload = () => {
      refreshCountRef.current += 1
      localStorage.setItem("poker-refresh-count", refreshCountRef.current.toString())
      saveState() // Save before page unload
    }

    // Load refresh count on mount
    const storedRefreshCount = localStorage.getItem("poker-refresh-count")
    if (storedRefreshCount) {
      refreshCountRef.current = Number.parseInt(storedRefreshCount, 10) || 0
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [saveState])

  // Auto-save interval
  useEffect(() => {
    if (autoSaveInterval > 0) {
      autoSaveIntervalRef.current = setInterval(saveState, autoSaveInterval)
      return () => {
        if (autoSaveIntervalRef.current) {
          clearInterval(autoSaveIntervalRef.current)
        }
      }
    }
  }, [saveState, autoSaveInterval])

  // Visibility change sync
  useEffect(() => {
    if (!enableVisibilitySync) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Page became visible - potentially sync state
        console.log("Page became visible, checking for state sync")
        const loadedSessions = loadState()
        const currentHash = generateSessionsHash(sessions)
        const loadedHash = generateSessionsHash(loadedSessions)

        if (loadedHash !== currentHash && loadedSessions.length > 0) {
          console.log("State mismatch detected, syncing from storage")
          onSessionsUpdate(loadedSessions)
        }
      } else {
        // Page became hidden - save current state
        saveState()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [enableVisibilitySync, loadState, saveState, sessions, generateSessionsHash, onSessionsUpdate])

  // Save state when sessions change
  useEffect(() => {
    if (sessions.length > 0) {
      const timeoutId = setTimeout(saveState, 1000) // Debounce saves
      return () => clearTimeout(timeoutId)
    }
  }, [sessions, saveState])

  return {
    forceSync,
    saveState,
    loadState,
    clearState,
    getRefreshCount,
    getDiagnostics,
  }
}
