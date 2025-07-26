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
import Navbar from "../components/Navbar"
import PlayerManagement from "../components/PlayerManagement"
import GameDashboard from "../components/GameDashboard"
import ActiveGameScreen from "../components/ActiveGameScreen"
import FriendsPage from "../components/FriendsPage"
import PWAInstall from "../components/PWAInstall"
import AuthModal from "../components/auth/AuthModal"
import EmailVerificationScreen from "../components/auth/EmailVerificationScreen"

export default function Home() {
  const { user, loading: authLoading, emailVerified } = useAuth()
  const [players, setPlayers] = useState<Player[]>([])
  const [gameSessions, setGameSessions] = useState<GameSession[]>([])
  const [currentView, setCurrentView] = useState<View>("dashboard")
  const [activeGameId, setActiveGameId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [profile, setProfile] = useState<any | null>(null)

  usePWA()

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

      // Transform database data to match our types with minimal processing
      const transformedSessions: GameSession[] = combinedSessions.map((session) => ({
        id: session.id,
        name: session.name,
        startTime: session.start_time,
        endTime: session.end_time,
        status: session.status,
        pointToCashRate: session.point_to_cash_rate,
        standardBuyInAmount: 25, // Default value
        currentPhysicalPointsOnTable: 0, // Will be calculated from players_data
        playersInGame: session.players_data || [], // Load from JSONB column
        invitedUsers: session.invited_users || [], // Use empty array if column doesn't exist
        isOwner: session.isOwner, // Track if user owns this game
      }))

      // Calculate current physical points for active games
      const updatedSessions = transformedSessions.map((session) => {
        if (session.status === "active" || session.status === "pending_close") {
          const totalPoints = session.playersInGame.reduce((sum, player) => {
            return sum + (player.status === "active" ? player.pointStack : 0)
          }, 0)
          return { ...session, currentPhysicalPointsOnTable: totalPoints }
        }
        return session
      })

      setGameSessions(updatedSessions)
    } catch (error) {
      console.error("Error loading user data:", error)
      // Fallback: Load with empty data but still functional
      setGameSessions([])
      alert("Unable to load your games. Please try refreshing the page.")
    } finally {
      setLoading(false)
    }
  }

  // Simple useEffect without problematic refresh logic
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
            alert("Database connection failed. Please check your internet connection and try refreshing the page.")
          }
        })
        .catch((error) => {
          console.error("Connection check failed:", error)
          setLoading(false)
          alert("Unable to verify database connection. Please try refreshing the page.")
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
        console.log(`Sent ${invitations.length} game invitations`)
      }
    } catch (error) {
      console.error("Error sending game invitations:", error)
    }
  }

  const saveGameSessionToDatabase = async (session: GameSession) => {
    try {
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
    } catch (error) {
      console.error("Error saving game session:", error)
      throw error
    }
  }

  const updateGameSessionInDatabase = async (session: GameSession) => {
    try {
      console.log("Updating session in database:", session.id, session.status)

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

      console.log("Session updated successfully in database")
    } catch (error) {
      console.error("Error updating session:", error)
      throw error
    }
  }

  const updateUserStatsAfterGameCompletion = async (session: GameSession) => {
    if (!user) return

    try {
      // Get all users who should have their stats updated (host + invited users who accepted)
      const allParticipantIds = [user.id, ...(session.invitedUsers || [])]

      // Get profiles for all participants
      const { data: participantProfiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", allParticipantIds)

      if (profilesError) {
        console.error("Error fetching participant profiles:", profilesError)
        return
      }

      // Update stats for each participant who played in the game
      for (const participantProfile of participantProfiles) {
        const userPlayer = session.playersInGame.find(
          (player) => player.name.toLowerCase() === participantProfile.full_name?.toLowerCase(),
        )

        if (userPlayer) {
          // Calculate user's profit/loss for this game
          const totalBuyIn = userPlayer.buyIns.reduce((sum, buyIn) => sum + buyIn.amount, 0)
          const profitLoss = userPlayer.cashOutAmount - totalBuyIn

          // Update user stats in database
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
      // Update database first
      await updateGameSessionInDatabase(updatedSession)

      // Then update local state
      setGameSessions((prevSessions) => prevSessions.map((s) => (s.id === updatedSession.id ? updatedSession : s)))

      console.log("Session updated successfully")
    } catch (error) {
      console.error("Error updating session:", error)

      // Still update local state even if database update fails
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
      await updateGameSessionInDatabase(completedSession)

      // Update stats for all participants (host + invited users)
      await updateUserStatsAfterGameCompletion(completedSession)

      setGameSessions((prevSessions) => {
        return prevSessions.map((s) => (s.id === completedSession.id ? completedSession : s))
      })
    } catch (error) {
      console.error("Error ending game:", error)
      setGameSessions((prevSessions) => {
        return prevSessions.map((s) => (s.id === completedSession.id ? completedSession : s))
      })
    }
  }

  const handleDeleteGame = async (sessionId: string) => {
    try {
      // Delete from database first
      const { error } = await supabase.from("game_sessions").delete().eq("id", sessionId).eq("user_id", user!.id)

      if (error) {
        console.error("Database delete error:", error)
        throw error
      }

      // Update local state
      setGameSessions((prevSessions) => prevSessions.filter((s) => s.id !== sessionId))

      // If this was the active game, navigate back to dashboard
      if (activeGameId === sessionId) {
        setActiveGameId(null)
        setCurrentView("dashboard")
      }

      console.log("Game deleted successfully")
    } catch (error) {
      console.error("Error deleting game:", error)
      alert("Failed to delete game. Please try again.")
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
          Poker Homegame Manager V49 &copy; {new Date().getFullYear()}
        </footer>
      )}

      {/* Only show PWA install if user is verified */}
      {user && emailVerified && <PWAInstall />}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} initialMode="signin" />
    </div>
  )
}
