"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"
import type { FriendRequest, Friendship } from "../types"
import { formatCurrency, formatDate } from "../utils"
import { createCleanupManager, createSafeAsyncOperation } from "../utils/cleanup"
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
  const [cleanupManager] = useState(() => createCleanupManager())

  const loadFriendsData = useCallback(async () => {
    if (!user) {
      console.log("[v0] No user found, skipping friends data load")
      setLoading(false)
      return
    }

    try {
      await createSafeAsyncOperation(async () => {
        setLoading(true)
        setError("")
        console.log("[v0] Loading friends data for user:", user.id)

        let friendsWithProfiles: Friendship[] = []
        let sentWithProfiles: FriendRequest[] = []
        let receivedWithProfiles: FriendRequest[] = []

        try {
          console.log("[v0] Fetching friendships...")
          const { data: friendsData, error: friendsError } = await supabase
            .from("friendships")
            .select("*")
            .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)

          console.log("[v0] Friendships query result:", { friendsData, friendsError })

          if (friendsError) {
            console.error("[v0] Error loading friends:", friendsError)
          } else if (friendsData && friendsData.length > 0) {
            console.log("[v0] Found", friendsData.length, "friendships")
            const friendIds = friendsData.map((f) => (f.user_id === user.id ? f.friend_id : f.user_id))
            console.log("[v0] Fetching profiles for friend IDs:", friendIds)

            const { data: profilesData, error: profilesError } = await supabase
              .from("profiles")
              .select("id, full_name, email, all_time_profit_loss, games_played")
              .in("id", friendIds)

            console.log("[v0] Profiles query result:", { profilesData, profilesError })

            if (!profilesError && profilesData) {
              friendsWithProfiles = friendsData.map((friendship) => {
                const friendId = friendship.user_id === user.id ? friendship.friend_id : friendship.user_id
                return {
                  ...friendship,
                  friend_id: friendId,
                  friend_profile: profilesData.find((p) => p.id === friendId),
                }
              })
              console.log("[v0] Mapped friends with profiles:", friendsWithProfiles)
            }
          } else {
            console.log("[v0] No friendships found for user")
          }
        } catch (err) {
          console.error("[v0] Error in friends loading:", err)
        }

        try {
          console.log("[v0] Fetching sent requests...")
          const { data: sentData, error: sentError } = await supabase
            .from("friend_requests")
            .select("*")
            .eq("sender_id", user.id)
            .eq("status", "pending")

          console.log("[v0] Sent requests query result:", { sentData, sentError })

          if (!sentError && sentData && sentData.length > 0) {
            console.log("[v0] Found", sentData.length, "sent requests")
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
              console.log("[v0] Mapped sent requests with profiles:", sentWithProfiles)
            }
          } else {
            console.log("[v0] No sent requests found")
          }
        } catch (err) {
          console.error("[v0] Error in sent requests loading:", err)
        }

        try {
          console.log("[v0] Fetching received requests...")
          const { data: receivedData, error: receivedError } = await supabase
            .from("friend_requests")
            .select("*")
            .eq("receiver_id", user.id)
            .eq("status", "pending")

          console.log("[v0] Received requests query result:", { receivedData, receivedError })

          if (!receivedError && receivedData && receivedData.length > 0) {
            console.log("[v0] Found", receivedData.length, "received requests")
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
              console.log("[v0] Mapped received requests with profiles:", receivedWithProfiles)
            }
          } else {
            console.log("[v0] No received requests found")
          }
        } catch (err) {
          console.error("[v0] Error in received requests loading:", err)
        }

        console.log(
          "[v0] Final data counts - Friends:",
          friendsWithProfiles.length,
          "Sent:",
          sentWithProfiles.length,
          "Received:",
          receivedWithProfiles.length,
        )
        setFriends(friendsWithProfiles)
        setSentRequests(sentWithProfiles)
        setReceivedRequests(receivedWithProfiles)

        console.log("[v0] Friends data loaded successfully")
      }, cleanupManager)
    } catch (error) {
      if (cleanupManager.isActive()) {
        console.error("[v0] Error in loadFriendsData:", error)
        setError("Failed to load friends data. Please try refreshing the page.")
      }
    } finally {
      if (cleanupManager.isActive()) {
        setLoading(false)
      }
    }
  }, [user, cleanupManager])

  useEffect(() => {
    let mounted = true

    const loadData = async () => {
      if (user && mounted && cleanupManager.isActive()) {
        await loadFriendsData()
      }
    }

    loadData()

    const unregister = cleanupManager.register(() => {
      mounted = false
      console.log("[v0] FriendsPage cleanup executed")
    })

    return () => {
      mounted = false
      unregister()
    }
  }, [user, loadFriendsData, cleanupManager])

  useEffect(() => {
    return () => {
      cleanupManager.cleanup()
    }
  }, [cleanupManager])

  const handleSendFriendRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !friendEmail.trim()) return

    setAddFriendLoading(true)
    setError("")
    setSuccess("")

    try {
      console.log("[v0] Starting friend request process...")
      console.log("[v0] Current user:", { id: user.id, email: user.email })
      console.log("[v0] Searching for email:", friendEmail.trim())

      const searchEmail = friendEmail.trim().toLowerCase()
      console.log("[v0] Normalized search email:", searchEmail)

      const { data: targetUsers, error: userError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .ilike("email", searchEmail)
        .limit(5)

      console.log("[v0] User search result:", {
        targetUsers,
        userError,
        searchEmail,
        resultCount: targetUsers?.length || 0,
      })

      if (userError) {
        console.error("[v0] Database error during user search:", userError)
        if (userError.code === "PGRST301") {
          setError("Database access denied. Please ensure you're logged in and try again.")
        } else if (userError.code === "PGRST116") {
          setError("Database query error. Please try again or contact support.")
        } else {
          setError(`Search failed: ${userError.message}`)
        }
        return
      }

      if (!targetUsers || targetUsers.length === 0) {
        console.log("[v0] No users found with email:", searchEmail)
        setError(
          `No user found with email "${friendEmail}". Please check the email address and ensure they have an account.`,
        )
        return
      }

      const exactMatch = targetUsers.find((u) => u.email.toLowerCase() === searchEmail)
      if (!exactMatch) {
        const suggestions = targetUsers
          .slice(0, 3)
          .map((u) => u.email)
          .join(", ")
        setError(`No exact match found for "${friendEmail}". Did you mean: ${suggestions}?`)
        return
      }

      const targetUser = exactMatch
      console.log("[v0] Found target user:", targetUser)

      if (targetUser.id === user.id) {
        setError("You cannot send a friend request to yourself")
        return
      }

      const { data: existingFriendship, error: friendshipError } = await supabase
        .from("friendships")
        .select("id")
        .or(
          `and(user_id.eq.${user.id},friend_id.eq.${targetUser.id}),and(user_id.eq.${targetUser.id},friend_id.eq.${user.id})`,
        )
        .maybeSingle()

      if (friendshipError) {
        console.error("[v0] Error checking existing friendship:", friendshipError)
        setError("Failed to check friendship status. Please try again.")
        return
      }

      if (existingFriendship) {
        setError(`You are already friends with ${targetUser.full_name || targetUser.email}`)
        return
      }

      const { data: existingRequest, error: requestCheckError } = await supabase
        .from("friend_requests")
        .select("id, status, sender_id, receiver_id")
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${targetUser.id}),and(sender_id.eq.${targetUser.id},receiver_id.eq.${user.id})`,
        )
        .eq("status", "pending")
        .maybeSingle()

      if (requestCheckError) {
        console.error("[v0] Error checking existing request:", requestCheckError)
        setError("Failed to check request status. Please try again.")
        return
      }

      if (existingRequest) {
        if (existingRequest.sender_id === user.id) {
          setError(`You already sent a friend request to ${targetUser.full_name || targetUser.email}`)
        } else {
          setError(
            `${targetUser.full_name || targetUser.email} has already sent you a friend request. Check your received requests.`,
          )
        }
        return
      }

      console.log("[v0] Sending friend request...")
      const { error: requestError } = await supabase.from("friend_requests").insert({
        sender_id: user.id,
        receiver_id: targetUser.id,
        status: "pending",
      })

      if (requestError) {
        console.error("[v0] Error inserting friend request:", requestError)
        if (requestError.code === "23505") {
          setError("A friend request is already pending with this user")
        } else {
          setError(`Failed to send friend request: ${requestError.message}`)
        }
        return
      }

      console.log("[v0] Friend request sent successfully")
      setSuccess(`Friend request sent to ${targetUser.full_name || targetUser.email}!`)
      setFriendEmail("")
      setShowAddFriendModal(false)
      loadFriendsData()
    } catch (error: any) {
      console.error("[v0] Unexpected error sending friend request:", error)
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setAddFriendLoading(false)
    }
  }

  const handleAcceptRequest = async (requestId: string) => {
    try {
      setError("")
      console.log("[v0] Attempting to accept friend request:", requestId)

      console.log("[v0] Current user ID:", user?.id)
      console.log("[v0] Request ID to accept:", requestId)

      const { data: requestDetails, error: requestCheckError } = await supabase
        .from("friend_requests")
        .select("*")
        .eq("id", requestId)
        .eq("receiver_id", user?.id)
        .eq("status", "pending")
        .single()

      console.log("[v0] Request details before acceptance:", { requestDetails, requestCheckError })

      if (requestCheckError || !requestDetails) {
        console.error("[v0] Request not found or not accessible:", requestCheckError)
        setError("Friend request not found or you don't have permission to accept it.")
        return
      }

      const { data, error } = await supabase.rpc("accept_friend_request", {
        request_id: requestId,
      })

      console.log("[v0] Accept friend request RPC result:", { data, error })

      if (error) {
        console.error("[v0] RPC error accepting friend request:", error)
        if (error.code === "42883") {
          setError("Friend request function not available. Please contact support.")
        } else if (error.message.includes("permission denied")) {
          setError("You don't have permission to accept this request.")
        } else {
          setError(`Failed to accept friend request: ${error.message}`)
        }
        return
      }

      console.log("[v0] Verifying request was accepted...")

      const { data: updatedRequest, error: verifyError } = await supabase
        .from("friend_requests")
        .select("status")
        .eq("id", requestId)
        .single()

      console.log("[v0] Request status after acceptance:", { updatedRequest, verifyError })

      const { data: newFriendship, error: friendshipError } = await supabase
        .from("friendships")
        .select("*")
        .or(
          `and(user_id.eq.${user?.id},friend_id.eq.${requestDetails.sender_id}),and(user_id.eq.${requestDetails.sender_id},friend_id.eq.${user?.id})`,
        )
        .maybeSingle()

      console.log("[v0] Friendship created:", { newFriendship, friendshipError })

      if (!updatedRequest || updatedRequest.status !== "accepted") {
        console.error("[v0] Request status was not updated to accepted")
        setError("Failed to update request status. Please try again.")
        return
      }

      if (!newFriendship) {
        console.error("[v0] Friendship was not created")
        setError("Request was accepted but friendship was not created. Please contact support.")
        return
      }

      if (data && typeof data === "object" && !data.success) {
        console.error("[v0] Function returned error:", data.error)
        setError(data.error || "Failed to accept friend request")
        return
      }

      console.log("[v0] Friend request accepted successfully")
      setSuccess("Friend request accepted! You are now friends.")

      setTimeout(() => {
        loadFriendsData()
      }, 500)
    } catch (error: any) {
      console.error("[v0] Unexpected error accepting request:", error)
      setError("An unexpected error occurred. Please try again.")
    }
  }

  const handleDeclineRequest = async (requestId: string) => {
    try {
      setError("")
      console.log("[v0] Declining friend request:", requestId)

      const { error } = await supabase
        .from("friend_requests")
        .update({ status: "declined", updated_at: new Date().toISOString() })
        .eq("id", requestId)

      if (error) {
        throw error
      }

      console.log("[v0] Friend request declined successfully")
      setSuccess("Friend request declined")
      loadFriendsData()
    } catch (error: any) {
      console.error("Error cancelling request:", error)
      setError("Failed to decline friend request")
    }
  }

  const handleRemoveFriend = async (friendId: string) => {
    if (!confirm("Are you sure you want to remove this friend?")) return

    try {
      setError("")
      console.log("[v0] Removing friend:", friendId)

      const { data, error } = await supabase.rpc("remove_friendship", {
        friend_user_id: friendId,
      })

      console.log("[v0] Remove friendship result:", { data, error })

      if (error) {
        throw error
      }

      if (data && typeof data === "object" && !data.success) {
        console.error("[v0] Function returned error:", data.error)
        setError(data.error || "Failed to remove friend")
        return
      }

      console.log("[v0] Friend removed successfully")
      setSuccess("Friend removed successfully")
      loadFriendsData()
    } catch (error: any) {
      console.error("[v0] Unexpected error removing friend:", error)
      setError("Failed to remove friend. Please try again.")
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
    if (cleanupManager.isActive()) {
      loadFriendsData()
    }
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
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-text-primary">Friends</h1>
          <Button onClick={() => setShowAddFriendModal(true)} variant="primary" className="flex items-center space-x-2">
            <span>+</span>
            <span>Add Friend</span>
          </Button>
        </div>

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
