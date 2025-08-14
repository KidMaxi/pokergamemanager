"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "../../../contexts/AuthContext"
import { supabase } from "../../../lib/supabase"
import type { Player, GameSession } from "../../../types"
import { generateId } from "../../../utils"
import ActiveGameScreen from "../../../components/ActiveGameScreen"
import AuthModal from "../../../components/auth/AuthModal"
import EmailVerificationScreen from "../../../components/auth/EmailVerificationScreen"

export default function GamePage() {
  const params = useParams()
  const router = useRouter()
  const gameId = params.id as string
  const { user, loading: authLoading, emailVerified } = useAuth()
  const [gameSession, setGameSession] = useState<GameSession | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [profile, setProfile] = useState<any | null>(null)

  const loadGameSession = async () => {
    try {
      setLoading(true)
      console.log("🔄 Loading game session:", gameId)

      // Load the specific game session
      const { data: sessionData, error: sessionError } = await supabase
        .from("game_sessions")
        .select("id, name, start_time, end_time, status, point_to_cash_rate, players_data, invited_users, user_id")
        .eq("id", gameId)
        .single()

      if (sessionError) {
        console.error("Session query error:", sessionError)
        throw new Error(`Game not found: ${sessionError.message}`)
      }

      // Check if user has access to this game (owner or invited)
      let hasAccess = sessionData.user_id === user!.id

      if (!hasAccess) {
        // Check if user was invited
        const { data: invitation } = await supabase
          .from("game_invitations")
          .select("status")
          .eq("game_session_id", gameId)
          .eq("invitee_id", user!.id)
          .single()

        hasAccess = invitation?.status === "accepted"
      }

      if (!hasAccess) {
        alert("You don't have access to this game.")
        router.push("/")
        return
      }

      // Transform to GameSession type
      const transformedSession: GameSession = {
        id: sessionData.id,
        name: sessionData.name,
        startTime: sessionData.start_time,
        endTime: sessionData.end_time,
        status: sessionData.status,
        pointToCashRate: sessionData.point_to_cash_rate,
        standardBuyInAmount: 25,
        currentPhysicalPointsOnTable: 0,
        playersInGame: sessionData.players_data || [],
        invitedUsers: sessionData.invited_users || [],
        isOwner: sessionData.user_id === user!.id,
      }

      // Calculate physical points for active games
      if (transformedSession.status === "active" || transformedSession.status === "pending_close") {
        let calculatedPoints = 0
        for (const player of transformedSession.playersInGame) {
          if (player.status === "active") {
            calculatedPoints += player.pointStack || 0
          } else if (player.status === "cashed_out_early") {
            calculatedPoints += player.pointsLeftOnTable || 0
          }
        }
        transformedSession.currentPhysicalPointsOnTable = calculatedPoints
      }

      setGameSession(transformedSession)
    } catch (error) {
      console.error("Error loading game session:", error)
      alert("Failed to load game. Redirecting to dashboard.")
      router.push("/")
    } finally {
      setLoading(false)
    }
  }

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

  useEffect(() => {
    if (user && !authLoading && gameId) {
      loadGameSession()
      fetchProfile()
    } else if (!authLoading && !user) {
      setLoading(false)
    }
  }, [user, authLoading, gameId])

  const handleUpdateSession = async (updatedSession: GameSession) => {
    try {
      if (updatedSession.isOwner === false) {
        console.error("User is not the owner of this game, cannot update")
        alert("You don't have permission to modify this game.")
        return
      }

      const updateData: any = {
        name: updatedSession.name,
        end_time: updatedSession.endTime,
        status: updatedSession.status,
        point_to_cash_rate: updatedSession.pointToCashRate,
        players_data: updatedSession.playersInGame,
        game_metadata: {
          standardBuyInAmount: updatedSession.standardBuyInAmount,
        },
        updated_at: new Date().toISOString(),
      }

      if (updatedSession.invitedUsers) {
        updateData.invited_users = updatedSession.invitedUsers
      }

      const { error } = await supabase
        .from("game_sessions")
        .update(updateData)
        .eq("id", updatedSession.id)
        .eq("user_id", user!.id)

      if (error) {
        console.error("Database update error:", error)
        throw error
      }

      setGameSession(updatedSession)
      console.log("✅ Session updated successfully")
    } catch (error) {
      console.error("Error updating session:", error)
      if (updatedSession.isOwner === false) {
        alert("Failed to update game. You may not have permission to modify this game.")
        return
      }
      setGameSession(updatedSession)
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
      await handleUpdateSession(completedSession)
      // Redirect to dashboard after game ends
      router.push("/")
    } catch (error) {
      console.error("Error ending game:", error)
      setGameSession(completedSession)
    }
  }

  const handleNavigateToDashboard = () => {
    router.push("/")
  }

  const handleAddNewPlayerGlobally = async (name: string): Promise<Player | null> => {
    if (!name.trim()) {
      alert("Player name cannot be empty.")
      return null
    }
    return { id: generateId(), name: name.trim() }
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
            Please sign in to view this game
          </h1>
          <button
            onClick={() => setShowAuthModal(true)}
            className="w-full bg-brand-primary text-white py-3 px-6 rounded-lg font-medium hover:bg-brand-secondary transition-colors text-base sm:text-lg"
          >
            Sign In
          </button>
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
          <p className="text-text-secondary">Loading game...</p>
        </div>
      </div>
    )
  }

  if (!gameSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-main">
        <div className="text-center">
          <p className="text-text-secondary">Game not found</p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 bg-brand-primary text-white py-2 px-4 rounded-lg hover:bg-brand-secondary transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface-main default-background">
      <main className="flex-grow bg-transparent">
        <ActiveGameScreen
          session={gameSession}
          players={players}
          onUpdateSession={handleUpdateSession}
          onEndGame={handleEndGame}
          onNavigateToDashboard={handleNavigateToDashboard}
          onAddNewPlayerGlobally={handleAddNewPlayerGlobally}
        />
      </main>
    </div>
  )
}
