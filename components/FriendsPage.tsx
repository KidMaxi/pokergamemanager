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
      console.log("Loading friends data...")

      let friendsWithProfiles: Friendship[] = []
      let sentWithProfiles: FriendRequest[] = []
      let receivedWithProfiles: FriendRequest[] = []

      try {
        const { data: friendsData, error: friendsError } = await supabase
          .from("friendships")
          .select("*")
          .eq("user_id", user.id)

        if (friendsError) {
          console.error("Error loading friends:", friendsError)
        } else if (friendsData && friendsData.length > 0) {
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
        const { data: sentData, error: sentError } = await supabase
          .from("friend_requests")
          .select("*")
          .eq("sender_id", user.id)
          .eq("status", "pending")

        if (!sentError && sentData && sentData.length > 0) {
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
        const { data: receivedData, error: receivedError } = await supabase
          .from("friend_requests")
          .select("*")
          .eq("receiver_id", user.id)
          .eq("status", "pending")

        if (!receivedError && receivedData && receivedData.length > 0) {
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
      loadFriendsData()
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
      const { error } = await supabase.rpc("accept_friend_request", {
        request_id: requestId,
      })

      if (error) {
        throw error
      }

      setSuccess("Friend request accepted!")
      loadFriendsData()
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
      loadFriendsData()
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
      loadFriendsData()
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
      loadFriendsData()
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
      <div className="min-h-screen default-background">
        <div className="container mx-auto px-4 py-8">
          <Card className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary mx-auto mb-4"></div>
            <p className="text-text-secondary">Loading friends...</p>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen default-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
            <div>
              <h1 className="text-3xl font-bold text-text-primary mb-2">👥 Friends</h1>
              <p className="text-text-secondary">Connect with other poker players</p>
            </div>
            <Button
              onClick={() => setShowAddFriendModal(true)}
              variant="primary"
              className="flex items-center space-x-2"
            >
              <span>+</span>
              <span>Add Friend</span>
            </Button>
          </div>
        </div>

        {error && (
          <Card className="mb-6 bg-red-900/10 border border-red-800">
            <div className="flex justify-between items-start">
              <div className="flex items-start space-x-3">
                <div className="text-red-400 text-xl">⚠️</div>
                <div>
                  <p className="text-red-400 font-medium">Error</p>
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              </div>
              <Button onClick={handleRetry} variant="ghost" size="sm" className="text-red-400 hover:text-red-300">
                Retry
              </Button>
            </div>
          </Card>
        )}

        {success && (
          <Card className="mb-6 bg-green-900/10 border border-green-800">
            <div className="flex items-start space-x-3">
              <div className="text-green-400 text-xl">✅</div>
              <div>
                <p className="text-green-400 font-medium">Success</p>
                <p className="text-green-300 text-sm">{success}</p>
              </div>
            </div>
          </Card>
        )}

        <Card className="mb-6">
          <div className="flex space-x-1 bg-surface-input rounded-lg p-1">
            <button
              onClick={() => setActiveTab("friends")}
              className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                activeTab === "friends" 
                  ? "bg-brand-primary text-white shadow-sm" 
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
              }`}
            >
              Friends ({friends.length})
            </button>
            <button
              onClick={() => setActiveTab("received")}
              className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                activeTab === "received" 
                  ? "bg-brand-primary text-white shadow-sm" 
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
              }`}
            >
              Requests ({receivedRequests.length})
            </button>
            <button
              onClick={() => setActiveTab("sent")}
              className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all duration-200 ${
                activeTab === "sent" 
                  ? "bg-brand-primary text-white shadow-sm" 
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
              }`}
            >
              Sent ({sentRequests.length})
            </button>
          </div>
        </Card>

        {activeTab === "friends" && (
          <div className="space-y-4">
            {friends.length === 0 ? (
              <Card className="text-center py-12">
                <div className="space-y-4">
                  <div className="text-6xl">👥</div>
                  <div>
                    <h3 className="text-xl font-semibold text-text-primary mb-2">No friends yet</h3>
                    <p className="text-text-secondary mb-4">Start building your poker network!</p>
                    <Button onClick={() => setShowAddFriendModal(true)} variant="primary">
                      Add Your First Friend
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              friends.map((friendship) => (
                <Card key={friendship.id}>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-brand-primary rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm">
                        {friendship.friend_profile?.full_name?.charAt(0) ||
                          friendship.friend_profile?.email?.charAt(0).toUpperCase() ||
                          "?"}
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-semibold text-text-primary text-lg">
                          {friendship.friend_profile?.full_name || "Unknown User"}
                        </h3>
                        <p className="text-text-secondary">{friendship.friend_profile?.email}</p>
                        <div className="flex flex-wrap gap-x-4 text-sm">
                          <span className="text-text-secondary">
                            P/L:{" "}
                            <span
                              className={
                                (friendship.friend_profile?.all_time_profit_loss || 0) >= 0
                                  ? "text-green-400 font-medium"
                                  : "text-red-400 font-medium"
                              }
                            >
                              {formatCurrency(friendship.friend_profile?.all_time_profit_loss || 0)}
                            </span>
                          </span>
                          <span className="text-text-secondary">
                            Games: <span className="text-text-primary font-medium">{friendship.friend_profile?.games_played || 0}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button onClick={() => handleRemoveFriend(friendship.friend_id)} variant="danger" size="sm">
                      Remove
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {activeTab === "received" && (
          <div className="space-y-4">
            {receivedRequests.length === 0 ? (
              <Card className="text-center py-12">
                <div className="space-y-4">
                  <div className="text-6xl">📬</div>
                  <div>
                    <h3 className="text-xl font-semibold text-text-primary mb-2">No pending requests</h3>
                    <p className="text-text-secondary">You're all caught up!</p>
                  </div>
                </div>
              </Card>
            ) : (
              receivedRequests.map((request) => (
                <Card key={request.id}>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-brand-primary rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm">
                        {request.sender_profile?.full_name?.charAt(0) ||
                          request.sender_profile?.email?.charAt(0).toUpperCase() ||
                          "?"}
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-semibold text-text-primary text-lg">
                          {request.sender_profile?.full_name || "Unknown User"}
                        </h3>
                        <p className="text-text-secondary">{request.sender_profile?.email}</p>
                        <p className="text-sm text-text-secondary">Sent {formatDate(request.created_at, false)}</p>
                      </div>
                    </div>
                    <div className="flex space-x-3">
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
              <Card className="text-center py-12">
                <div className="space-y-4">
                  <div className="text-6xl">📤</div>
                  <div>
                    <h3 className="text-xl font-semibold text-text-primary mb-2">No pending sent requests</h3>
                    <p className="text-text-secondary">All your friend requests have been responded to!</p>
                  </div>
                </div>
              </Card>
            ) : (
              sentRequests.map((request) => (
                <Card key={request.id}>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gray-500 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm">
                        {request.receiver_profile?.full_name?.charAt(0) ||
                          request.receiver_profile?.email?.charAt(0).toUpperCase() ||
                          "?"}
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-semibold text-text-primary text-lg">
                          {request.receiver_profile?.full_name || "Unknown User"}
                        </h3>
                        <p className="text-text-secondary">{request.receiver_profile?.email}</p>
                        <p className="text-sm text-text-secondary">Sent {formatDate(request.created_at, false)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                        Pending
                      </span>
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
          <form onSubmit={handleSendFriendRequest} className="space-y-6">
            <div>
              <Input
                label="Friend's Email"
                id="friendEmail"
                type="email"
                value={friendEmail}
                onChange={(e) => setFriendEmail(e.target.value)}
                placeholder="Enter their email address"
                required
              />
              <p className="mt-2 text-sm text-text-secondary">
                Enter the email address of the person you'd like to add as a friend.
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <Button type="button" onClick={() => setShowAddFriendModal(false)} variant="ghost">
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={addFriendLoading || !friendEmail.trim()} loading={addFriendLoading}>
                Send Request
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </div>
  )
}

export default FriendsPage
