"use client"

import type React from "react"
import { useState, useEffect, useCallback } from "react"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"
import Button from "./common/Button"
import Card from "./common/Card"
import Input from "./common/Input"
import Modal from "./common/Modal"

interface Friend {
  id: string
  user_id: string
  friend_id: string
  friend_profile: {
    id: string
    full_name: string
    email: string
  }
  created_at: string
}

interface FriendRequest {
  id: string
  sender_id: string
  receiver_id: string
  status: "pending" | "accepted" | "rejected"
  sender_profile?: {
    id: string
    full_name: string
    email: string
  }
  receiver_profile?: {
    id: string
    full_name: string
    email: string
  }
  created_at: string
}

interface UserProfile {
  id: string
  full_name: string
  email: string
}

type TabType = "friends" | "sent" | "received"

const FriendsPage: React.FC = () => {
  const { user } = useAuth()
  const [friends, setFriends] = useState<Friend[]>([])
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([])
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddFriendModal, setShowAddFriendModal] = useState(false)
  const [searchEmail, setSearchEmail] = useState("")
  const [searchResults, setSearchResults] = useState<UserProfile[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [activeTab, setActiveTab] = useState<TabType>("friends")

  const loadFriendsData = useCallback(async () => {
    if (!user) return

    setLoading(true)
    try {
      console.log("🔍 Loading friends data for user:", user.id)

      // Try to use the database function first
      try {
        const { data: friendsData, error: friendsError } = await supabase.rpc("get_user_friends", {
          user_id: user.id,
        })

        if (!friendsError && friendsData) {
          // Transform the data to match our Friend interface
          const transformedFriends: Friend[] = friendsData
            .filter((friend: any) => friend.friend_id !== user.id) // Exclude self-friendships
            .map((friend: any) => ({
              id: `${user.id}-${friend.friend_id}`,
              user_id: user.id,
              friend_id: friend.friend_id,
              friend_profile: {
                id: friend.friend_id,
                full_name: friend.friend_name || "",
                email: friend.friend_email || "",
              },
              created_at: friend.friendship_created_at,
            }))
          setFriends(transformedFriends)
          console.log("✅ Loaded friends using database function:", transformedFriends.length)
        } else {
          throw new Error("Database function not available")
        }
      } catch (functionError) {
        console.log("Database function not available, using direct queries")

        // Fallback: Load friends directly with bidirectional query
        const { data: friendsData, error: friendsError } = await supabase
          .from("friendships")
          .select(`
            id,
            user_id,
            friend_id,
            created_at,
            user_profile:profiles!friendships_user_id_fkey (
              id,
              full_name,
              email
            ),
            friend_profile:profiles!friendships_friend_id_fkey (
              id,
              full_name,
              email
            )
          `)
          .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)

        if (friendsError) {
          console.error("❌ Error loading friends:", friendsError)
          throw friendsError
        }

        // Transform bidirectional friendships and filter out self-friendships
        const friendsMap = new Map<string, Friend>()
        ;(friendsData || []).forEach((friendship: any) => {
          const isUserInitiator = friendship.user_id === user.id
          const friendId = isUserInitiator ? friendship.friend_id : friendship.user_id

          // Skip if this is somehow a self-friendship
          if (friendId === user.id) return

          // Select the correct profile based on which side of the relationship the current user is on
          const friendProfile = isUserInitiator ? friendship.friend_profile : friendship.user_profile

          // Only add if we haven't seen this friend before
          if (!friendsMap.has(friendId)) {
            friendsMap.set(friendId, {
              id: friendship.id,
              user_id: user.id,
              friend_id: friendId,
              friend_profile: friendProfile || {
                id: friendId,
                full_name: "Unknown User",
                email: "",
              },
              created_at: friendship.created_at,
            })
          }
        })

        const transformedFriends = Array.from(friendsMap.values())
        setFriends(transformedFriends)
        console.log("✅ Loaded friends using direct query:", transformedFriends.length)
      }

      // Load friend requests (received)
      const { data: requestsData, error: requestsError } = await supabase
        .from("friend_requests")
        .select(`
          id,
          sender_id,
          receiver_id,
          status,
          created_at,
          sender_profile:profiles!friend_requests_sender_id_fkey (
            id,
            full_name,
            email
          )
        `)
        .eq("receiver_id", user.id)
        .eq("status", "pending")

      if (requestsError) {
        console.error("❌ Error loading friend requests:", requestsError)
        throw requestsError
      }

      setFriendRequests(requestsData || [])
      console.log("✅ Loaded friend requests:", (requestsData || []).length)

      // Load sent requests
      const { data: sentData, error: sentError } = await supabase
        .from("friend_requests")
        .select(`
          id,
          sender_id,
          receiver_id,
          status,
          created_at,
          receiver_profile:profiles!friend_requests_receiver_id_fkey (
            id,
            full_name,
            email
          )
        `)
        .eq("sender_id", user.id)
        .eq("status", "pending")

      if (sentError) {
        console.error("❌ Error loading sent requests:", sentError)
        throw sentError
      }

      setSentRequests(sentData || [])
      console.log("✅ Loaded sent requests:", (sentData || []).length)
    } catch (error) {
      console.error("❌ Error in loadFriendsData:", error)
      setError("Failed to load friends data. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadFriendsData()
  }, [loadFriendsData])

  const getInitials = (fullName: string, email: string): string => {
    if (fullName && fullName.trim()) {
      const names = fullName.trim().split(" ")
      if (names.length >= 2) {
        return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase()
      }
      return names[0][0].toUpperCase()
    }
    if (email) {
      return email[0].toUpperCase()
    }
    return "?"
  }

  const searchUsers = async () => {
    if (!searchEmail.trim()) return

    setSearchLoading(true)
    setError("")
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .or(`email.ilike.%${searchEmail}%,full_name.ilike.%${searchEmail}%`)
        .neq("id", user?.id)
        .limit(10)

      if (error) throw error

      // Filter out users who are already friends or have pending requests
      const existingFriendIds = new Set(friends.map((f) => f.friend_id))
      const pendingRequestIds = new Set([
        ...friendRequests.map((r) => r.sender_id),
        ...sentRequests.map((r) => r.receiver_id),
      ])

      const filteredResults = (data || []).filter(
        (user) => !existingFriendIds.has(user.id) && !pendingRequestIds.has(user.id),
      )

      setSearchResults(filteredResults)
    } catch (error) {
      console.error("Error searching users:", error)
      setError("Failed to search users. Please try again.")
    } finally {
      setSearchLoading(false)
    }
  }

  const sendFriendRequest = async (receiverId: string) => {
    if (!user) return

    setActionLoading((prev) => ({ ...prev, [receiverId]: true }))
    setError("")
    try {
      const { error } = await supabase.from("friend_requests").insert({
        sender_id: user.id,
        receiver_id: receiverId,
        status: "pending",
      })

      if (error) throw error

      setSuccess("Friend request sent successfully!")
      setSearchResults((prev) => prev.filter((u) => u.id !== receiverId))

      // Refresh data to update sent requests
      await loadFriendsData()
    } catch (error) {
      console.error("Error sending friend request:", error)
      setError("Failed to send friend request. Please try again.")
    } finally {
      setActionLoading((prev) => ({ ...prev, [receiverId]: false }))
    }
  }

  const acceptFriendRequest = async (requestId: string, senderId: string) => {
    if (!user) return

    setActionLoading((prev) => ({ ...prev, [requestId]: true }))
    setError("")
    try {
      // Update request status
      const { error: updateError } = await supabase
        .from("friend_requests")
        .update({ status: "accepted" })
        .eq("id", requestId)

      if (updateError) throw updateError

      // Create bidirectional friendship
      const { error: friendshipError } = await supabase.from("friendships").insert([
        { user_id: user.id, friend_id: senderId },
        { user_id: senderId, friend_id: user.id },
      ])

      if (friendshipError) throw friendshipError

      setSuccess("Friend request accepted!")

      // Refresh data
      await loadFriendsData()
    } catch (error) {
      console.error("Error accepting friend request:", error)
      setError("Failed to accept friend request. Please try again.")
    } finally {
      setActionLoading((prev) => ({ ...prev, [requestId]: false }))
    }
  }

  const rejectFriendRequest = async (requestId: string) => {
    setActionLoading((prev) => ({ ...prev, [requestId]: true }))
    setError("")
    try {
      const { error } = await supabase.from("friend_requests").update({ status: "rejected" }).eq("id", requestId)

      if (error) throw error

      setSuccess("Friend request rejected.")

      // Refresh data
      await loadFriendsData()
    } catch (error) {
      console.error("Error rejecting friend request:", error)
      setError("Failed to reject friend request. Please try again.")
    } finally {
      setActionLoading((prev) => ({ ...prev, [requestId]: false }))
    }
  }

  const removeFriend = async (friendId: string) => {
    if (!user) return

    setError("")
    try {
      // Remove both directions of the friendship
      const { error } = await supabase
        .from("friendships")
        .delete()
        .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`)

      if (error) throw error

      setSuccess("Friend removed successfully.")

      // Refresh data
      await loadFriendsData()
    } catch (error) {
      console.error("Error removing friend:", error)
      setError("Failed to remove friend. Please try again.")
    }
  }

  if (loading) {
    return (
      <div
        className="min-h-screen bg-gradient-to-br from-slate-900 via-green-900 to-slate-900 bg-cover bg-center bg-no-repeat flex items-center justify-center"
        style={{ backgroundImage: "url('/images/poker-chips-background.jpg')" }}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-white text-center">Loading friends...</p>
        </div>
      </div>
    )
  }

  const renderFriendsTab = () => (
    <Card>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-white">My Friends ({friends.length})</h2>
        <Button
          onClick={() => {
            setShowAddFriendModal(true)
            setSearchEmail("")
            setSearchResults([])
            setError("")
            setSuccess("")
          }}
          variant="primary"
          size="sm"
        >
          Add Friend
        </Button>
      </div>

      {friends.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
              />
            </svg>
          </div>
          <p className="text-gray-400 mb-4 text-lg">You haven't added any friends yet.</p>
          <p className="text-gray-500 mb-6">Connect with other players to start building your poker network!</p>
          <Button onClick={() => setShowAddFriendModal(true)} variant="primary">
            Add Your First Friend
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {friends.map((friend) => (
            <div
              key={friend.id}
              className="bg-slate-700/50 backdrop-blur-sm p-4 rounded-lg border border-slate-600 hover:border-green-500/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg">
                    {getInitials(friend.friend_profile.full_name, friend.friend_profile.email)}
                  </div>
                  <div>
                    <p className="text-white font-medium">{friend.friend_profile.full_name}</p>
                    <p className="text-gray-400 text-sm">{friend.friend_profile.email}</p>
                    <p className="text-gray-500 text-xs">
                      Friends since {new Date(friend.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => removeFriend(friend.friend_id)}
                  variant="ghost"
                  size="sm"
                  disabled={actionLoading[friend.friend_id]}
                  className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                >
                  {actionLoading[friend.friend_id] ? "..." : "Remove"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )

  const renderSentRequestsTab = () => (
    <Card>
      <h2 className="text-xl font-semibold text-white mb-6">Sent Requests ({sentRequests.length})</h2>

      {sentRequests.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </div>
          <p className="text-gray-400 mb-4 text-lg">No pending friend requests sent.</p>
          <p className="text-gray-500">Friend requests you send will appear here while they're pending.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sentRequests.map((request) => (
            <div
              key={request.id}
              className="flex items-center justify-between bg-slate-700/50 backdrop-blur-sm p-4 rounded-lg border border-slate-600"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-full flex items-center justify-center text-white font-bold">
                  {getInitials(request.receiver_profile?.full_name || "", request.receiver_profile?.email || "")}
                </div>
                <div>
                  <p className="text-white font-medium">{request.receiver_profile?.full_name || "Unknown User"}</p>
                  <p className="text-gray-400 text-sm">{request.receiver_profile?.email}</p>
                  <p className="text-gray-500 text-xs">Sent {new Date(request.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                <span className="text-yellow-400 text-sm font-medium">Pending</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )

  const renderReceivedRequestsTab = () => (
    <Card>
      <h2 className="text-xl font-semibold text-white mb-6">Received Requests ({friendRequests.length})</h2>

      {friendRequests.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 00-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
          </div>
          <p className="text-gray-400 mb-4 text-lg">No pending friend requests.</p>
          <p className="text-gray-500">Friend requests from other players will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {friendRequests.map((request) => (
            <div
              key={request.id}
              className="flex items-center justify-between bg-slate-700/50 backdrop-blur-sm p-4 rounded-lg border border-slate-600 hover:border-blue-500/50 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                  {getInitials(request.sender_profile?.full_name || "", request.sender_profile?.email || "")}
                </div>
                <div>
                  <p className="text-white font-medium">{request.sender_profile?.full_name || "Unknown User"}</p>
                  <p className="text-gray-400 text-sm">{request.sender_profile?.email}</p>
                  <p className="text-gray-500 text-xs">Received {new Date(request.created_at).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex space-x-2">
                <Button
                  onClick={() => acceptFriendRequest(request.id, request.sender_id)}
                  variant="primary"
                  size="sm"
                  disabled={actionLoading[request.id]}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {actionLoading[request.id] ? "..." : "Accept"}
                </Button>
                <Button
                  onClick={() => rejectFriendRequest(request.id)}
                  variant="ghost"
                  size="sm"
                  disabled={actionLoading[request.id]}
                  className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-900 via-green-900 to-slate-900 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/images/poker-chips-background.jpg')" }}
    >
      <div className="container mx-auto p-4 max-w-4xl">
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-green-400 mb-6">Friends</h1>

          {error && (
            <div className="bg-red-900/20 border border-red-600 rounded p-3 mb-4">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-900/20 border border-green-600 rounded p-3 mb-4">
              <p className="text-green-400">{success}</p>
            </div>
          )}

          {/* Tabbed navigation interface */}
          <div className="mb-6">
            <div className="flex space-x-1 bg-slate-700/50 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab("friends")}
                className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "friends"
                    ? "bg-green-600 text-white shadow-lg"
                    : "text-gray-300 hover:text-white hover:bg-slate-600/50"
                }`}
              >
                Friends ({friends.length})
              </button>
              <button
                onClick={() => setActiveTab("sent")}
                className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "sent"
                    ? "bg-green-600 text-white shadow-lg"
                    : "text-gray-300 hover:text-white hover:bg-slate-600/50"
                }`}
              >
                Sent Requests ({sentRequests.length})
              </button>
              <button
                onClick={() => setActiveTab("received")}
                className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors relative ${
                  activeTab === "received"
                    ? "bg-green-600 text-white shadow-lg"
                    : "text-gray-300 hover:text-white hover:bg-slate-600/50"
                }`}
              >
                Received Requests ({friendRequests.length})
                {friendRequests.length > 0 && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                )}
              </button>
            </div>
          </div>

          <div className="min-h-[400px]">
            {activeTab === "friends" && renderFriendsTab()}
            {activeTab === "sent" && renderSentRequestsTab()}
            {activeTab === "received" && renderReceivedRequestsTab()}
          </div>
        </div>

        {/* Add Friend Modal */}
        <Modal
          isOpen={showAddFriendModal}
          onClose={() => {
            setShowAddFriendModal(false)
            setSearchEmail("")
            setSearchResults([])
            setError("")
            setSuccess("")
          }}
          title="Add Friend"
        >
          <div className="space-y-4">
            <div className="flex space-x-2">
              <Input
                label="Search by email or name"
                id="searchEmail"
                type="text"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                placeholder="Enter email or name..."
                className="flex-1"
                onKeyPress={(e) => e.key === "Enter" && searchUsers()}
              />
              <Button
                onClick={searchUsers}
                variant="primary"
                disabled={searchLoading || !searchEmail.trim()}
                className="mt-6"
              >
                {searchLoading ? "..." : "Search"}
              </Button>
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                <h3 className="text-white font-medium">Search Results:</h3>
                {searchResults.map((user) => (
                  <div key={user.id} className="flex items-center justify-between bg-slate-700 p-3 rounded">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        {getInitials(user.full_name, user.email)}
                      </div>
                      <div>
                        <p className="text-white font-medium">{user.full_name}</p>
                        <p className="text-gray-400 text-sm">{user.email}</p>
                      </div>
                    </div>
                    <Button
                      onClick={() => sendFriendRequest(user.id)}
                      variant="primary"
                      size="sm"
                      disabled={actionLoading[user.id]}
                    >
                      {actionLoading[user.id] ? "..." : "Add Friend"}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {searchEmail && searchResults.length === 0 && !searchLoading && (
              <p className="text-gray-400 text-center py-4">No users found matching your search.</p>
            )}
          </div>
        </Modal>
      </div>
    </div>
  )
}

export default FriendsPage
