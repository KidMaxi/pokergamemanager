"use client"

import { useState } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"

interface GameInvitationCardProps {
  invitation: {
    id: string
    game_session_id: string
    inviter_id: string
    status: string
    created_at: string
    game_session: {
      id: string
      name: string
      start_time: string
      status: string
      point_to_cash_rate: number
    }
    inviter: {
      full_name: string
    }
  }
  onInvitationUpdate: () => void
}

export default function GameInvitationCard({ invitation, onInvitationUpdate }: GameInvitationCardProps) {
  const { user } = useAuth()
  const [isProcessing, setIsProcessing] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const handleAcceptInvitation = async () => {
    if (!user || isProcessing) return

    setIsProcessing(true)
    setMessage(null)

    try {
      console.log("🎯 Accepting game invitation:", invitation.id)

      const { data, error } = await supabase.rpc("accept_game_invitation", {
        invitation_id: invitation.id,
        user_id: user.id,
      })

      if (error) {
        console.error("❌ Error accepting invitation:", error)
        setMessage({
          type: "error",
          text: `Failed to accept invitation: ${error.message}`,
        })
        return
      }

      console.log("✅ Invitation accepted successfully")
      setMessage({
        type: "success",
        text: "Invitation accepted! You can now join the game.",
      })

      // Refresh the invitations list
      setTimeout(() => {
        onInvitationUpdate()
      }, 1500)
    } catch (error) {
      console.error("❌ Unexpected error:", error)
      setMessage({
        type: "error",
        text: "An unexpected error occurred. Please try again.",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDeclineInvitation = async () => {
    if (!user || isProcessing) return

    setIsProcessing(true)
    setMessage(null)

    try {
      const { error } = await supabase
        .from("game_invitations")
        .update({ status: "declined" })
        .eq("id", invitation.id)
        .eq("invitee_id", user.id)

      if (error) {
        console.error("Error declining invitation:", error)
        setMessage({
          type: "error",
          text: "Failed to decline invitation. Please try again.",
        })
        return
      }

      setMessage({
        type: "success",
        text: "Invitation declined.",
      })

      setTimeout(() => {
        onInvitationUpdate()
      }, 1500)
    } catch (error) {
      console.error("Unexpected error declining invitation:", error)
      setMessage({
        type: "error",
        text: "An unexpected error occurred. Please try again.",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="bg-blue-800/80 backdrop-blur-sm border border-blue-600/50 rounded-lg p-4 mb-4 shadow-lg">
      <div className="bg-blue-700/60 rounded-lg p-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="text-lg font-semibold text-blue-100 mb-1">Game Invitation</h3>
            <p className="text-blue-200 text-sm">
              From: <span className="font-medium text-blue-100">{invitation.inviter.full_name}</span>
            </p>
          </div>
          <span className="bg-blue-600/60 text-blue-100 px-2 py-1 rounded text-xs font-medium">
            {invitation.status}
          </span>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex justify-between">
            <span className="text-blue-300 text-sm">Game:</span>
            <span className="text-blue-100 font-medium">{invitation.game_session.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-blue-300 text-sm">Start Time:</span>
            <span className="text-blue-100">{formatDate(invitation.game_session.start_time)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-blue-300 text-sm">Point Rate:</span>
            <span className="text-blue-100">${invitation.game_session.point_to_cash_rate}/point</span>
          </div>
          <div className="flex justify-between">
            <span className="text-blue-300 text-sm">Status:</span>
            <span className="text-blue-100 capitalize">{invitation.game_session.status}</span>
          </div>
        </div>

        {message && (
          <div
            className={`p-3 rounded-lg mb-4 ${
              message.type === "success"
                ? "bg-green-800/60 text-green-100 border border-green-600/50"
                : "bg-red-800/60 text-red-100 border border-red-600/50"
            }`}
          >
            {message.text}
          </div>
        )}

        {invitation.status === "pending" && (
          <div className="flex space-x-3">
            <button
              onClick={handleAcceptInvitation}
              disabled={isProcessing}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:cursor-not-allowed"
            >
              {isProcessing ? "Processing..." : "Accept"}
            </button>
            <button
              onClick={handleDeclineInvitation}
              disabled={isProcessing}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:cursor-not-allowed"
            >
              {isProcessing ? "Processing..." : "Decline"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
