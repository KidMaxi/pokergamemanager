"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"
import type { FriendRequest, Friendship } from "../types"
import { formatCurrency, formatDate } from "../utils"
import Card from "./common/Card"
import Button from "./common/Button"
import Input from "./common/Input"
import Modal from "./common/Modal"

const FriendsPage: React.FC = () => {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<"friends" | "sent" | "received">("friends")
  const [friends, setFriends] = useState<Friendship[]>([])
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([])
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddFriendModal, setShowAddFriendModal] = useState(false)
  const [friendEmail, setFriendEmail] = useState("")
  const [addFriendLoading, setAddFriendLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const loadFriendsData = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError("")
      console.log("[v0] Loading friends data for user:", user.id)

      // Initialize arrays
      let friendsWithProfiles: Friendship[] = []
      let sentWithProfiles: FriendRequest[] = []
      let receivedWithProfiles: FriendRequest[] = []

      try {
        // Load friends with profile data
        const { data: friendsData, error: friendsError } = await supabase
          .from("friendships")
          .select("*")
          .eq("user_id", user.id)

        console.log("[v0] Friendships query result:", { friendsData, friendsError })

        if (friendsError) {
          console.error("Error loading friends:", friendsError)
          // Don't throw here, just log and continue
        } else if (friendsData && friendsData.length > 0) {
          console.log("[v0] Found", friendsData.length, "friendships")

          // Check if these friendships are bidirectional
          for (const friendship of friendsData) {
            const { data: reverseCheck } = await supabase
              .from("friendships")
              .select("id")
              .eq("user_id", friendship.friend_id)
              .eq("friend_id", user.id)
              .single()

            console.log(
              "[v0] Bidirectional check for friendship",
              friendship.id,
              ":",
              reverseCheck ? "✅ Bidirectional" : "❌ Unidirectional",
            )
          }

          // Get friend profiles
          const friendIds = friendsData.map((f) => f.friend_id)

          const { data: profilesData, error: profilesError } = await supabase
            .from("profiles")
            .select("id, full_name, email, all_time_profit_loss, games_played")
            .in("id", friendIds)

          if (!profilesError && profilesData) {
            friendsWithProfiles = friendsData.map((friendship) => ({
              ...friendship,
              friend_profile: profilesData.find((p) => p.id === friendship.friend_id),
            }))
          }
        }
      } catch (err) {
        console.error("Error in friends loading:", err)
      }

      try {
        // Load sent requests (only pending ones)
        const { data: sentData, error: sentError } = await supabase
          .from("friend_requests")
          .select("*")
          .eq("sender_id", user.id)
          .eq("status", "pending")

        if (!sentError && sentData && sentData.length > 0) {
          // Get receiver profiles for sent requests
          const receiverIds = sentData.map((r) => r.receiver_id)

          const { data: receiverProfiles, error: receiverError } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", receiverIds)

          if (!receiverError && receiverProfiles) {
            sentWithProfiles = sentData.map((request) => ({
              ...request,
              receiver_profile: receiverProfiles.find((p) => p.id === request.receiver_id),
            }))
          }
        }
      } catch (err) {
        console.error("Error in sent requests loading:", err)
      }

      try {
        // Load received requests (only pending ones)
        const { data: receivedData, error: receivedError } = await supabase
          .from("friend_requests")
          .select("*")
          .eq("receiver_id", user.id)
          .eq("status", "pending")

        if (!receivedError && receivedData && receivedData.length > 0) {
          // Get sender profiles for received requests
          const senderIds = receivedData.map((r) => r.sender_id)

          const { data: senderProfiles, error: senderError } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", senderIds)

          if (!senderError && senderProfiles) {
            receivedWithProfiles = receivedData.map((request) => ({
              ...request,
              sender_profile: senderProfiles.find((p) => p.id === request.sender_id),
            }))
          }
        }
      } catch (err) {
        console.error("Error in received requests loading:", err)
      }

      // Update state with loaded data
      setFriends(friendsWithProfiles)
      setSentRequests(sentWithProfiles)
      setReceivedRequests(receivedWithProfiles)

      console.log("Friends data loaded successfully")
    } catch (error) {
      console.error("Error in loadFriendsData:", error)
      setError("Failed to load friends data. Please try refreshing the page.")
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    let mounted = true

    const loadData = async () => {
      if (user && mounted) {
        await loadFriendsData()
      }
    }

    loadData()

    return () => {
      mounted = false
    }
  }, [user, loadFriendsData])

  const handleSendFriendRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !friendEmail.trim()) return

    setAddFriendLoading(true)
    setError("")
    setSuccess("")

    try {
      // First, find the user by email
      const { data: targetUser, error: userError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .eq("email", friendEmail.trim().toLowerCase())
        .single()

      if (userError || !targetUser) {
        setError("User not found with that email address")
        return
      }

      if (targetUser.id === user.id) {
        setError("You cannot send a friend request to yourself")
        return
      }

      // Check if already friends
      const { data: existingFriendship } = await supabase
        .from("friendships")
        .select("id")
        .eq("user_id", user.id)
        .eq("friend_id", targetUser.id)
        .single()

      if (existingFriendship) {
        setError("You are already friends with this user")
        return
      }

      // Check if request already exists (only pending ones exist now)
      const { data: existingRequest } = await supabase
        .from("friend_requests")
        .select("id, status")
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${targetUser.id}),and(sender_id.eq.${targetUser.id},receiver_id.eq.${user.id})`,
        )
        .single()

      if (existingRequest) {
        setError("A friend request is already pending with this user")
        return
      }

      // Send friend request
      const { error: requestError } = await supabase.from("friend_requests").insert({
        sender_id: user.id,
        receiver_id: targetUser.id,
        status: "pending",
      })

      if (requestError) {
        throw requestError
      }

      setSuccess(`Friend request sent to ${targetUser.full_name || targetUser.email}!`)
      setFriendEmail("")
      setShowAddFriendModal(false)
      loadFriendsData() // Refresh data
    } catch (error: any) {
      console.error("Error sending friend request:", error)
      setError("Failed to send friend request")
    } finally {
      setAddFriendLoading(false)
    }
  }

  const handleAcceptRequest = async (requestId: string) => {
    try {
      setError("")
      console.log("[v0] Accepting friend request:", requestId)

      const { data, error } = await supabase.rpc("accept_friend_request", {
        request_id: requestId,
      })

      if (error) {
        console.error("[v0] RPC Error details:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        })

        // Provide more specific error messages
        if (error.message.includes("Friend request not found")) {
          setError("This friend request is no longer available or you don't have permission to accept it.")
        } else if (error.message.includes("duplicate key")) {
          setError("You are already friends with this user.")
        } else {
          setError(`Failed to accept friend request: ${error.message}`)
        }
        return
      }

      console.log("[v0] RPC Response:", data)
      console.log("[v0] Friend request accepted successfully")

      setTimeout(async () => {
        console.log("[v0] Verifying bidirectional friendship creation...")
        await loadFriendsData()
      }, 1000)

      setSuccess("Friend request accepted!")
    } catch (error: any) {
      console.error("Error accepting request:", error)
      setError("Failed to accept friend request")
    }
  }

  const handleDeclineRequest = async (requestId: string) => {
    try {
      setError("")
      const { error } = await supabase
        .from("friend_requests")
        .update({ status: "declined", updated_at: new Date().toISOString() })
        .eq("id", requestId)

      if (error) {
        throw error
      }

      setSuccess("Friend request declined")
      loadFriendsData() // Refresh data
    } catch (error: any) {
      console.error("Error declining request:", error)
      setError("Failed to decline friend request")
    }
  }

  const handleRemoveFriend = async (friendId: string) => {
    if (!confirm("Are you sure you want to remove this friend?")) return

    try {
      setError("")
      const { error } = await supabase.rpc("remove_friendship", {
        friend_user_id: friendId,
      })

      if (error) {
        throw error
      }

      setSuccess("Friend removed")
      loadFriendsData() // Refresh data
    } catch (error: any) {
      console.error("Error removing friend:", error)
      setError("Failed to remove friend")
    }
  }

  const handleCancelRequest = async (requestId: string) => {
    try {
      setError("")
      const { error } = await supabase.from("friend_requests").delete().eq("id", requestId)

      if (error) {
        throw error
      }

      setSuccess("Friend request cancelled")
      loadFriendsData() // Refresh data
    } catch (error: any) {
      console.error("Error cancelling request:", error)
      setError("Failed to cancel friend request")
    }
  }

  const handleRetry = () => {
    setError("")
    loadFriendsData()
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading friends...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-text-primary">Friends</h1>
          <Button onClick={() => setShowAddFriendModal(true)} variant="primary" className="flex items-center space-x-2">
            <span>+</span>
            <span>Add Friend</span>
          </Button>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm flex justify-between items-center">
            <span>{error}</span>
            <Button onClick={handleRetry} variant="ghost" size="sm" className="text-red-400 hover:text-red-300">
              Retry
            </Button>
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-900/20 border border-green-800 rounded-lg text-green-400 text-sm">
            {success}
          </div>
        )}

        {/* Tabs */}
        <div className="flex space-x-1 mb-6 bg-surface-input rounded-lg p-1">
          <button
            onClick={() => setActiveTab("friends")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === "friends" ? "bg-brand-primary text-white" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Friends ({friends.length})
          </button>
          <button
            onClick={() => setActiveTab("received")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === "received" ? "bg-brand-primary text-white" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Requests ({receivedRequests.length})
          </button>
          <button
            onClick={() => setActiveTab("sent")}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === "sent" ? "bg-brand-primary text-white" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            Sent ({sentRequests.length})
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "friends" && (
          <div className="space-y-4">
            {friends.length === 0 ? (
              <Card className="text-center py-8">
                <p className="text-text-secondary mb-4">No friends yet</p>
                <Button onClick={() => setShowAddFriendModal(true)} variant="primary">
                  Add Your First Friend
                </Button>
              </Card>
            ) : (
              friends.map((friendship) => (
                <Card key={friendship.id} className="p-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-3 sm:space-y-0">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-brand-primary rounded-full flex items-center justify-center text-white font-bold text-lg">
                        {friendship.friend_profile?.full_name?.charAt(0) ||
                          friendship.friend_profile?.email?.charAt(0).toUpperCase() ||
                          "?"}
                      </div>
                      <div>
                        <h3 className="font-semibold text-text-primary">
                          {friendship.friend_profile?.full_name || "Unknown User"}
                        </h3>
                        <p className="text-text-secondary text-sm">{friendship.friend_profile?.email}</p>
                        <div className="flex flex-wrap gap-x-4 mt-1 text-xs text-text-secondary">
                          <span>
                            P/L:{" "}
                            <span
                              className={
                                (friendship.friend_profile?.all_time_profit_loss || 0) >= 0
                                  ? "text-green-400"
                                  : "text-red-400"
                              }
                            >
                              {formatCurrency(friendship.friend_profile?.all_time_profit_loss || 0)}
                            </span>
                          </span>
                          <span>Games: {friendship.friend_profile?.games_played || 0}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={() => handleRemoveFriend(friendship.friend_id)} variant="danger" size="sm">
                        Remove
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {activeTab === "received" && (
          <div className="space-y-4">
            {receivedRequests.length === 0 ? (
              <Card className="text-center py-8">
                <p className="text-text-secondary">No pending friend requests</p>
              </Card>
            ) : (
              receivedRequests.map((request) => (
                <Card key={request.id} className="p-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-3 sm:space-y-0">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-brand-primary rounded-full flex items-center justify-center text-white font-bold text-lg">
                        {request.sender_profile?.full_name?.charAt(0) ||
                          request.sender_profile?.email?.charAt(0).toUpperCase() ||
                          "?"}
                      </div>
                      <div>
                        <h3 className="font-semibold text-text-primary">
                          {request.sender_profile?.full_name || "Unknown User"}
                        </h3>
                        <p className="text-text-secondary text-sm">{request.sender_profile?.email}</p>
                        <p className="text-xs text-text-secondary">Sent {formatDate(request.created_at, false)}</p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Button onClick={() => handleAcceptRequest(request.id)} variant="primary" size="sm">
                        Accept
                      </Button>
                      <Button onClick={() => handleDeclineRequest(request.id)} variant="danger" size="sm">
                        Decline
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {activeTab === "sent" && (
          <div className="space-y-4">
            {sentRequests.length === 0 ? (
              <Card className="text-center py-8">
                <p className="text-text-secondary">No pending sent requests</p>
              </Card>
            ) : (
              sentRequests.map((request) => (
                <Card key={request.id} className="p-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-3 sm:space-y-0">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gray-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                        {request.receiver_profile?.full_name?.charAt(0) ||
                          request.receiver_profile?.email?.charAt(0).toUpperCase() ||
                          "?"}
                      </div>
                      <div>
                        <h3 className="font-semibold text-text-primary">
                          {request.receiver_profile?.full_name || "Unknown User"}
                        </h3>
                        <p className="text-text-secondary text-sm">{request.receiver_profile?.email}</p>
                        <p className="text-xs text-text-secondary">Sent {formatDate(request.created_at, false)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
                      <span className="text-xs text-yellow-400 bg-yellow-900/20 px-2 py-1 rounded">Pending</span>
                      <Button onClick={() => handleCancelRequest(request.id)} variant="ghost" size="sm">
                        Cancel
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {/* Add Friend Modal */}
        <Modal
          isOpen={showAddFriendModal}
          onClose={() => {
            setShowAddFriendModal(false)
            setFriendEmail("")
            setError("")
            setSuccess("")
          }}
          title="Add Friend"
        >
          <form onSubmit={handleSendFriendRequest} className="space-y-4">
            <Input
              label="Friend's Email"
              id="friendEmail"
              type="email"
              value={friendEmail}
              onChange={(e) => setFriendEmail(e.target.value)}
              placeholder="Enter their email address"
              required
            />

            <div className="flex justify-end space-x-2">
              <Button type="button" onClick={() => setShowAddFriendModal(false)} variant="ghost">
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={addFriendLoading || !friendEmail.trim()}>
                {addFriendLoading ? "Sending..." : "Send Request"}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </div>
  )
}

export default FriendsPage
