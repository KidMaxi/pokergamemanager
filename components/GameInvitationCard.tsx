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
    inviter?: {
      id: string
      full_name: string
      email: string
    }
  }
  onInvitationUpdate?: () => void
}

export default function GameInvitationCard({ invitation, onInvitationUpdate }: GameInvitationCardProps) {
  const { user } = useAuth()
  const [isProcessing, setIsProcessing] = useState(false)

  const handleAcceptInvitation = async () => {
    if (!user || isProcessing) return

    setIsProcessing(true)
    try {
      console.log("🎯 Accepting game invitation:", invitation.id)

      // Use the new accept_game_invitation_v2 function
      const { data, error } = await supabase.rpc("accept_game_invitation_v2", {
        p_invitation_id: invitation.id,
        p_user_id: user.id,
      })

      if (error) {
        console.error("Error accepting invitation:", error)
        alert("Failed to accept invitation. Please try again.")
        return
      }

      console.log("✅ Invitation accepted successfully:", data)

      // Trigger refresh of the parent component
      if (onInvitationUpdate) {
        onInvitationUpdate()
      }

      // Also trigger a page refresh to update game state
      window.location.reload()
    } catch (error) {
      console.error("Error accepting invitation:", error)
      alert("Failed to accept invitation. Please try again.")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDeclineInvitation = async () => {
    if (!user || isProcessing) return

    setIsProcessing(true)
    try {
      console.log("❌ Declining game invitation:", invitation.id)

      const { error } = await supabase
        .from("game_invitations")
        .update({ status: "declined" })
        .eq("id", invitation.id)
        .eq("invitee_id", user.id)

      if (error) {
        console.error("Error declining invitation:", error)
        alert("Failed to decline invitation. Please try again.")
        return
      }

      console.log("✅ Invitation declined successfully")

      // Trigger refresh of the parent component
      if (onInvitationUpdate) {
        onInvitationUpdate()
      }
    } catch (error) {
      console.error("Error declining invitation:", error)
      alert("Failed to decline invitation. Please try again.")
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "text-yellow-600 bg-yellow-100"
      case "accepted":
        return "text-green-600 bg-green-100"
      case "declined":
        return "text-red-600 bg-red-100"
      default:
        return "text-gray-600 bg-gray-100"
    }
  }

  const getGameStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "text-green-600 bg-green-100"
      case "completed":
        return "text-blue-600 bg-blue-100"
      case "pending_close":
        return "text-orange-600 bg-orange-100"
      default:
        return "text-gray-600 bg-gray-100"
    }
  }

  return (
    <Card className="p-4 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-semibold text-lg text-gray-900">
              {invitation.game_session?.name || "Game Invitation"}
            </h3>
            <p className="text-sm text-gray-600">From: {invitation.inviter?.full_name || "Unknown"}</p>
          </div>
          <div className="flex flex-col items-end space-y-1">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(invitation.status)}`}>
              {invitation.status.charAt(0).toUpperCase() + invitation.status.slice(1)}
            </span>
            {invitation.game_session && (
              <span
                className={`px-2 py-1 rounded-full text-xs font-medium ${getGameStatusColor(invitation.game_session.status)}`}
              >
                Game: {invitation.game_session.status.replace("_", " ")}
              </span>
            )}
          </div>
        </div>

        {/* Game Details */}
        {invitation.game_session && (
          <div className="bg-gray-50 p-3 rounded-md">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="font-medium text-gray-700">Start Time:</span>
                <p className="text-gray-600">{formatDate(invitation.game_session.start_time)}</p>
              </div>
              <div>
                <span className="font-medium text-gray-700">Status:</span>
                <p className="text-gray-600 capitalize">{invitation.game_session.status.replace("_", " ")}</p>
              </div>
            </div>
          </div>
        )}

        {/* Invitation Details */}
        <div className="text-sm text-gray-600">
          <p>Invited: {formatDate(invitation.created_at)}</p>
        </div>

        {/* Action Buttons */}
        {invitation.status === "pending" && (
          <div className="flex space-x-2 pt-2">
            <Button
              onClick={handleAcceptInvitation}
              disabled={isProcessing}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? "Accepting..." : "Accept"}
            </Button>
            <Button
              onClick={handleDeclineInvitation}
              disabled={isProcessing}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? "Declining..." : "Decline"}
            </Button>
          </div>
        )}

        {/* Status Messages */}
        {invitation.status === "accepted" && (
          <div className="bg-green-50 border border-green-200 rounded-md p-3">
            <p className="text-green-800 text-sm font-medium">
              ✅ You've accepted this invitation! The game should appear in your dashboard.
            </p>
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
