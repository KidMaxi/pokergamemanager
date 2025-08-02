"use client"

import { useState } from "react"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"
import Button from "./common/Button"
import Card from "./common/Card"
import { formatCurrency, formatDate } from "../utils"

interface GameInvitationCardProps {
  invitation: {
    id: string
    game_session_id: string
    inviter_id: string
    invitee_id: string
    status: "pending" | "accepted" | "declined"
    created_at: string
    updated_at: string
    game_session?: {
      id: string
      name: string
      start_time: string
      end_time: string | null
      status: "active" | "completed" | "pending_close"
      point_to_cash_rate: number
      players_data: any[]
      user_id: string
    }
    inviter?: {
      id: string
      full_name: string | null
      email: string
    }
  }
  onAccept?: () => void
  onDecline?: () => void
  onRefresh?: () => void
}

export default function GameInvitationCard({ invitation, onAccept, onDecline, onRefresh }: GameInvitationCardProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // Safe access to nested properties with fallbacks
  const gameSession = invitation.game_session
  const inviter = invitation.inviter
  const inviterName = inviter?.full_name || inviter?.email || "Unknown User"
  const gameName = gameSession?.name || "Unknown Game"
  const gameStatus = gameSession?.status || "unknown"
  const pointRate = gameSession?.point_to_cash_rate || 0
  const playersCount = gameSession?.players_data?.length || 0

  const handleAcceptInvitation = async () => {
    if (!user || !gameSession) {
      setError("Unable to accept invitation - missing user or game data")
      return
    }

    setLoading(true)
    setError("")
    setSuccess("")

    try {
      console.log("🎮 Accepting game invitation:", invitation.id)

      // Use the new accept_game_invitation_v2 function
      const { data, error: acceptError } = await supabase.rpc("accept_game_invitation_v2", {
        p_invitation_id: invitation.id,
      })

      if (acceptError) {
        console.error("❌ Error accepting invitation:", acceptError)
        throw new Error(acceptError.message)
      }

      console.log("✅ Invitation accepted successfully:", data)

      // Update invitation status locally
      setSuccess("Invitation accepted! You can now view the game.")

      // Call callbacks to refresh UI
      if (onAccept) {
        onAccept()
      }
      if (onRefresh) {
        onRefresh()
      }
    } catch (error: any) {
      console.error("❌ Error accepting invitation:", error)
      setError(`Failed to accept invitation: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDeclineInvitation = async () => {
    if (!user) {
      setError("Unable to decline invitation - user not found")
      return
    }

    setLoading(true)
    setError("")
    setSuccess("")

    try {
      console.log("❌ Declining game invitation:", invitation.id)

      const { error: declineError } = await supabase
        .from("game_invitations")
        .update({ status: "declined", updated_at: new Date().toISOString() })
        .eq("id", invitation.id)
        .eq("invitee_id", user.id)

      if (declineError) {
        console.error("❌ Error declining invitation:", declineError)
        throw new Error(declineError.message)
      }

      console.log("✅ Invitation declined successfully")
      setSuccess("Invitation declined.")

      // Call callbacks to refresh UI
      if (onDecline) {
        onDecline()
      }
      if (onRefresh) {
        onRefresh()
      }
    } catch (error: any) {
      console.error("❌ Error declining invitation:", error)
      setError(`Failed to decline invitation: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "text-green-400"
      case "completed":
        return "text-red-400"
      case "pending_close":
        return "text-yellow-400"
      default:
        return "text-gray-400"
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "active":
        return "Active"
      case "completed":
        return "Completed"
      case "pending_close":
        return "Closing"
      default:
        return "Unknown"
    }
  }

  if (error && !loading) {
    return (
      <Card className="mb-4 border-red-500 bg-red-900/20">
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <span className="text-red-400">❌</span>
            <h3 className="text-lg font-semibold text-red-400">Error Loading Invitation</h3>
          </div>
          <p className="text-red-300 text-sm">{error}</p>
          {onRefresh && (
            <Button onClick={onRefresh} variant="secondary" size="sm">
              Try Again
            </Button>
          )}
        </div>
      </Card>
    )
  }

  return (
    <Card className="mb-4 border-blue-500 bg-blue-900/20">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center space-x-2">
          <span className="text-2xl">🎮</span>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-blue-200">Game Invitation</h3>
            <p className="text-sm text-blue-300">
              From <span className="font-medium">{inviterName}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-blue-400">{formatDate(invitation.created_at)}</p>
          </div>
        </div>

        {/* Game Details */}
        <div className="bg-blue-800/30 rounded-lg p-3 border border-blue-600/50">
          <h4 className="font-semibold text-white mb-2">{gameName}</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-blue-300">Status:</span>
              <span className={`ml-2 font-medium ${getStatusColor(gameStatus)}`}>{getStatusText(gameStatus)}</span>
            </div>
            <div>
              <span className="text-blue-300">Players:</span>
              <span className="ml-2 text-white">{playersCount}</span>
            </div>
            <div>
              <span className="text-blue-300">Point Rate:</span>
              <span className="ml-2 text-white">{formatCurrency(pointRate)}/pt</span>
            </div>
            <div>
              <span className="text-blue-300">Started:</span>
              <span className="ml-2 text-white">
                {gameSession?.start_time ? formatDate(gameSession.start_time) : "Unknown"}
              </span>
            </div>
          </div>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="bg-red-900/30 border border-red-600/50 rounded p-2">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-900/30 border border-green-600/50 rounded p-2">
            <p className="text-green-300 text-sm">{success}</p>
          </div>
        )}

        {/* Action Buttons */}
        {invitation.status === "pending" && !success && (
          <div className="flex space-x-3">
            <Button
              onClick={handleAcceptInvitation}
              disabled={loading || gameStatus === "completed"}
              variant="primary"
              className="flex-1"
            >
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Accepting...</span>
                </div>
              ) : (
                "Accept Invitation"
              )}
            </Button>
            <Button
              onClick={handleDeclineInvitation}
              disabled={loading}
              variant="ghost"
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              {loading ? "Processing..." : "Decline"}
            </Button>
          </div>
        )}

        {invitation.status === "accepted" && (
          <div className="bg-green-900/30 border border-green-600/50 rounded p-2">
            <p className="text-green-300 text-sm font-medium">✅ Invitation Accepted</p>
            <p className="text-green-400 text-xs">You can now view this game in your dashboard.</p>
          </div>
        )}

        {invitation.status === "declined" && (
          <div className="bg-gray-900/30 border border-gray-600/50 rounded p-2">
            <p className="text-gray-300 text-sm font-medium">❌ Invitation Declined</p>
          </div>
        )}

        {gameStatus === "completed" && invitation.status === "pending" && (
          <div className="bg-yellow-900/30 border border-yellow-600/50 rounded p-2">
            <p className="text-yellow-300 text-sm font-medium">⚠️ Game Already Completed</p>
            <p className="text-yellow-400 text-xs">This game has already ended.</p>
          </div>
        )}
      </div>
    </Card>
  )
}
