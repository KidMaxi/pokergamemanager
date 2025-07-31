"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { supabase } from "../../lib/supabase"
import Button from "../common/Button"
import Card from "../common/Card"
import Modal from "../common/Modal"

interface FriendInvitationDebuggerProps {
  gameSessionId: string
  onClose: () => void
}

interface DebugData {
  gameSession: any
  invitations: any[]
  profiles: any[]
  friendships: any[]
  errors: string[]
}

const FriendInvitationDebugger: React.FC<FriendInvitationDebuggerProps> = ({ gameSessionId, onClose }) => {
  const { user } = useAuth()
  const [debugData, setDebugData] = useState<DebugData | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const runDiagnostics = async () => {
    if (!user) return

    setLoading(true)
    const errors: string[] = []
    let gameSession = null
    let invitations: any[] = []
    let profiles: any[] = []
    let friendships: any[] = []

    try {
      // 1. Get game session details
      console.log("🔍 Fetching game session:", gameSessionId)
      const { data: sessionData, error: sessionError } = await supabase
        .from("game_sessions")
        .select("*")
        .eq("id", gameSessionId)
        .single()

      if (sessionError) {
        errors.push(`Game session error: ${sessionError.message}`)
      } else {
        gameSession = sessionData
        console.log("✅ Game session found:", {
          id: sessionData.id,
          name: sessionData.name,
          status: sessionData.status,
          playersCount: sessionData.players_data?.length || 0,
          invitedUsersCount: sessionData.invited_users?.length || 0,
        })
      }

      // 2. Get all invitations for this game
      console.log("🔍 Fetching game invitations...")
      const { data: invitationsData, error: invitationsError } = await supabase
        .from("game_invitations")
        .select(`
          *,
          inviter_profile:profiles!game_invitations_inviter_id_fkey(id, full_name, email),
          invitee_profile:profiles!game_invitations_invitee_id_fkey(id, full_name, email)
        `)
        .eq("game_session_id", gameSessionId)
        .order("created_at", { ascending: false })

      if (invitationsError) {
        errors.push(`Invitations error: ${invitationsError.message}`)
      } else {
        invitations = invitationsData || []
        console.log("✅ Invitations found:", invitations.length)
      }

      // 3. Get all relevant profiles
      console.log("🔍 Fetching user profiles...")
      const allUserIds = new Set([
        user.id,
        ...(gameSession?.invited_users || []),
        ...invitations.map((i) => i.inviter_id),
        ...invitations.map((i) => i.invitee_id),
      ])

      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", Array.from(allUserIds))

      if (profilesError) {
        errors.push(`Profiles error: ${profilesError.message}`)
      } else {
        profiles = profilesData || []
        console.log("✅ Profiles found:", profiles.length)
      }

      // 4. Get friendships
      console.log("🔍 Fetching friendships...")
      const { data: friendshipsData, error: friendshipsError } = await supabase
        .from("friendships")
        .select("*")
        .eq("user_id", user.id)

      if (friendshipsError) {
        errors.push(`Friendships error: ${friendshipsError.message}`)
      } else {
        friendships = friendshipsData || []
        console.log("✅ Friendships found:", friendships.length)
      }
    } catch (error: any) {
      errors.push(`Unexpected error: ${error.message}`)
      console.error("🚨 Diagnostic error:", error)
    }

    setDebugData({
      gameSession,
      invitations,
      profiles,
      friendships,
      errors,
    })
    setLoading(false)
  }

  const refreshData = async () => {
    setRefreshing(true)
    await runDiagnostics()
    setRefreshing(false)
  }

  const testInvitationAcceptance = async (invitationId: string) => {
    if (!user) return

    try {
      console.log("🧪 Testing invitation acceptance:", invitationId)

      const { data, error } = await supabase.rpc("accept_game_invitation", {
        invitation_id: invitationId,
      })

      if (error) {
        console.error("❌ Test failed:", error)
        alert(`Test failed: ${error.message}`)
      } else {
        console.log("✅ Test successful:", data)
        alert("Test successful! Refreshing data...")
        await refreshData()
      }
    } catch (error: any) {
      console.error("🚨 Test error:", error)
      alert(`Test error: ${error.message}`)
    }
  }

  useEffect(() => {
    runDiagnostics()
  }, [gameSessionId, user])

  if (!debugData) {
    return (
      <Modal isOpen={true} onClose={onClose} title="🔧 Friend Invitation Debugger">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary mx-auto mb-4"></div>
          <p>Running diagnostics...</p>
        </div>
      </Modal>
    )
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="🔧 Friend Invitation Debugger" size="large">
      <div className="space-y-6 max-h-96 overflow-y-auto">
        {/* Header Actions */}
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Diagnostic Results</h3>
          <Button onClick={refreshData} variant="secondary" size="sm" disabled={refreshing}>
            {refreshing ? "Refreshing..." : "🔄 Refresh"}
          </Button>
        </div>

        {/* Errors */}
        {debugData.errors.length > 0 && (
          <Card className="bg-red-900/20 border-red-600">
            <h4 className="text-red-400 font-semibold mb-2">🚨 Errors Found</h4>
            <ul className="text-sm space-y-1">
              {debugData.errors.map((error, index) => (
                <li key={index} className="text-red-300">
                  • {error}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Game Session Info */}
        <Card>
          <h4 className="text-blue-400 font-semibold mb-2">🎮 Game Session</h4>
          {debugData.gameSession ? (
            <div className="text-sm space-y-1">
              <p>
                <strong>ID:</strong> {debugData.gameSession.id}
              </p>
              <p>
                <strong>Name:</strong> {debugData.gameSession.name}
              </p>
              <p>
                <strong>Status:</strong> {debugData.gameSession.status}
              </p>
              <p>
                <strong>Owner:</strong> {debugData.gameSession.user_id}
              </p>
              <p>
                <strong>Players in Game:</strong> {debugData.gameSession.players_data?.length || 0}
              </p>
              <p>
                <strong>Invited Users:</strong> {debugData.gameSession.invited_users?.length || 0}
              </p>

              {debugData.gameSession.players_data?.length > 0 && (
                <div className="mt-2">
                  <p>
                    <strong>Player Names:</strong>
                  </p>
                  <ul className="ml-4">
                    {debugData.gameSession.players_data.map((player: any, index: number) => (
                      <li key={index}>
                        • {player.name} ({player.status})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {debugData.gameSession.invited_users?.length > 0 && (
                <div className="mt-2">
                  <p>
                    <strong>Invited User IDs:</strong>
                  </p>
                  <ul className="ml-4">
                    {debugData.gameSession.invited_users.map((userId: string, index: number) => {
                      const profile = debugData.profiles.find((p) => p.id === userId)
                      return (
                        <li key={index}>
                          • {userId} ({profile?.full_name || profile?.email || "Unknown"})
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-red-400">Game session not found</p>
          )}
        </Card>

        {/* Invitations */}
        <Card>
          <h4 className="text-green-400 font-semibold mb-2">📨 Invitations ({debugData.invitations.length})</h4>
          {debugData.invitations.length > 0 ? (
            <div className="space-y-3">
              {debugData.invitations.map((invitation, index) => (
                <div key={index} className="bg-slate-700 p-3 rounded border">
                  <div className="text-sm space-y-1">
                    <p>
                      <strong>ID:</strong> {invitation.id}
                    </p>
                    <p>
                      <strong>Status:</strong>{" "}
                      <span
                        className={
                          invitation.status === "accepted"
                            ? "text-green-400"
                            : invitation.status === "pending"
                              ? "text-yellow-400"
                              : "text-red-400"
                        }
                      >
                        {invitation.status}
                      </span>
                    </p>
                    <p>
                      <strong>Inviter:</strong>{" "}
                      {invitation.inviter_profile?.full_name || invitation.inviter_profile?.email}
                    </p>
                    <p>
                      <strong>Invitee:</strong>{" "}
                      {invitation.invitee_profile?.full_name || invitation.invitee_profile?.email}
                    </p>
                    <p>
                      <strong>Created:</strong> {new Date(invitation.created_at).toLocaleString()}
                    </p>

                    {invitation.status === "pending" && invitation.invitee_id === user?.id && (
                      <div className="mt-2">
                        <Button onClick={() => testInvitationAcceptance(invitation.id)} variant="primary" size="sm">
                          🧪 Test Accept
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400">No invitations found</p>
          )}
        </Card>

        {/* User Profiles */}
        <Card>
          <h4 className="text-purple-400 font-semibold mb-2">👥 User Profiles ({debugData.profiles.length})</h4>
          <div className="text-sm space-y-1 max-h-32 overflow-y-auto">
            {debugData.profiles.map((profile, index) => (
              <div key={index} className="flex justify-between">
                <span>{profile.full_name || profile.email}</span>
                <span className="text-gray-400">{profile.id.substring(0, 8)}...</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Friendships */}
        <Card>
          <h4 className="text-yellow-400 font-semibold mb-2">🤝 Friendships ({debugData.friendships.length})</h4>
          <div className="text-sm space-y-1 max-h-32 overflow-y-auto">
            {debugData.friendships.map((friendship, index) => {
              const friendProfile = debugData.profiles.find((p) => p.id === friendship.friend_id)
              return (
                <div key={index} className="flex justify-between">
                  <span>{friendProfile?.full_name || friendProfile?.email || "Unknown"}</span>
                  <span className="text-gray-400">{friendship.friend_id.substring(0, 8)}...</span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Actions */}
        <div className="flex justify-end space-x-2 pt-4 border-t">
          <Button onClick={onClose} variant="ghost">
            Close Debugger
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default FriendInvitationDebugger
