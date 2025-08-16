"use client"

import { useState, useEffect } from "react"
import { useSupabase } from "../contexts/SupabaseProvider"
import type { Player, GameSession } from "../types"
import { generateId } from "../utils"
import { usePWA } from "../hooks/usePWA"
import { useGameStateSync } from "../hooks/useGameStateSync"
import GameDashboard from "../components/GameDashboard"
import FriendsPage from "../components/FriendsPage"
import StatsPage from "../components/StatsPage"
import ActiveGameScreen from "../components/ActiveGameScreen"
import PWAInstall from "../components/PWAInstall"
import AuthModal from "../components/auth/AuthModal"
import EmailVerificationScreen from "../components/auth/EmailVerificationScreen"
import Navbar from "../components/Navbar"

export default function Home() {
  const { supabase, session, loading: authLoading } = useSupabase()
  const user = session?.user
  const emailVerified = user?.email_confirmed_at ? true : false
  const [players, setPlayers] = useState<Player[]>([])
  const [gameSessions, setGameSessions] = useState<GameSession[]>([])
  const [loading, setLoading] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [profile, setProfile] = useState<any | null>(null)

  const [activeGameId, setActiveGameId] = useState<string | null>(null)
  const [currentView, setCurrentView] = useState<string>("dashboard")

  usePWA()

  const gameStateSync = useGameStateSync({
    sessions: gameSessions,
    onSessionsUpdate: setGameSessions,
    autoSaveInterval: 30000,
    enableVisibilitySync: true,
  })

  const loadUserData = async () => {
    try {
      setLoading(true)
      console.log("🔄 Loading user data for:", user!.id)

      let sessionsData
      let sessionsError

      try {
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

      const allGamesMap = new Map()

      sessionsData.forEach((session) => {
        allGamesMap.set(session.id, { ...session, isOwner: true })
      })

      invitedGamesData.forEach((session) => {
        if (!allGamesMap.has(session.id)) {
          allGamesMap.set(session.id, { ...session, isOwner: false })
        }
      })

      const combinedSessions = Array.from(allGamesMap.values())
      console.log("📊 Total games loaded:", combinedSessions.length)

      const transformedSessions: GameSession[] = combinedSessions.map((session) => {
        const baseSession: GameSession = {
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
        }

        if (baseSession.status === "active" || baseSession.status === "pending_close") {
          let calculatedPoints = 0

          for (const player of baseSession.playersInGame) {
            if (player.status === "active") {
              calculatedPoints += player.pointStack || 0
            } else if (player.status === "cashed_out_early") {
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
      const localSessions = gameStateSync.forceSync ? [] : []
      setGameSessions(localSessions)
      alert("Unable to load your games from server. Loading local data if available.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user && !authLoading) {
      loadUserData()
      fetchProfile()
    } else if (!authLoading && !user) {
      setPlayers([])
      setGameSessions([])
      setLoading(false)
    }
  }, [user, authLoading])

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).single()

      if (error) {
        console.error("Error fetching profile:", error)
        return
      }

      setProfile(data)
    } catch (error) {
      console.error("Error fetching profile:", error)
    }
  }

  const handleStartNewGame = async (session: GameSession) => {
    const newSessionWithDefaults = {
      ...session,
      currentPhysicalPointsOnTable: 0,
      playersInGame: [],
    }

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
          console.error("Error sending invitations (feature may not be available yet):", error)
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

  const handleViewChange = (view: string) => {
    setCurrentView(view)
    if (view !== "activeGame") {
      setActiveGameId(null)
    }
  }

  const handleEndGame = (updatedSession: GameSession) => {
    setGameSessions((prevSessions) =>
      prevSessions.map((session) => (session.id === updatedSession.id ? updatedSession : session)),
    )
    setCurrentView("dashboard")
    setActiveGameId(null)
  }

  const handleDeleteGame = (gameId: string) => {
    setGameSessions((prevSessions) => prevSessions.filter((session) => session.id !== gameId))
  }

  const handleAddNewPlayerGlobally = async (playerName: string): Promise<Player | null> => {
    try {
      // Check if player already exists in the global players list
      const existingPlayer = players.find((p) => p.name.toLowerCase() === playerName.toLowerCase())

      if (existingPlayer) {
        return null // Player already exists
      }

      // Create new temporary player
      const newPlayer: Player = {
        id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: playerName,
        isTemporary: true,
      }

      // Add to global players list
      setPlayers((prevPlayers) => [...prevPlayers, newPlayer])

      return newPlayer
    } catch (error) {
      console.error("Error adding new player globally:", error)
      return null
    }
  }

  const createPlayerWithBuyIn = (name: string, standardBuyInAmount: number, pointToCashRate: number): any => {
    const initialBuyIn = {
      logId: generateId(),
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

  const saveGameSessionToDatabase = async (session: any) => {
    try {
      console.log("💾 Saving game session to database:", session.id)

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

  const sendGameInvitations = async (gameSessionId: string, invitedUserIds: string[]) => {
    if (!invitedUserIds.length) return

    try {
      console.log("📨 Sending game invitations:", { gameSessionId, invitedUserIds })

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

  const updateGameSessionInDatabase = async (session: any) => {
    try {
      console.log("🔄 Updating session in database:", session.id, session.status)

      if (session.isOwner === false) {
        console.error("User is not the owner of this game, cannot update")
        throw new Error("You don't have permission to update this game")
      }

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

  const updateUserStatsAfterGameCompletion = async (session: any) => {
    if (!user) return

    try {
      console.log("📊 Starting user stats update for completed game:", session.id)

      const allParticipantIds = [user.id, ...(session.invitedUsers || [])]
      console.log("Participant IDs to update:", allParticipantIds)

      const { data: participantProfiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", allParticipantIds)

      if (profilesError) {
        console.error("Error fetching participant profiles:", profilesError)
        return
      }

      console.log("Found participant profiles:", participantProfiles)

      for (const participantProfile of participantProfiles) {
        try {
          const userPlayer = session.playersInGame.find((player) => {
            const playerName = player.name.toLowerCase().trim()
            const profileName = (participantProfile.full_name || "").toLowerCase().trim()
            return playerName === profileName
          })

          if (userPlayer) {
            const totalBuyIn = userPlayer.buyIns.reduce((sum, buyIn) => sum + buyIn.amount, 0)
            const profitLoss = userPlayer.cashOutAmount - totalBuyIn

            console.log(`Updating stats for ${participantProfile.full_name}:`, {
              userId: participantProfile.id,
              totalBuyIn,
              cashOut: userPlayer.cashOutAmount,
              profitLoss,
            })

            const { data, error } = await supabase.rpc("update_user_game_stats", {
              user_id_param: participantProfile.id,
              profit_loss_amount: profitLoss,
            })

            if (error) {
              console.error(`Error updating stats for user ${participantProfile.id}:`, error)
            } else {
              console.log(`✅ Successfully updated stats for ${participantProfile.full_name}: P/L ${profitLoss}`)
            }
          } else {
            console.log(`No matching player found for profile ${participantProfile.full_name} in game data`)
          }
        } catch (error) {
          console.error(`Error processing stats for user ${participantProfile.id}:`, error)
        }
      }

      console.log("✅ User stats update completed")
    } catch (error) {
      console.error("Error updating user stats:", error)
    }
  }

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
        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} initialMode="signin" />
      </div>
    )
  }

  if (user && !emailVerified) {
    return <EmailVerificationScreen />
  }

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

  const renderCurrentView = () => {
    switch (currentView) {
      case "friends":
        return (
          <div className="min-h-screen flex flex-col bg-surface-main default-background">
            <main className="flex-grow bg-transparent">
              <FriendsPage />
            </main>
          </div>
        )
      case "stats":
        return (
          <div className="min-h-screen flex flex-col bg-surface-main default-background">
            <main className="flex-grow bg-transparent">
              <StatsPage />
            </main>
          </div>
        )
      case "activeGame":
        const activeSession = gameSessions.find((session) => session.id === activeGameId)
        if (!activeSession) {
          setCurrentView("dashboard")
          return null
        }
        return (
          <ActiveGameScreen
            session={activeSession}
            players={players}
            onUpdateSession={(updatedSession) => {
              setGameSessions((prevSessions) =>
                prevSessions.map((session) => (session.id === updatedSession.id ? updatedSession : session)),
              )
            }}
            onEndGame={handleEndGame}
            onAddNewPlayerGlobally={handleAddNewPlayerGlobally}
            onNavigateToDashboard={() => setCurrentView("dashboard")}
            user={user}
          />
        )
      case "dashboard":
      default:
        return (
          <div className="min-h-screen flex flex-col bg-surface-main dashboard-background">
            <main className="flex-grow bg-transparent">
              <GameDashboard
                players={players}
                gameSessions={gameSessions}
                onStartNewGame={handleStartNewGame}
                onSelectGame={handleSelectGame}
                onDeleteGame={handleDeleteGame}
              />
            </main>
          </div>
        )
    }
  }

  return (
    <>
      <Navbar currentView={currentView} onViewChange={handleViewChange} />
      {renderCurrentView()}
      <PWAInstall />
    </>
  )
}
