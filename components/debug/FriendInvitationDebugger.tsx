"use client"

import { useState, useEffect } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { supabase } from "../../lib/supabase"
import type { GameSession } from "../../types"
import Button from "../common/Button"
import Card from "../common/Card"

interface FriendInvitationDebuggerProps {
  session: GameSession
  onUpdateSession: (session: GameSession) => Promise<void>
}

interface Friend {
  id: string
  full_name: string | null
  email: string
}

interface GameInvitation {
  id: string
  invitee_id: string
  status: "pending" | "accepted" | "declined"
  created_at: string
  invitee: {
    full_name: string | null
    email: string
  }
}

export default function FriendInvitationDebugger({ session, onUpdateSession }: FriendInvitationDebuggerProps) {
  const { user } = useAuth()
  const [friends, setFriends] = useState<Friend[]>([])
  const [gameInvitations, setGameInvitations] = useState<GameInvitation[]>([])
  const [selectedFriends, setSelectedFriends] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [debugInfo, setDebugInfo] = useState<string[]>([])

  const addDebugInfo = (message: string) => {
    setDebugInfo((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${message}`])
  }

  const loadFriends = async () => {
    if (!user) return

    try {
      addDebugInfo("Loading friends...")

      const { data: friendships, error } = await supabase
        .from("friendships")
        .select(`
          friend_id,
          friend:profiles!friendships_friend_id_fkey(
            id,
            full_name,
            email
          )
        `)
        .eq("user_id", user.id)

      if (error) {
        addDebugInfo(`Error loading friends: ${error.message}`)
        return
      }

      const friendsList =
        friendships?.map((f) => ({
          id: f.friend_id,
          full_name: f.friend.full_name,
          email: f.friend.email,
        })) || []

      setFriends(friendsList)
      addDebugInfo(`Loaded ${friendsList.length} friends`)
    } catch (error) {
      addDebugInfo(`Exception loading friends: ${error}`)
    }
  }

  const loadGameInvitations = async () => {
    if (!user) return

    try {
      addDebugInfo("Loading game invitations...")

      const { data: invitations, error } = await supabase
        .from("game_invitations")
        .select(`
          id,
          invitee_id,
          status,
          created_at,
          invitee:profiles!game_invitations_invitee_id_fkey(
            full_name,
            email
          )
        `)
        .eq("game_session_id", session.id)

      if (error) {
        addDebugInfo(`Error loading invitations: ${error.message}`)
        return
      }

      setGameInvitations(invitations || [])
      addDebugInfo(`Loaded ${invitations?.length || 0} invitations for this game`)
    } catch (error) {
      addDebugInfo(`Exception loading invitations: ${error}`)
    }
  }

  const handleInviteFriendsToGame = async () => {
    if (!user || selectedFriends.length === 0) {
      addDebugInfo("No friends selected or user not found")
      return
    }

    setLoading(true)
    addDebugInfo(`Starting invitation process for ${selectedFriends.length} friends`)

    try {
      // 1. Send invitations to database
      const invitations = selectedFriends.map((friendId) => ({
        game_session_id: session.id,
        inviter_id: user.id,
        invitee_id: friendId,
        status: "pending" as const,
      }))

      addDebugInfo("Inserting invitations into database...")
      const { error: inviteError } = await supabase.from("game_invitations").insert(invitations)

      if (inviteError) {
        addDebugInfo(`Error inserting invitations: ${inviteError.message}`)
        throw inviteError
      }

      addDebugInfo("Invitations inserted successfully")

      // 2. Update session with invited users
      const updatedSession = {
        ...session,
        invitedUsers: [...(session.invitedUsers || []), ...selectedFriends],
      }

      addDebugInfo("Updating session with invited users...")
      await onUpdateSession(updatedSession)
      addDebugInfo("Session updated successfully")

      // 3. Reload invitations to show updated state
      await loadGameInvitations()

      // 4. Clear selection
      setSelectedFriends([])
      addDebugInfo("Invitation process completed successfully")
    } catch (error) {
      addDebugInfo(`Error in invitation process: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFriends()
    loadGameInvitations()
  }, [user, session.id])

  const toggleFriendSelection = (friendId: string) => {
    setSelectedFriends((prev) => (prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId]))
  }

  return (
    <Card className="bg-purple-900/20 border-purple-600">
      <div className="p-4">
        <h3 className="text-lg font-semibold text-purple-400 mb-4">Friend Invitation Debugger</h3>

        {/* Debug Log */}
        <div className="mb-4">
          <h4 className="text-sm font-medium text-purple-300 mb-2">Debug Log:</h4>
          <div className="bg-black/30 rounded p-2 max-h-32 overflow-y-auto">
            {debugInfo.map((info, index) => (
              <div key={index} className="text-xs text-gray-300 font-mono">
                {info}
              </div>
            ))}
          </div>
        </div>

        {/* Current Session Info */}
        <div className="mb-4 p-3 bg-purple-900/30 rounded">
          <h4 className="text-sm font-medium text-purple-300 mb-2">Session Info:</h4>
          <div className="text-xs text-gray-300 space-y-1">
            <div>ID: {session.id}</div>
            <div>Name: {session.name}</div>
            <div>Status: {session.status}</div>
            <div>Invited Users: {JSON.stringify(session.invitedUsers || [])}</div>
          </div>
        </div>

        {/* Friends List */}
        <div className="mb-4">
          <h4 className="text-sm font-medium text-purple-300 mb-2">Available Friends ({friends.length}):</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {friends.map((friend) => (
              <div key={friend.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedFriends.includes(friend.id)}
                  onChange={() => toggleFriendSelection(friend.id)}
                  className="rounded"
                />
                <span className="text-sm text-gray-300">
                  {friend.full_name || friend.email} ({friend.id.slice(0, 8)}...)
                </span>
              </div>
            ))}
            {friends.length === 0 && <div className="text-sm text-gray-500">No friends found</div>}
          </div>
        </div>

        {/* Invite Button */}
        <div className="mb-4">
          <Button
            onClick={handleInviteFriendsToGame}
            disabled={loading || selectedFriends.length === 0}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 text-sm"
          >
            {loading ? "Inviting..." : `Invite ${selectedFriends.length} Friends`}
          </Button>
        </div>

        {/* Current Invitations */}
        <div>
          <h4 className="text-sm font-medium text-purple-300 mb-2">Game Invitations ({gameInvitations.length}):</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {gameInvitations.map((invitation) => (
              <div key={invitation.id} className="text-xs text-gray-300 p-2 bg-purple-900/20 rounded">
                <div>To: {invitation.invitee.full_name || invitation.invitee.email}</div>
                <div>
                  Status:{" "}
                  <span
                    className={`font-semibold ${
                      invitation.status === "accepted"
                        ? "text-green-400"
                        : invitation.status === "declined"
                          ? "text-red-400"
                          : "text-yellow-400"
                    }`}
                  >
                    {invitation.status}
                  </span>
                </div>
                <div>Sent: {new Date(invitation.created_at).toLocaleString()}</div>
              </div>
            ))}
            {gameInvitations.length === 0 && <div className="text-sm text-gray-500">No invitations sent</div>}
          </div>
        </div>

        {/* Refresh Button */}
        <div className="mt-4 pt-4 border-t border-purple-600">
          <Button
            onClick={() => {
              loadFriends()
              loadGameInvitations()
            }}
            className="bg-purple-700 hover:bg-purple-800 text-white px-3 py-1 text-xs"
          >
            Refresh Data
          </Button>
        </div>
      </div>
    </Card>
  )
}
