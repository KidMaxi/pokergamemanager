"use client"

import { useState, useEffect } from "react"
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
import { useGameStateSync } from "../hooks/useGameStateSync"
import Navbar from "../components/Navbar"
import PlayerManagement from "../components/PlayerManagement"
import GameDashboard from "../components/GameDashboard"
import ActiveGameScreen from "../components/ActiveGameScreen"
import FriendsPage from "../components/FriendsPage"
import PWAInstall from "../components/PWAInstall"
import AuthModal from "../components/auth/AuthModal"
import EmailVerificationScreen from "../components/auth/EmailVerificationScreen"
import GameStateDebugPanel from "../components/debug/GameStateDebugPanel"
import FriendsFeatureTestResults from "../components/debug/FriendsFeatureTestResults"
import InvitationDiagnostics from "../components/debug/InvitationDiagnostics"
import GameInviteSystemAnalysis from "../components/analysis/GameInviteSystemAnalysis"

export default function Home() {
  const { user, loading: authLoading, emailVerified, refreshProfile } = useAuth()
  const [players, setPlayers] = useState<Player[]>([])
  const [gameSessions, setGameSessions] = useState<GameSession[]>([])
  const [currentView, setCurrentView] = useState<View>("dashboard")
  const [activeGameId, setActiveGameId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [profile, setProfile] = useState<any | null>(null)
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  const [showFriendsTest, setShowFriendsTest] = useState(false)
  const [showInvitationDiagnostics, setShowInvitationDiagnostics] = useState(false)
  const [showSystemAnalysis, setShowSystemAnalysis] = useState(false)

  usePWA()

  // Add connection recovery hook for handling idle/background app issues
  const useConnectionRecovery = () => {
    useEffect(() => {
      if (!user) return

      const handleVisibilityChange = async () => {
        if (document.visibilityState === "visible") {
          try {
            console.log("👁️ App became visible, checking connection health...")

            // Test database connection
            const isConnected = await checkConnection()

            if (!isConnected) {
              console.log("🔄 Connection lost, attempting recovery...")
              setLoading(true)

              // Attempt to reload user data
              try {
                await loadUserData()
                console.log("✅ Data recovery successful")
              } catch (error) {
                console.error("❌ Data recovery failed:", error)
                // Try to load from local storage as fallback
                if (gameStateSync.forceSync) {
                  gameStateSync.forceSync()
                }
              } finally {
                setLoading(false)
              }
            } else {
              console.log("✅ Connection healthy")
            }
          } catch (error) {
            console.error("Error during connection recovery:", error)
          }
        }
      }

      const handleNetworkReconnect = async () => {
        if (user) {
          try {
            console.log("🌐 Network reconnected, refreshing app data...")
            setLoading(true)
            await loadUserData()
            console.log("✅ App data refreshed after reconnect")
          } catch (error) {
            console.error("❌ Error refreshing data on reconnect:", error)
          } finally {
            setLoading(false)
          }
        }
      }

      // Add periodic health check for long-running sessions
      const healthCheckInterval = setInterval(async () => {
        // Only run health checks when app is visible and user is active
        if (document.visibilityState === "visible" && user) {
          try {
            const isHealthy = await checkConnection()
            if (!isHealthy) {
              console.log("⚠️ Periodic health check failed, connection may be stale")
              // Don't automatically reload here, just log for awareness
              // User will get recovery on next visibility change
            }
          } catch (error) {
            console.log("Health check error (non-critical):", error)
          }
        }
      }, 120000) // Check every 2 minutes

      // Listen for app visibility changes (tab switch, mobile background/foreground)
      document.addEventListener("visibilitychange", handleVisibilityChange)

      // Listen for network reconnection
      window.addEventListener("online", handleNetworkReconnect)

      return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange)
        window.removeEventListener("online", handleNetworkReconnect)
        clearInterval(healthCheckInterval)
      }
    }, [user, loading])
  }

  // Call the connection recovery hook
  useConnectionRecovery()

  // Use game state sync hook for better refresh handling
  const gameStateSync = useGameStateSync({
    sessions: gameSessions,
    onSessionsUpdate: setGameSessions,
    autoSaveInterval: 30000, // Save every 30 seconds
    enableVisibilitySync: true, // Sync when user switches tabs
  })

  const checkConnection = async () => {
    try {
      const { data, error } = await supabase.from("profiles").select("id").limit(1).single()
      return !error
    } catch {
      return false
    }
  }

  const loadUserData = async () => {
    try {
      setLoading(true)
      console.log("🔄 Loading user data for:", user!.id)

      // Load games created by the user
      let sessionsData
      let sessionsError

      try {
        // Try with invited_users column first
        const result = await supabase
          .from("game_sessions")
          .select("id, name, start_time, end_time, status, point_to_cash_rate, players_data, invited_users, user_id")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })

        sessionsData = result.data
        sessionsError = result.error
        console.log("✅ Loaded owned games:", sessionsData?.length || 0)
      } catch (error) {
        console.log("invited_users column doesn't exist yet, falling back to basic query")

        // Fallback query without invited_users column
        const result = await supabase
          .from("game_sessions")
          .select("id, name, start_time, end_time, status, point_to_cash_rate, players_data, user_id")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })

        sessionsData = result.data
        sessionsError = result.error
      }

      if (sessionsError) {
        console.error("Sessions query error:", sessionsError)
        throw new Error(`Database error: ${sessionsError.message}`)
      }

      // Also load games where the user has accepted invitations
      let invitedGamesData = []
      try {
        console.log("🔍 Loading invited games...")
        const { data: acceptedInvitations, error: invitationsError } = await supabase
          .from("game_invitations")
          .select(`
          game_session_id,
          game_session:game_sessions(
            id, name, start_time, end_time, status, point_to_cash_rate, players_data, invited_users, user_id
          )
        `)
          .eq("invitee_id", user!.id)
          .eq("status", "accepted")

        if (!invitationsError && acceptedInvitations) {
          invitedGamesData = acceptedInvitations.filter((inv) => inv.game_session).map((inv) => inv.game_session)
          console.log("✅ Loaded invited games:", invitedGamesData.length)
        }
      } catch (error) {
        console.log("Game invitations not available yet, skipping invited games")
      }

      // Combine owned games and invited games, removing duplicates
      const allGamesMap = new Map()

      // Add owned games
      sessionsData.forEach((session) => {
        allGamesMap.set(session.id, { ...session, isOwner: true })
      })

      // Add invited games (don't override owned games)
      invitedGamesData.forEach((session) => {
        if (!allGamesMap.has(session.id)) {
          allGamesMap.set(session.id, { ...session, isOwner: false })
        }
      })

      const combinedSessions = Array.from(allGamesMap.values())
      console.log("📊 Total games loaded:", combinedSessions.length, {
        owned: sessionsData?.length || 0,
        invited: invitedGamesData.length,
        combined: combinedSessions.length,
      })

      // Transform database data to match our types with enhanced validation
      const transformedSessions: GameSession[] = combinedSessions.map((session) => {
        const baseSession: GameSession = {
          id: session.id,
          name: session.name,
          startTime: session.start_time,
          endTime: session.end_time,
          status: session.status,
          pointToCashRate: session.point_to_cash_rate,
          standardBuyInAmount: 25, // Default value
          currentPhysicalPointsOnTable: 0, // Will be calculated
          playersInGame: session.players_data || [], // Load from JSONB column
          invitedUsers: session.invited_users || [], // Use empty array if column doesn't exist
          isOwner: session.isOwner, // Track if user owns this game
        }

        // Calculate and validate physical points for active games
        if (baseSession.status === "active" || baseSession.status === "pending_close") {
          let calculatedPoints = 0

          for (const player of baseSession.playersInGame) {
            if (player.status === "active") {
              calculatedPoints += player.pointStack || 0
            } else if (player.status === "cashed_out_early") {
              // Include points left on table by early cashout players
              calculatedPoints += player.pointsLeftOnTable || 0
            }
          }

          baseSession.currentPhysicalPointsOnTable = calculatedPoints
        }

        return baseSession
      })

      console.log("✅ Data transformation complete")
      setGameSessions(transformedSessions)
    } catch (error) {
      console.error("Error loading user data:", error)
      // Fallback: Try to load from local storage
      const localSessions = gameStateSync.forceSync ? [] : []
      setGameSessions(localSessions)
      alert("Unable to load your games from server. Loading local data if available.")
    } finally {
      setLoading(false)
      // Restore current view from localStorage after refresh
      const savedView = localStorage.getItem("poker-current-view")
      if (savedView && (savedView === "friends" || savedView === "dashboard")) {
        setCurrentView(savedView as View)
        localStorage.removeItem("poker-current-view") // Clean up
      }
    }
  }

  // Enhanced useEffect with better refresh handling
  useEffect(() => {
    if (user && !authLoading) {
      // First check if we can connect to the database
      checkConnection()
        .then((isConnected) => {
          if (isConnected) {
            console.log("Database connection verified, loading data...")
            loadUserData()
            fetchProfile()
          } else {
            console.error("Database connection failed")
            setLoading(false)
            // Try to load from local storage as fallback
            if (gameStateSync.forceSync) {
              gameStateSync.forceSync()
            }
            alert("Database connection failed. Loading local data if available.")
          }
        })
        .catch((error) => {
          console.error("Connection check failed:", error)
          setLoading(false)
          // Try to load from local storage as fallback
          if (gameStateSync.forceSync) {
            gameStateSync.forceSync()
          }
          alert("Unable to verify database connection. Loading local data if available.")
        })

      // Safety timeout - force loading to false after 15 seconds
      const timeoutId = setTimeout(() => {
        console.warn("Loading timeout reached, forcing loading to false")
        setLoading(false)
      }, 15000)

      return () => clearTimeout(timeoutId)
    } else if (!authLoading && !user) {
      setPlayers([])
      setGameSessions([])
      setLoading(false)
    }
  }, [user, authLoading])

  // Add this useEffect after the existing useEffect
  useEffect(() => {
    // Listen for auth state changes and reset app state when user signs out
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        // Clear all app state when user signs out
        setPlayers([])
        setGameSessions([])
        setProfile(null)
        setCurrentView("dashboard")
        setActiveGameId(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).single()

      if (error) {
        console.error("Error fetching profile:", error)
        // Don't throw here, just log and continue
        return
      }

      setProfile(data)
    } catch (error) {
      console.error("Error fetching profile:", error)
      // Continue without profile data rather than blocking the app
    }
  }

  const sendGameInvitations = async (gameSessionId: string, invitedUserIds: string[]) => {
    if (!invitedUserIds.length) return

    try {
      console.log("📨 Sending game invitations:", { gameSessionId, invitedUserIds })

      // Send invitations to all selected friends
      const invitations = invitedUserIds.map((friendId) => ({
        game_session_id: gameSessionId,
        inviter_id: user!.id,
        invitee_id: friendId,
        status: "pending" as const,
      }))

      const { error } = await supabase.from("game_invitations").insert(invitations)

      if (error) {
        console.error("Error sending invitations:", error)
      } else {
        console.log(`✅ Sent ${invitations.length} game invitations`)
      }
    } catch (error) {
      console.error("Error sending game invitations:", error)
    }
  }

  const saveGameSessionToDatabase = async (session: GameSession) => {
    try {
      console.log("💾 Saving game session to database:", session.id)

      // Prepare the insert data
      const insertData: any = {
        id: session.id,
        user_id: user!.id,
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

      // Only add invited_users if the session has them and they exist
      if (session.invitedUsers && session.invitedUsers.length > 0) {
        insertData.invited_users = session.invitedUsers
      }

      const { error } = await supabase.from("game_sessions").insert(insertData)

      if (error) throw error

      console.log("✅ Game session saved successfully")
    } catch (error) {
      console.error("Error saving game session:", error)
      throw error
    }
  }

  const updateGameSessionInDatabase = async (session: GameSession) => {
    try {
      console.log("🔄 Updating session in database:", session.id, session.status)

      // Only allow updates if user is the owner
      if (session.isOwner === false) {
        console.error("User is not the owner of this game, cannot update")
        throw new Error("You don't have permission to update this game")
      }

      // Prepare the update data
      const updateData: any = {
        name: session.name,
        end_time: session.endTime,
        status: session.status,
        point_to_cash_rate: session.pointToCashRate,
        players_data: session.playersInGame,
        game_metadata: {
          standardBuyInAmount: session.standardBuyInAmount,
        },
        updated_at: new Date().toISOString(),
      }

      // Only add invited_users if the session has them
      if (session.invitedUsers) {
        updateData.invited_users = session.invitedUsers
      }

      const { error } = await supabase
        .from("game_sessions")
        .update(updateData)
        .eq("id", session.id)
        .eq("user_id", user!.id)

      if (error) {
        console.error("Database update error:", error)
        throw error
      }

      console.log("✅ Session updated successfully in database")
    } catch (error) {
      console.error("Error updating session:", error)
      throw error
    }
  }

  const updateUserStatsAfterGameCompletion = async (session: GameSession) => {
    if (!user) return

    try {
      console.log("📊 Starting user stats update for completed game:", session.id)

      // Get all users who should have their stats updated (host + invited users who accepted)
      const allParticipantIds = [user.id, ...(session.invitedUsers || [])]
      console.log("Participant IDs to update:", allParticipantIds)

      // Get profiles for all participants with proper UUID handling
      const { data: participantProfiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", allParticipantIds)

      if (profilesError) {
        console.error("Error fetching participant profiles:", profilesError)
        return
      }

      console.log("Found participant profiles:", participantProfiles)

      // Update stats for each participant who played in the game
      for (const participantProfile of participantProfiles) {
        try {
          // Find the player in the game using case-insensitive name matching
          const userPlayer = session.playersInGame.find((player) => {
            const playerName = player.name.toLowerCase().trim()
            const profileName = (participantProfile.full_name || "").toLowerCase().trim()
            return playerName === profileName
          })

          if (userPlayer) {
            // Calculate user's profit/loss for this game
            const totalBuyIn = userPlayer.buyIns.reduce((sum, buyIn) => sum + buyIn.amount, 0)
            const profitLoss = userPlayer.cashOutAmount - totalBuyIn

            console.log(`📈 Updating stats for ${participantProfile.full_name}:`, {
              userId: participantProfile.id,
              totalBuyIn,
              cashOut: userPlayer.cashOutAmount,
              profitLoss,
            })

            // Call the database function with proper UUID parameter - using the EXACT function signature
            const { data, error } = await supabase.rpc("update_user_game_stats", {
              user_id_param: participantProfile.id,
              profit_loss_amount: profitLoss,
            })

            if (error) {
              console.error(`❌ Error updating stats for user ${participantProfile.id}:`, error)
              console.error("Full error details:", {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code,
              })
              // Continue with other users even if one fails
            } else {
              console.log(`✅ Successfully updated stats for ${participantProfile.full_name}:`, data)
            }
          } else {
            console.log(`⚠️ No matching player found for profile ${participantProfile.full_name} in game data`)
          }
        } catch (error) {
          console.error(`❌ Error processing stats for user ${participantProfile.id}:`, error)
          // Continue with other users
        }
      }

      // Force refresh the current user's profile data to show updated stats immediately
      console.log("🔄 Refreshing profile data after stats update...")
      await refreshProfile()

      console.log("✅ User stats update completed successfully")
    } catch (error) {
      console.error("❌ Error updating user stats:", error)
      // Don't throw the error - stats update failure shouldn't prevent game completion
    }
  }

  const createPlayerWithBuyIn = (name: string, standardBuyInAmount: number, pointToCashRate: number): PlayerInGame => {
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
  }

  const handleAddNewPlayerGlobally = async (name: string): Promise<Player | null> => {
    if (!name.trim()) {
      alert("Player name cannot be empty.")
      return null
    }
    return { id: generateId(), name: name.trim() }
  }

  const handleStartNewGame = async (session: GameSession) => {
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

      // Send invitations to selected friends (only if invitations system is available)
      if (session.invitedUsers && session.invitedUsers.length > 0) {
        try {
          await sendGameInvitations(newSessionWithDefaults.id, session.invitedUsers)
        } catch (error) {
          console.error("Error sending invitations (feature may not be available yet):", error)
          // Don't fail the game creation if invitations fail
        }
      }

      setGameSessions((prevSessions) => [...prevSessions, newSessionWithDefaults])
      setActiveGameId(newSessionWithDefaults.id)
      setCurrentView("activeGame")
    } catch (error) {
      alert("Failed to create game. Please try again.")
    }
  }

  const handleSelectGame = (gameId: string) => {
    setActiveGameId(gameId)
    setCurrentView("activeGame")
  }

  const handleUpdateSession = async (updatedSession: GameSession) => {
    try {
      // Only allow updates if user is the owner
      if (updatedSession.isOwner === false) {
        console.error("User is not the owner of this game, cannot update")
        alert("You don't have permission to modify this game.")
        return
      }

      // Update database first
      await updateGameSessionInDatabase(updatedSession)

      // Then update local state
      setGameSessions((prevSessions) => prevSessions.map((s) => (s.id === updatedSession.id ? updatedSession : s)))

      console.log("✅ Session updated successfully")
    } catch (error) {
      console.error("Error updating session:", error)

      // Don't update local state if database update fails for non-owners
      if (updatedSession.isOwner === false) {
        alert("Failed to update game. You may not have permission to modify this game.")
        return
      }

      // Still update local state for owners even if database update fails
      setGameSessions((prevSessions) => prevSessions.map((s) => (s.id === updatedSession.id ? updatedSession : s)))

      // Show user a warning but don't block the action
      console.warn("Session updated locally but may not be saved to database")
    }
  }

  const handleEndGame = async (finalizedSession: GameSession) => {
    const completedSession = {
      ...finalizedSession,
      status: "completed" as const,
      endTime: finalizedSession.endTime || new Date().toISOString(),
      currentPhysicalPointsOnTable: 0,
    }

    try {
      console.log("🎯 Ending game and updating database...")

      // First update the game session in database
      await updateGameSessionInDatabase(completedSession)
      console.log("✅ Game session updated in database")

      // Then update stats for all participants (host + invited users)
      console.log("📊 Starting stats update for all participants...")
      await updateUserStatsAfterGameCompletion(completedSession)
      console.log("✅ Stats update completed")

      // Update local state
      setGameSessions((prevSessions) => {
        return prevSessions.map((s) => (s.id === completedSession.id ? completedSession : s))
      })

      console.log("🎉 Game completion process finished successfully")
    } catch (error) {
      console.error("❌ Error ending game:", error)

      // Still update local state even if database operations fail
      setGameSessions((prevSessions) => {
        return prevSessions.map((s) => (s.id === completedSession.id ? completedSession : s))
      })

      // Show user a warning
      alert("Game ended locally but there may have been issues saving to the database. Please check your connection.")
    }
  }

  const handleDeleteGame = async (sessionId: string) => {
    try {
      const gameToDelete = gameSessions.find((s) => s.id === sessionId)

      if (!gameToDelete) {
        alert("Game not found.")
        return
      }

      // If user is the owner, delete from database
      if (gameToDelete.isOwner !== false) {
        // Delete from database first
        const { error } = await supabase.from("game_sessions").delete().eq("id", sessionId).eq("user_id", user!.id)

        if (error) {
          console.error("Database delete error:", error)
          throw error
        }
        console.log("✅ Game deleted successfully from database")
      } else {
        // If user was invited, just remove from local state (don't delete from database)
        // Optionally, we could also remove the invitation record
        try {
          await supabase.from("game_invitations").delete().eq("game_session_id", sessionId).eq("invitee_id", user!.id)

          console.log("✅ Invitation record removed")
        } catch (error) {
          console.warn("Could not remove invitation record (non-critical):", error)
        }
      }

      // Update local state (remove from UI)
      setGameSessions((prevSessions) => prevSessions.filter((s) => s.id !== sessionId))

      // If this was the active game, navigate back to dashboard
      if (activeGameId === sessionId) {
        setActiveGameId(null)
        setCurrentView("dashboard")
      }

      console.log(gameToDelete.isOwner !== false ? "Game deleted successfully" : "Game removed from dashboard")
    } catch (error) {
      console.error("Error deleting/removing game:", error)
      alert("Failed to delete/remove game. Please try again.")
    }
  }

  const handleNavigateToDashboard = () => {
    setCurrentView("dashboard")
    setActiveGameId(null)
  }

  const getBackgroundClass = () => {
    if (currentView === "dashboard") {
      return "dashboard-background"
    }
    return "default-background"
  }

  const renderView = () => {
    // Show loading screen while checking auth
    if (authLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface-main">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary mx-auto mb-4"></div>
            <p className="text-text-secondary">Loading...</p>
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
          </div>
        </div>
      )
    }

    // Show friends feature test results if enabled
    if (showFriendsTest) {
      return <FriendsFeatureTestResults />
    }

    // Show invitation diagnostics if enabled
    if (showInvitationDiagnostics) {
      return <InvitationDiagnostics />
    }

    // Show system analysis if enabled
    if (showSystemAnalysis) {
      return <GameInviteSystemAnalysis />
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
          Poker Homegame Manager V56 &copy; {new Date().getFullYear()}
          {process.env.NODE_ENV === "development" && (
            <div className="mt-2 space-x-4">
              <button
                onClick={() => setShowFriendsTest(!showFriendsTest)}
                className="text-blue-400 hover:text-blue-300 text-xs underline"
              >
                {showFriendsTest ? "Hide" : "Show"} Friends Feature Tests
              </button>
              <button
                onClick={() => setShowInvitationDiagnostics(!showInvitationDiagnostics)}
                className="text-purple-400 hover:text-purple-300 text-xs underline"
              >
                {showInvitationDiagnostics ? "Hide" : "Show"} Invitation Diagnostics
              </button>
              <button
                onClick={() => setShowSystemAnalysis(!showSystemAnalysis)}
                className="text-green-400 hover:text-green-300 text-xs underline"
              >
                {showSystemAnalysis ? "Hide" : "Show"} System Analysis
              </button>
            </div>
          )}
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
