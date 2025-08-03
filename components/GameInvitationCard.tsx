"use client"

import { useState } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"
import Button from "./common/Button"
import Card from "./common/Card"

interface GameInvitation {
  id: string
  game_session_id: string
  inviter_id: string
  invitee_id: string
  status: "pending" | "accepted" | "declined"
  created_at: string
  inviter_profile?: {
    full_name: string | null
    email: string
  }
  game_session?: {
    id: string
    name: string
    start_time: string
    status: string
    point_to_cash_rate: number
  }
}

interface GameInvitationCardProps {
  invitation: GameInvitation
  onInvitationHandled?: () => void
}

export default function GameInvitationCard({ invitation, onInvitationHandled }: GameInvitationCardProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(invitation.status)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const handleAcceptInvitation = async () => {
    if (!user) return

    setLoading(true)
    setError("")
    setMessage("")

    try {
      console.log("🎯 Accepting game invitation:", invitation.id)

      // Call the database function to accept the invitation
      const { data, error } = await supabase.rpc("accept_game_invitation", {
        invitation_id: invitation.id,
        user_id: user.id,
      })

      if (error) {
        console.error("Error accepting invitation:", error)
        throw error
      }

      console.log("✅ Invitation accepted successfully:", data)
      setStatus("accepted")
      setMessage("Invitation accepted! You can now see this game in your dashboard.")

      // Call the callback to refresh the parent component
      if (onInvitationHandled) {
        onInvitationHandled()
      }
    } catch (error: any) {
      console.error("Error accepting invitation:", error)
      setError(error.message || "Failed to accept invitation. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleDeclineInvitation = async () => {
    if (!user) return

    setLoading(true)
    setError("")
    setMessage("")

    try {
      console.log("❌ Declining game invitation:", invitation.id)

      const { error } = await supabase
        .from("game_invitations")
        .update({ status: "declined", updated_at: new Date().toISOString() })
        .eq("id", invitation.id)
        .eq("invitee_id", user.id)

      if (error) {
        console.error("Error declining invitation:", error)
        throw error
      }

      console.log("✅ Invitation declined successfully")
      setStatus("declined")
      setMessage("Invitation declined.")

      // Call the callback to refresh the parent component
      if (onInvitationHandled) {
        onInvitationHandled()
      }
    } catch (error: any) {
      console.error("Error declining invitation:", error)
      setError(error.message || "Failed to decline invitation. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case "accepted":
        return "text-green-400"
      case "declined":
        return "text-red-400"
      default:
        return "text-yellow-400"
    }
  }

  const getStatusText = () => {
    switch (status) {
      case "accepted":
        return "✅ Accepted"
      case "declined":
        return "❌ Declined"
      default:
        return "⏳ Pending"
    }
  }

  return (
    <Card className="bg-blue-800/80 backdrop-blur-sm border-2 border-blue-600 mb-4">
      <div className="bg-blue-700/60 rounded-lg p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-blue-100 mb-1">
              🎮 Game Invitation: {invitation.game_session?.name || "Poker Game"}
            </h3>
            <p className="text-blue-200 text-sm">
              From: {invitation.inviter_profile?.full_name || invitation.inviter_profile?.email || "Unknown Player"}
            </p>
            <p className="text-blue-300 text-xs mt-1">
              Point-to-Cash Rate: ${invitation.game_session?.point_to_cash_rate || "1.00"}
            </p>
          </div>
          <div className={`text-sm font-medium ${getStatusColor()}`}>{getStatusText()}</div>
        </div>

        {message && (
          <div className="bg-green-800/60 border border-green-600 rounded p-3 mb-3">
            <p className="text-green-200 text-sm">✅ {message}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-800/60 border border-red-600 rounded p-3 mb-3">
            <p className="text-red-200 text-sm">❌ {error}</p>
          </div>
        )}

        {status === "pending" && (
          <div className="flex space-x-3">
            <Button
              onClick={handleAcceptInvitation}
              disabled={loading}
              variant="primary"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              {loading ? "Accepting..." : "Accept"}
            </Button>
            <Button
              onClick={handleDeclineInvitation}
              disabled={loading}
              variant="secondary"
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              {loading ? "Declining..." : "Decline"}
            </Button>
          </div>
        )}

        {status === "accepted" && (
          <div className="text-center">
            <p className="text-green-200 text-sm">🎉 You've joined this game! Check your dashboard to see it.</p>
          </div>
        )}

        {status === "declined" && (
          <div className="text-center">
            <p className="text-red-200 text-sm">You declined this invitation.</p>
          </div>
        )}
      </div>
    </Card>
  )
}
