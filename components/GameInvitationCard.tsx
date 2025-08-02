"use client"

import type React from "react"
import { useState } from "react"
import type { GameInvitation } from "../types"
import { formatDate } from "../utils"
import Button from "./common/Button"
import Card from "./common/Card"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"

interface GameInvitationCardProps {
  invitation: GameInvitation
  onInvitationHandled: () => void
}

const GameInvitationCard: React.FC<GameInvitationCardProps> = ({ invitation, onInvitationHandled }) => {
  const { user, profile } = useAuth()
  const [acceptLoading, setAcceptLoading] = useState(false)
  const [declineLoading, setDeclineLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const handleAccept = async () => {
    if (!user || !profile) {
      setError("User profile not available. Please refresh and try again.")
      return
    }

    setAcceptLoading(true)
    setError("")
    setSuccess("")

    try {
      console.log("🎮 Starting invitation acceptance process...", {
        invitationId: invitation.id,
        gameSessionId: invitation.game_session_id,
        userId: user.id,
        userProfile: profile,
      })

      // Use the improved database function to accept the invitation
      const { data: result, error: acceptError } = await supabase.rpc("accept_game_invitation", {
        invitation_id: invitation.id,
      })

      if (acceptError) {
        console.error("❌ Error accepting invitation via function:", acceptError)
        throw new Error(`Failed to accept invitation: ${acceptError.message}`)
      }

      // Check the result from the function
      if (!result?.success) {
        console.error("❌ Function returned error:", result?.error)
        throw new Error(result?.error || "Unknown error occurred")
      }

      console.log("✅ Invitation accepted successfully:", result)
      setSuccess(
        `Successfully joined "${invitation.game_session?.name}"! You've been added as a player with ${result.initial_points} points.`,
      )

      // Notify parent component to refresh
      setTimeout(() => {
        onInvitationHandled()
        // Force a page refresh to ensure all data is updated
        window.location.reload()
      }, 2000)
    } catch (error: any) {
      console.error("❌ Error accepting invitation:", error)
      setError(`Failed to accept invitation: ${error.message}`)
    } finally {
      setAcceptLoading(false)
    }
  }

  const handleDecline = async () => {
    if (!user) return

    setDeclineLoading(true)
    setError("")
    setSuccess("")

    try {
      console.log("🚫 Declining invitation:", invitation.id)

      // Update the invitation status to declined
      const { error: updateError } = await supabase
        .from("game_invitations")
        .update({
          status: "declined",
          updated_at: new Date().toISOString(),
        })
        .eq("id", invitation.id)
        .eq("invitee_id", user.id)

      if (updateError) {
        throw updateError
      }

      console.log("✅ Invitation declined successfully")
      setSuccess("Invitation declined.")

      // Remove the invitation from the UI after a short delay
      setTimeout(() => {
        onInvitationHandled()
      }, 1500)
    } catch (error: any) {
      console.error("❌ Error declining invitation:", error)
      setError("Failed to decline invitation. Please try again.")
    } finally {
      setDeclineLoading(false)
    }
  }

  return (
    <Card className="mb-3 sm:mb-4 border-blue-500 bg-blue-900/10">
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <span className="text-2xl">🎮</span>
          <h4 className="text-base sm:text-lg font-semibold text-blue-400 truncate">Game Invitation</h4>
        </div>

        <div className="text-xs sm:text-sm text-text-secondary space-y-2">
          <div className="bg-blue-900/20 border border-blue-600 rounded p-3">
            <p className="text-blue-200">
              <strong className="text-white">
                {invitation.inviter_profile?.full_name || invitation.inviter_profile?.email || "Someone"}
              </strong>{" "}
              invited you to join:
            </p>
            <p className="text-white font-medium text-base mt-1 mb-2">
              "{invitation.game_session?.name || "Poker Game"}"
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-blue-300">Game Started:</span>
                <br />
                <span className="text-white">
                  {invitation.game_session?.start_time ? formatDate(invitation.game_session.start_time, false) : "N/A"}
                </span>
              </div>
              <div>
                <span className="text-blue-300">Status:</span>
                <br />
                <span
                  className={`font-semibold ${
                    invitation.game_session?.status === "active" ? "text-green-400" : "text-yellow-400"
                  }`}
                >
                  {invitation.game_session?.status === "active"
                    ? "🟢 Active"
                    : "⏸️ " + (invitation.game_session?.status || "Unknown")}
                </span>
              </div>
            </div>
          </div>

          <p className="text-text-secondary text-xs">Invited: {formatDate(invitation.created_at, false)}</p>
        </div>

        {success && (
          <div className="bg-green-900/20 border border-green-600 rounded p-3">
            <p className="text-green-400 text-sm font-semibold">✅ {success}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-600 rounded p-3">
            <p className="text-red-400 text-sm">❌ {error}</p>
          </div>
        )}

        <div className="flex space-x-2 pt-2">
          <Button
            onClick={handleAccept}
            variant="primary"
            size="sm"
            disabled={acceptLoading || declineLoading || !!success}
            className="flex-1"
          >
            {acceptLoading ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Joining Game...</span>
              </div>
            ) : (
              "✅ Accept & Join Game"
            )}
          </Button>
          <Button
            onClick={handleDecline}
            variant="danger"
            size="sm"
            disabled={acceptLoading || declineLoading || !!success}
            className="flex-1"
          >
            {declineLoading ? "Declining..." : "❌ Decline"}
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default GameInvitationCard
