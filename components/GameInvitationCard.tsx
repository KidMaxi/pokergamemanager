"use client"

import { useState } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "../contexts/AuthContext"
import Button from "./common/Button"

interface GameInvitation {
  id: string
  game_session_id: string
  inviter_id: string
  invitee_id: string
  status: "pending" | "accepted" | "declined"
  created_at: string
  updated_at: string | null
  game_session: {
    id: string
    name: string
    start_time: string
    status: string
    point_to_cash_rate: number
  }
  inviter_profile: {
    id: string
    full_name: string | null
    email: string
  }
}

interface GameInvitationCardProps {
  invitation: GameInvitation
  onInvitationUpdate: () => void
}

export default function GameInvitationCard({ invitation, onInvitationUpdate }: GameInvitationCardProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const handleAcceptInvitation = async () => {
    if (!user) return

    setLoading(true)
    setError("")
    setSuccess("")

    try {
      console.log("🎯 Accepting game invitation:", invitation.id)

      // Call the database function to accept the invitation
      const { data, error } = await supabase.rpc("accept_game_invitation", {
        invitation_id: invitation.id,
      })

      if (error) {
        console.error("Error accepting invitation:", error)
        throw error
      }

      console.log("✅ Invitation accepted successfully:", data)
      setSuccess("Invitation accepted! You've been added to the game.")

      // Refresh the invitations list
      onInvitationUpdate()

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(""), 3000)
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
    setSuccess("")

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
        throw error
      }

      console.log("✅ Invitation declined successfully")
      setSuccess("Invitation declined.")

      // Refresh the invitations list
      onInvitationUpdate()

      // Clear success message after 2 seconds
      setTimeout(() => setSuccess(""), 2000)
    } catch (error: any) {
      console.error("Error declining invitation:", error)
      setError(error.message || "Failed to decline invitation. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  const getInviterName = () => {
    return invitation.inviter_profile?.full_name || invitation.inviter_profile?.email || "Unknown Player"
  }

  return (
    <div className="bg-blue-800/80 backdrop-blur-sm border border-blue-600/50 rounded-lg p-4 mb-4">
      <div className="bg-blue-700/60 rounded-lg p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-blue-100 mb-1">🎮 Game Invitation</h3>
            <p className="text-blue-200 text-sm">
              <strong>{getInviterName()}</strong> invited you to join:
            </p>
            <p className="text-blue-100 font-medium text-lg mt-1">"{invitation.game_session.name}"</p>
          </div>
          <div className="text-right">
            <span className="inline-block bg-blue-600/80 text-blue-100 text-xs px-2 py-1 rounded">
              {invitation.status.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div>
            <span className="text-blue-300">Game Status:</span>
            <span className="text-blue-100 ml-2 capitalize">{invitation.game_session.status}</span>
          </div>
          <div>
            <span className="text-blue-300">Point Rate:</span>
            <span className="text-blue-100 ml-2">${invitation.game_session.point_to_cash_rate}/point</span>
          </div>
          <div>
            <span className="text-blue-300">Invited:</span>
            <span className="text-blue-100 ml-2">{formatDate(invitation.created_at)}</span>
          </div>
          <div>
            <span className="text-blue-300">Started:</span>
            <span className="text-blue-100 ml-2">{formatDate(invitation.game_session.start_time)}</span>
          </div>
        </div>

        {error && (
          <div className="bg-red-800/60 border border-red-600/50 rounded p-3 mb-4">
            <p className="text-red-200 text-sm">❌ {error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-800/60 border border-green-600/50 rounded p-3 mb-4">
            <p className="text-green-200 text-sm">✅ {success}</p>
          </div>
        )}

        {invitation.status === "pending" && (
          <div className="flex space-x-3">
            <Button
              onClick={handleAcceptInvitation}
              disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              {loading ? "Accepting..." : "✅ Accept"}
            </Button>
            <Button
              onClick={handleDeclineInvitation}
              disabled={loading}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              {loading ? "Declining..." : "❌ Decline"}
            </Button>
          </div>
        )}

        {invitation.status === "accepted" && (
          <div className="text-center">
            <p className="text-green-300 text-sm">✅ You've accepted this invitation</p>
          </div>
        )}

        {invitation.status === "declined" && (
          <div className="text-center">
            <p className="text-red-300 text-sm">❌ You've declined this invitation</p>
          </div>
        )}
      </div>
    </div>
  )
}
