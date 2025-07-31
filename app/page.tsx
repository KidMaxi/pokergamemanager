"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"
import type {
  Player,
  GameSession,
  View,
  PlayerInGame,
  PlayerManagementProps as PMPropsInternal,
  ActiveGameScreenProps as AGScreenPropsInternal,
} from "../types"
import { generateId, generateLogId } from "../utils"
import { usePWA } from "../hooks/usePWA"
import { useEnhancedGameState } from "../hooks/useEnhancedGameState"
import { StatePersistenceManager } from "../utils/statePersistenceManager"
import { PerformanceMonitor } from "../utils/performanceMonitor"
import Navbar from "../components/Navbar"
import PlayerManagement from "../components/PlayerManagement"
import GameDashboard from "../components/GameDashboard"
import ActiveGameScreen from "../components/ActiveGameScreen"
import FriendsPage from "../components/FriendsPage"
import PWAInstall from "../components/PWAInstall"
import AuthModal from "../components/auth/AuthModal"
import EmailVerificationScreen from "../components/auth/EmailVerificationScreen"
import GameStateDebugPanel from "../components/debug/GameStateDebugPanel"

export default function Home() {
  const {
    user,
    loading: authLoading,
    emailVerified,
    isConnected,
    reconnectAttempts,
    forceRefresh: forceAuthRefresh,
  } = useAuth()

  const [players, setPlayers] = useState<Player[]>([])
  const [currentView, setCurrentView] = useState<View>("dashboard")
  const [activeGameId, setActiveGameId] = useState<string | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [profile, setProfile] = useState<any | null>(null)
  const [showDebugPanel, setShowDebugPanel] = useState(false)

  const performanceMonitorRef = useRef<PerformanceMonitor | null>(null)
  const profileCacheRef = useRef<{ [key: string]: any }>({})
  const lastProfileFetchRef = useRef<{ [key: string]: number }>({})
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const profileFetchCooldown = 60000 // 1 minute cooldown for profile fetching

  // Initialize performance monitor
  useEffect(() => {
    if (typeof window !== "undefined" && !performanceMonitorRef.current) {
      performanceMonitorRef.current = PerformanceMonitor.getInstance()
    }
  }, [])

  // Use enhanced game state management with optimized settings
  const {
    sessions: gameSessions,
    loading: gameStateLoading,
    error: gameStateError,
    isOnline,
    lastSyncTime,
    setSessions: setGameSessions,
    addSession,
    updateSession,
    removeSession,
    syncWithDatabase,
    forceRefresh: forceGameStateRefresh,
    clearError: clearGameStateError,
  } = useEnhancedGameState({
    userId: user?.id,
    autoSave: true,
    autoSaveInterval: 120000, // Increased to 2 minutes
  })

  const loading = authLoading || gameStateLoading

  usePWA()

  // Restore view state on mount with debouncing
  useEffect(() => {
    const restoreState = () => {
      const savedState = StatePersistenceManager.loadState()
      if (savedState) {
        if (savedState.currentView && savedState.currentView !== "dashboard") {
          setCurrentView(savedState.currentView as View)
        }
        if (savedState.activeGameId) {
          setActiveGameId(savedState.activeGameId)
        }
      }
    }

    // Delay state restoration to allow other initialization to complete
    const timeout = setTimeout(restoreState, 500)
    return () => clearTimeout(timeout)
  }, [])

  // Save view state when it changes with debouncing
  useEffect(() => {
    if (loading) return

    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
    }

    refreshTimeoutRef.current = setTimeout(() => {
      StatePersistenceManager.saveState({
        sessions: gameSessions,
        currentView,
        activeGameId,
      })
    }, 1000)

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
    }
  }, [currentView, activeGameId, gameSessions, loading])

  // Handle connection status changes with reduced logging
  useEffect(() => {
    if (!isConnected && reconnectAttempts > 0 && reconnectAttempts <= 3) {
      console.log(`Connection lost, attempting reconnection (${reconnectAttempts}/3)`)
    } else if (isConnected && reconnectAttempts > 0) {
      console.log("Connection restored")
    }
  }, [isConnected, reconnectAttempts])

  // Handle game state errors with auto-clear
  useEffect(() => {
    if (gameStateError) {
      console.error("Game state error:", gameStateError)
      // Auto-clear error after 15 seconds
      const timer = setTimeout(clearGameStateError, 15000)
      return () => clearTimeout(timer)
    }
  }, [gameStateError, clearGameStateError])

  // Periodic cleanup with longer intervals
  useEffect(() => {
    const cleanup = () => {
      StatePersistenceManager.cleanup()

      // Clear old profile cache entries
      const now = Date.now()
      Object.keys(profileCacheRef.current).forEach((userId) => {
        const lastFetch = lastProfileFetchRef.current[userId] || 0
        if (now - lastFetch > 24 * 60 * 60 * 1000) {
          // 24 hours
          delete profileCacheRef.current[userId]
          delete lastProfileFetchRef.current[userId]
        }
      })

      console.log("Performed periodic cleanup")
    }

    // Run cleanup every 2 hours
    const interval = setInterval(cleanup, 2 * 60 * 60 * 1000)

    // Run initial cleanup after 10 minutes
    const initialCleanup = setTimeout(cleanup, 10 * 60 * 1000)

    return () => {
      clearInterval(interval)
      clearTimeout(initialCleanup)
    }
  }, [])

  // Optimized profile fetching with caching
  const fetchProfile = useCallback(async () => {
    if (!user) return

    const userId = user.id
    const now = Date.now()
    const lastFetch = lastProfileFetchRef.current[userId] || 0
    const cached = profileCacheRef.current[userId]

    // Use cached profile if recent
    if (cached && now - lastFetch < profileFetchCooldown) {
      setProfile(cached)
      return
    }

    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()

      if (error) {
        console.error("Error fetching profile:", error)
        // Use cached version if available
        if (cached) {
          setProfile(cached)
        }
        return
      }

      // Update cache
      profileCacheRef.current[userId] = data
      lastProfileFetchRef.current[userId] = now
      setProfile(data)
    } catch (error) {
      console.error("Error fetching profile:", error)
      // Use cached version if available
      if (cached) {
        setProfile(cached)
      }
    }
  }, [user])

  // Load profile when user changes with debouncing
  useEffect(() => {
    if (user && emailVerified) {
      // Delay profile fetch to avoid blocking UI
      const timeout = setTimeout(fetchProfile, 100)
      return () => clearTimeout(timeout)
    } else {
      setProfile(null)
    }
  }, [user, emailVerified, fetchProfile])

  // Optimized game invitation sending
  const sendGameInvitations = useCallback(
    async (gameSessionId: string, invitedUserIds: string[]) => {
      if (!invitedUserIds.length || !user) return

      try {
        const invitations = invitedUserIds.map((friendId) => ({
          game_session_id: gameSessionId,
          inviter_id: user.id,
          invitee_id: friendId,
          status: "pending" as const,
        }))

        const { error } = await supabase.from("game_invitations").insert(invitations)

        if (error) {
          console.error("Error sending invitations:", error)
        } else {
          console.log(`Sent ${invitations.length} game invitations`)
        }
      } catch (error) {
        console.error("Error sending game invitations:", error)
      }
    },
    [user],
  )

  // Database operations with better error handling
  const saveGameSessionToDatabase = useCallback(
    async (session: GameSession) => {
      if (!user) throw new Error("No user logged in")

      try {
        const insertData: any = {
          id: session.id,
          user_id: user.id,
          name: session.name,
          start_time: session.startTime,
          end_time: session.endTime,
          status: session.status,
          point_to_cash_rate: session.pointToCashRate,
          players_data: session.playersInGame,
          game_metadata: {
            standardBuyInAmount: session.standardBuyInAmount,
          },
        }

        if (session.invitedUsers && session.invitedUsers.length > 0) {
          insertData.invited_users = session.invitedUsers
        }

        const { error } = await supabase.from("game_sessions").insert(insertData)
        if (error) throw error

        console.log("Game session saved to database")
      } catch (error) {
        console.error("Error saving game session:", error)
        throw error
      }
    },
    [user],
  )

  const updateGameSessionInDatabase = useCallback(
    async (session: GameSession) => {
      if (!user) throw new Error("No user logged in")

      if (session.isOwner === false) {
        throw new Error("You don't have permission to update this game")
      }

      try {
        const updateData: any = {
          name: session.name,
          end_time: session.endTime,
          status: session.status,
          point_to_cash_rate: session.pointToCashRate,
          players_data: session.playersInGame,
          game_metadata: {
            standardBuyInAmount: session.standardBuyInAmount,
          },
        }

        if (session.invitedUsers) {
          updateData.invited_users = session.invitedUsers
        }

        const { error } = await supabase
          .from("game_sessions")
          .update(updateData)
          .eq("id", session.id)
          .eq("user_id", user.id)

        if (error) throw error

        console.log("Game session updated in database")
      } catch (error) {
        console.error("Error updating game session:", error)
        throw error
      }
    },
    [user],
  )

  const updateUserStatsAfterGameCompletion = useCallback(
    async (session: GameSession) => {
      if (!user) return

      try {
        const allParticipantIds = [user.id, ...(session.invitedUsers || [])]

        const { data: participantProfiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", allParticipantIds)

        if (profilesError) {
          console.error("Error fetching participant profiles:", profilesError)
          return
        }

        for (const participantProfile of participantProfiles) {
          const userPlayer = session.playersInGame.find(
            (player) => player.name.toLowerCase() === participantProfile.full_name?.toLowerCase(),
          )

          if (userPlayer) {
            const totalBuyIn = userPlayer.buyIns.reduce((sum, buyIn) => sum + buyIn.amount, 0)
            const profitLoss = userPlayer.cashOutAmount - totalBuyIn

            const { error } = await supabase.rpc("update_user_game_stats", {
              user_id_param: participantProfile.id,
              profit_loss_amount: profitLoss,
            })

            if (error) {
              console.error(`Error updating stats for user ${participantProfile.id}:`, error)
            } else {
              console.log(`Updated stats for ${participantProfile.full_name}: P/L ${profitLoss}`)
            }
          }
        }
      } catch (error) {
        console.error("Error updating user stats:", error)
      }
    },
    [user],
  )

  const createPlayerWithBuyIn = useCallback(
    (name: string, standardBuyInAmount: number, pointToCashRate: number): PlayerInGame => {
      const initialBuyIn = {
        logId: generateLogId(),
        amount: standardBuyInAmount,
        time: new Date().toISOString(),
      }

      const pointsFromBuyIn = Math.floor(standardBuyInAmount / pointToCashRate)

      return {
        playerId: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: name,
        pointStack: pointsFromBuyIn,
        buyIns: [initialBuyIn],
        cashOutAmount: 0,
        cashOutLog: [],
        status: "active",
      }
    },
    [],
  )

  const handleAddNewPlayerGlobally = useCallback(async (name: string): Promise<Player | null> => {
    if (!name.trim()) {
      alert("Player name cannot be empty.")
      return null
    }
    return { id: generateId(), name: name.trim() }
  }, [])

  const handleStartNewGame = useCallback(
    async (session: GameSession) => {
      const newSessionWithDefaults = {
        ...session,
        currentPhysicalPointsOnTable: 0,
        playersInGame: [],
      }

      // Automatically add the current user as a player with standard buy-in
      if (user && profile?.full_name) {
        const userPlayerWithBuyIn = createPlayerWithBuyIn(
          profile.full_name,
          session.standardBuyInAmount,
          session.pointToCashRate,
        )

        newSessionWithDefaults.playersInGame = [userPlayerWithBuyIn]
        newSessionWithDefaults.currentPhysicalPointsOnTable = userPlayerWithBuyIn.pointStack
      }

      try {
        await saveGameSessionToDatabase(newSessionWithDefaults)

        if (session.invitedUsers && session.invitedUsers.length > 0) {
          try {
            await sendGameInvitations(newSessionWithDefaults.id, session.invitedUsers)
          } catch (error) {
            console.error("Error sending invitations:", error)
          }
        }

        addSession(newSessionWithDefaults)
        setActiveGameId(newSessionWithDefaults.id)
        setCurrentView("activeGame")
      } catch (error) {
        alert("Failed to create game. Please try again.")
      }
    },
    [user, profile, createPlayerWithBuyIn, saveGameSessionToDatabase, sendGameInvitations, addSession],
  )

  const handleSelectGame = useCallback((gameId: string) => {
    setActiveGameId(gameId)
    setCurrentView("activeGame")
  }, [])

  const handleUpdateSession = useCallback(
    async (updatedSession: GameSession) => {
      try {
        if (updatedSession.isOwner === false) {
          alert("You don't have permission to modify this game.")
          return
        }

        await updateGameSessionInDatabase(updatedSession)
        updateSession(updatedSession.id, updatedSession)
        console.log("Session updated successfully")
      } catch (error) {
        console.error("Error updating session:", error)

        if (updatedSession.isOwner === false) {
          alert("Failed to update game. You may not have permission to modify this game.")
          return
        }

        // Still update local state for owners even if database update fails
        updateSession(updatedSession.id, updatedSession)
        console.warn("Session updated locally but may not be saved to database")
      }
    },
    [updateGameSessionInDatabase, updateSession],
  )

  const handleEndGame = useCallback(
    async (finalizedSession: GameSession) => {
      const completedSession = {
        ...finalizedSession,
        status: "completed" as const,
        endTime: finalizedSession.endTime || new Date().toISOString(),
        currentPhysicalPointsOnTable: 0,
      }

      try {
        await updateGameSessionInDatabase(completedSession)
        await updateUserStatsAfterGameCompletion(completedSession)
        updateSession(completedSession.id, completedSession)
      } catch (error) {
        console.error("Error ending game:", error)
        updateSession(completedSession.id, completedSession)
      }
    },
    [updateGameSessionInDatabase, updateUserStatsAfterGameCompletion, updateSession],
  )

  const handleDeleteGame = useCallback(
    async (sessionId: string) => {
      try {
        const gameToDelete = gameSessions.find((s) => s.id === sessionId)

        if (!gameToDelete) {
          alert("Game not found.")
          return
        }

        if (gameToDelete.isOwner !== false) {
          const { error } = await supabase.from("game_sessions").delete().eq("id", sessionId).eq("user_id", user!.id)

          if (error) throw error
          console.log("Game deleted successfully from database")
        } else {
          try {
            await supabase.from("game_invitations").delete().eq("game_session_id", sessionId).eq("invitee_id", user!.id)
            console.log("Invitation record removed")
          } catch (error) {
            console.warn("Could not remove invitation record:", error)
          }
        }

        removeSession(sessionId)

        if (activeGameId === sessionId) {
          setActiveGameId(null)
          setCurrentView("dashboard")
        }

        console.log(gameToDelete.isOwner !== false ? "Game deleted successfully" : "Game removed from dashboard")
      } catch (error) {
        console.error("Error deleting/removing game:", error)
        alert("Failed to delete/remove game. Please try again.")
      }
    },
    [gameSessions, user, removeSession, activeGameId],
  )

  const handleNavigateToDashboard = useCallback(() => {
    setCurrentView("dashboard")
    setActiveGameId(null)
  }, [])

  const handleForceRefresh = useCallback(async () => {
    try {
      console.log("Force refreshing application state...")

      // Clear caches
      profileCacheRef.current = {}
      lastProfileFetchRef.current = {}

      await Promise.all([forceAuthRefresh(), forceGameStateRefresh()])
      console.log("Force refresh completed")
    } catch (error) {
      console.error("Force refresh failed:", error)
    }
  }, [forceAuthRefresh, forceGameStateRefresh])

  const getBackgroundClass = () => {
    if (currentView === "dashboard") {
      return "dashboard-background"
    }
    return "default-background"
  }

  const renderConnectionStatus = () => {
    if (!isConnected && user) {
      return (
        <div className="bg-yellow-900/20 border border-yellow-800 text-yellow-400 px-4 py-2 text-sm">
          <div className="flex items-center justify-between">
            <span>
              {reconnectAttempts > 0
                ? `Reconnecting... (${reconnectAttempts}/3)`
                : "Connection lost. Some features may be limited."}
            </span>
            <button onClick={handleForceRefresh} className="text-yellow-300 hover:text-yellow-100 underline ml-4">
              Retry
            </button>
          </div>
        </div>
      )
    }

    if (gameStateError) {
      return (
        <div className="bg-red-900/20 border border-red-800 text-red-400 px-4 py-2 text-sm">
          <div className="flex items-center justify-between">
            <span>Error: {gameStateError}</span>
            <button onClick={clearGameStateError} className="text-red-300 hover:text-red-100 underline ml-4">
              Dismiss
            </button>
          </div>
        </div>
      )
    }

    if (!isOnline) {
      return (
        <div className="bg-orange-900/20 border border-orange-800 text-orange-400 px-4 py-2 text-sm">
          <span>You're offline. Changes will sync when connection is restored.</span>
        </div>
      )
    }

    return null
  }

  const renderView = () => {
    // Show loading screen while checking auth
    if (authLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface-main">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary mx-auto mb-4"></div>
            <p className="text-text-secondary">Initializing...</p>
          </div>
        </div>
      )
    }

    // Show login screen if no user
    if (!user) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface-main px-4">
          <div className="text-center space-y-4 sm:space-y-6 max-w-sm sm:max-w-md mx-auto p-4 sm:p-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary leading-tight">
              Welcome to Poker Home Game Manager
            </h1>
            <p className="text-text-secondary text-sm sm:text-base leading-relaxed">
              Track your poker games, manage players, and settle up with ease. Sign in to get started or create a new
              account.
            </p>
            <div className="space-y-3 pt-2">
              <button
                onClick={() => setShowAuthModal(true)}
                className="w-full bg-brand-primary text-white py-3 px-6 rounded-lg font-medium hover:bg-brand-secondary transition-colors text-base sm:text-lg"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      )
    }

    // Show email verification screen if user exists but email not verified
    if (user && !emailVerified) {
      return <EmailVerificationScreen />
    }

    // Show main app loading if user is verified but data is still loading
    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface-main">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary mx-auto mb-4"></div>
            <p className="text-text-secondary">Loading your data...</p>
            {lastSyncTime && (
              <p className="text-text-secondary text-xs mt-2">
                Last sync: {new Date(lastSyncTime).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
      )
    }

    // Show main application views
    switch (currentView) {
      case "friends":
        return <FriendsPage />
      case "managePlayers":
        const playerManagementProps: PMPropsInternal = {
          players: [],
          gameSessions: gameSessions,
          onAddPlayer: () => {},
          onEditPlayer: () => {},
          onDeletePlayer: () => null,
        }
        return <PlayerManagement {...playerManagementProps} />
      case "activeGame":
        const activeSession = gameSessions.find((gs) => gs.id === activeGameId)
        if (activeSession) {
          const activeGameScreenProps: AGScreenPropsInternal = {
            session: activeSession,
            players: [],
            onUpdateSession: handleUpdateSession,
            onEndGame: handleEndGame,
            onNavigateToDashboard: handleNavigateToDashboard,
            onAddNewPlayerGlobally: handleAddNewPlayerGlobally,
          }
          return <ActiveGameScreen {...activeGameScreenProps} />
        }
        setCurrentView("dashboard")
        setActiveGameId(null)
        return (
          <GameDashboard
            players={[]}
            gameSessions={gameSessions}
            onStartNewGame={handleStartNewGame}
            onSelectGame={handleSelectGame}
            onDeleteGame={handleDeleteGame}
          />
        )
      case "dashboard":
      default:
        return (
          <GameDashboard
            players={[]}
            gameSessions={gameSessions}
            onStartNewGame={handleStartNewGame}
            onSelectGame={handleSelectGame}
            onDeleteGame={handleDeleteGame}
          />
        )
    }
  }

  return (
    <div className={`min-h-screen flex flex-col bg-surface-main ${getBackgroundClass()}`}>
      {/* Connection status bar */}
      {renderConnectionStatus()}

      {/* Only show navbar if user is verified */}
      {user && emailVerified && (
        <Navbar
          setCurrentView={(view) => {
            if (view === "dashboard") {
              setActiveGameId(null)
            }
            setCurrentView(view)
          }}
          activeView={currentView}
          user={user}
        />
      )}

      <main className="flex-grow bg-transparent">{renderView()}</main>

      {/* Only show footer if user is verified */}
      {user && emailVerified && (
        <footer className="bg-slate-900 text-center p-4 text-sm text-slate-500 border-t border-slate-700">
          <div className="flex flex-col sm:flex-row items-center justify-between">
            <span>Poker Homegame Manager V53 - Optimized Performance &copy; {new Date().getFullYear()}</span>
            <div className="flex items-center space-x-4 mt-2 sm:mt-0 text-xs">
              <span className={`flex items-center ${isOnline ? "text-green-400" : "text-red-400"}`}>
                <div className={`w-2 h-2 rounded-full mr-1 ${isOnline ? "bg-green-400" : "bg-red-400"}`}></div>
                {isOnline ? "Online" : "Offline"}
              </span>
              {lastSyncTime && (
                <span className="text-slate-400">Synced: {new Date(lastSyncTime).toLocaleTimeString()}</span>
              )}
              {performanceMonitorRef.current && (
                <span className="text-slate-400">
                  Perf: {performanceMonitorRef.current.getLatestMetrics()?.memoryUsage.toFixed(1) || "0"}MB
                </span>
              )}
            </div>
          </div>
        </footer>
      )}

      {/* Only show PWA install if user is verified */}
      {user && emailVerified && <PWAInstall />}

      {/* Debug Panel - only show in development or for testing */}
      {user && emailVerified && process.env.NODE_ENV === "development" && (
        <GameStateDebugPanel sessions={gameSessions} onSessionsUpdate={setGameSessions} />
      )}

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} initialMode="signin" />
    </div>
  )
}
