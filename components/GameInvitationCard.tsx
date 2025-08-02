"use client"

import { useState } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"
import Button from "./common/Button"
import Card from "./common/Card"

interface GameInvitationCardProps {
  invitation: {
    id: string
    game_session_id: string
    inviter_id: string
    invitee_id: string
    status: "pending" | "accepted" | "declined"
    created_at: string
    game_session?: {
      id: string
      name: string
      start_time: string
      status: string
      user_id: string
    }
    inviter_profile?: {
      full_name: string | null
      email: string
    }
  }
  onInvitationUpdate?: () => void
}

export default function GameInvitationCard({ invitation, onInvitationUpdate }: GameInvitationCardProps) {
  const { user } = useAuth()
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAcceptInvitation = async () => {
    if (!user || isProcessing) return

    setIsProcessing(true)
    setError(null)

    try {
      console.log("🎯 Accepting game invitation:", invitation.id)

      // Use the new accept_game_invitation_v2 function
      const { data, error } = await supabase.rpc("accept_game_invitation_v2", {
        invitation_id: invitation.id,
      })

      if (error) {
        console.error("Error accepting invitation:", error)
        setError(`Failed to accept invitation: ${error.message}`)
        return
      }

      console.log("✅ Invitation accepted successfully:", data)

      // Trigger refresh of the parent component
      if (onInvitationUpdate) {
        onInvitationUpdate()
      }

      // Also trigger a page refresh to ensure all data is updated
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (error: any) {
      console.error("Error accepting invitation:", error)
      setError(error.message || "Failed to accept invitation")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDeclineInvitation = async () => {
    if (!user || isProcessing) return

    setIsProcessing(true)
    setError(null)

    try {
      console.log("❌ Declining game invitation:", invitation.id)

      const { error } = await supabase
        .from("game_invitations")
        .update({
          status: "declined",
          updated_at: new Date().toISOString(),
        })
        .eq("id", invitation.id)
        .eq("invitee_id", user.id)

      if (error) {
        console.error("Error declining invitation:", error)
        setError(`Failed to decline invitation: ${error.message}`)
        return
      }

      console.log("✅ Invitation declined successfully")

      // Trigger refresh of the parent component
      if (onInvitationUpdate) {
        onInvitationUpdate()
      }
    } catch (error: any) {
      console.error("Error declining invitation:", error)
      setError(error.message || "Failed to decline invitation")
    } finally {
      setIsProcessing(false)
    }
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return "Invalid date"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "text-yellow-700 bg-yellow-100 border-yellow-200"
      case "accepted":
        return "text-green-700 bg-green-100 border-green-200"
      case "declined":
        return "text-red-700 bg-red-100 border-red-200"
      default:
        return "text-gray-700 bg-gray-100 border-gray-200"
    }
  }

  const getGameStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "text-green-700 bg-green-100 border-green-200"
      case "pending":
        return "text-blue-700 bg-blue-100 border-blue-200"
      case "completed":
        return "text-gray-700 bg-gray-100 border-gray-200"
      case "pending_close":
        return "text-orange-700 bg-orange-100 border-orange-200"
      default:
        return "text-gray-700 bg-gray-100 border-gray-200"
    }
  }

  // Safe access to inviter information
  const inviterName = invitation.inviter_profile?.full_name || invitation.inviter_profile?.email || "Unknown User"
  const gameName = invitation.game_session?.name || "Poker Game"
  const gameStatus = invitation.game_session?.status || "unknown"
  const gameStartTime = invitation.game_session?.start_time

  return (
    <Card className="p-4 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg text-gray-900 truncate">{gameName}</h3>
            <p className="text-sm text-gray-600">Invited by {inviterName}</p>
          </div>
          <div className="flex flex-col items-end space-y-1 ml-4">
            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(invitation.status)}`}>
              {invitation.status.charAt(0).toUpperCase() + invitation.status.slice(1)}
            </span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getGameStatusColor(gameStatus)}`}>
              Game: {gameStatus.replace("_", " ")}
            </span>
          </div>
        </div>

        {/* Game Details */}
        <div className="bg-gray-50 p-3 rounded-md">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {gameStartTime && (
              <div>
                <span className="font-medium text-gray-700">Game Started:</span>
                <p className="text-gray-600">{formatDate(gameStartTime)}</p>
              </div>
            )}
            <div>
              <span className="font-medium text-gray-700">Invited:</span>
              <p className="text-gray-600">{formatDate(invitation.created_at)}</p>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-red-700 text-sm">❌ {error}</p>
          </div>
        )}

        {/* Action Buttons */}
        {invitation.status === "pending" && (
          <div className="flex space-x-2">
            <Button
              onClick={handleAcceptInvitation}
              disabled={isProcessing}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? "Accepting..." : "✅ Accept"}
            </Button>
            <Button
              onClick={handleDeclineInvitation}
              disabled={isProcessing}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? "Declining..." : "❌ Decline"}
            </Button>
          </div>
        )}

        {/* Status Messages */}
        {invitation.status === "accepted" && (
          <div className="bg-green-50 border border-green-200 rounded-md p-3">
            <p className="text-green-800 text-sm font-medium">
              ✅ You've accepted this invitation! The game should appear in your dashboard.
            </p>
            {gameStatus === "active" && (
              <p className="text-green-700 text-xs mt-1">
                The game is currently active. Check your dashboard to join the action.
              </p>
            )}
          </div>
        )}

        {invitation.status === "declined" && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-red-800 text-sm font-medium">❌ You've declined this invitation.</p>
          </div>
        )}
      </div>
    </Card>
  )
}
