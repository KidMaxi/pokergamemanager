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
  game_session?: {
    id: string
    name: string
    start_time: string
    status: string
    point_to_cash_rate: number
    user_id: string
  }
  inviter?: {
    id: string
    full_name?: string
    email?: string
  }
}

interface GameInvitationCardProps {
  invitation: GameInvitation
  onInvitationUpdate?: () => void
}

export default function GameInvitationCard({ invitation, onInvitationUpdate }: GameInvitationCardProps) {
  const { user } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Safe access to inviter data with fallbacks
  const inviterName = invitation.inviter?.full_name || invitation.inviter?.email || "Unknown User"
  const gameName = invitation.game_session?.name || "Unnamed Game"
  const gameStatus = invitation.game_session?.status || "unknown"

  const handleAcceptInvitation = async () => {
    if (!user) return

    setIsLoading(true)
    setError(null)

    try {
      console.log("🎯 Accepting game invitation:", invitation.id)

      // Use the new accept function that properly handles game state
      const { data, error } = await supabase.rpc("accept_game_invitation_v2", {
        p_invitation_id: invitation.id,
        p_user_id: user.id,
      })

      if (error) {
        console.error("Error accepting invitation:", error)
        setError(`Failed to accept invitation: ${error.message}`)
        return
      }

      if (!data) {
        console.error("No data returned from accept function")
        setError("Failed to accept invitation - no response from server")
        return
      }

      console.log("✅ Invitation accepted successfully:", data)

      // Trigger refresh of parent component
      if (onInvitationUpdate) {
        onInvitationUpdate()
      }

      // Also trigger a page refresh to update game lists
      window.location.reload()
    } catch (error) {
      console.error("Error accepting invitation:", error)
      setError(error instanceof Error ? error.message : "Unknown error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeclineInvitation = async () => {
    if (!user) return

    setIsLoading(true)
    setError(null)

    try {
      console.log("❌ Declining game invitation:", invitation.id)

      const { error } = await supabase
        .from("game_invitations")
        .update({ status: "declined" })
        .eq("id", invitation.id)
        .eq("invitee_id", user.id)

      if (error) {
        console.error("Error declining invitation:", error)
        setError(`Failed to decline invitation: ${error.message}`)
        return
      }

      console.log("✅ Invitation declined successfully")

      // Trigger refresh of parent component
      if (onInvitationUpdate) {
        onInvitationUpdate()
      }
    } catch (error) {
      console.error("Error declining invitation:", error)
      setError(error instanceof Error ? error.message : "Unknown error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  // Don't render if invitation is not pending
  if (invitation.status !== "pending") {
    return null
  }

  // Don't render if game is not active
  if (gameStatus !== "active") {
    return null
  }

  return (
    <Card className="p-4 border-l-4 border-l-blue-500 bg-blue-50">
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-gray-900">Game Invitation</h3>
          <p className="text-sm text-gray-600">
            <span className="font-medium">{inviterName}</span> invited you to join "{gameName}"
          </p>
        </div>

        {error && <div className="p-2 bg-red-100 border border-red-300 rounded text-sm text-red-700">{error}</div>}

        <div className="flex space-x-2">
          <Button
            onClick={handleAcceptInvitation}
            disabled={isLoading}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
          >
            {isLoading ? "Accepting..." : "Accept"}
          </Button>

          <Button
            onClick={handleDeclineInvitation}
            disabled={isLoading}
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
          >
            {isLoading ? "Declining..." : "Decline"}
          </Button>
        </div>

        <div className="text-xs text-gray-500">Invited {new Date(invitation.created_at).toLocaleDateString()}</div>
      </div>
    </Card>
  )
}
