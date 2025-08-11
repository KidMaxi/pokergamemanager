"use client"

import { useState } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { supabase } from "../../lib/supabase"
import Button from "../common/Button"
import Card from "../common/Card"

interface DiagnosticResult {
  userProfile: any
  friendships: any[]
  friendRequests: any[]
  sentRequests: any[]
  summary: {
    totalFriendships: number
    totalFriendRequests: number
    totalSentRequests: number
  }
}

export default function FriendsDiagnostic() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<DiagnosticResult | null>(null)
  const [error, setError] = useState("")

  const runDiagnostic = async () => {
    if (!user) return

    setLoading(true)
    setError("")
    setResults(null)

    try {
      console.log("🔍 Running friends diagnostic for user:", user.id, user.email)

      // Get user profile
      const { data: userProfile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()

      if (profileError) {
        console.error("Profile error:", profileError)
      }

      // Get friendships where user is the requester
      const { data: friendshipsAsRequester, error: friendshipsError1 } = await supabase
        .from("friendships")
        .select(`
          *,
          friend_profile:profiles!friendships_friend_id_fkey(id, full_name, email)
        `)
        .eq("user_id", user.id)

      if (friendshipsError1) {
        console.error("Friendships error 1:", friendshipsError1)
      }

      // Get friendships where user is the friend
      const { data: friendshipsAsFriend, error: friendshipsError2 } = await supabase
        .from("friendships")
        .select(`
          *,
          requester_profile:profiles!friendships_user_id_fkey(id, full_name, email)
        `)
        .eq("friend_id", user.id)

      if (friendshipsError2) {
        console.error("Friendships error 2:", friendshipsError2)
      }

      // Combine all friendships
      const allFriendships = [
        ...(friendshipsAsRequester || []).map((f) => ({ ...f, role: "requester" })),
        ...(friendshipsAsFriend || []).map((f) => ({ ...f, role: "friend" })),
      ]

      // Get friend requests received
      const { data: friendRequests, error: requestsError1 } = await supabase
        .from("friend_requests")
        .select(`
          *,
          sender_profile:profiles!friend_requests_sender_id_fkey(id, full_name, email)
        `)
        .eq("receiver_id", user.id)

      if (requestsError1) {
        console.error("Friend requests error 1:", requestsError1)
      }

      // Get friend requests sent
      const { data: sentRequests, error: requestsError2 } = await supabase
        .from("friend_requests")
        .select(`
          *,
          receiver_profile:profiles!friend_requests_receiver_id_fkey(id, full_name, email)
        `)
        .eq("sender_id", user.id)

      if (requestsError2) {
        console.error("Friend requests error 2:", requestsError2)
      }

      const diagnosticResults: DiagnosticResult = {
        userProfile,
        friendships: allFriendships,
        friendRequests: friendRequests || [],
        sentRequests: sentRequests || [],
        summary: {
          totalFriendships: allFriendships.length,
          totalFriendRequests: (friendRequests || []).length,
          totalSentRequests: (sentRequests || []).length,
        },
      }

      console.log("📊 Diagnostic results:", diagnosticResults)
      setResults(diagnosticResults)
    } catch (error) {
      console.error("Diagnostic error:", error)
      setError("Failed to run diagnostic")
    } finally {
      setLoading(false)
    }
  }

  const createTestFriendship = async () => {
    if (!user) return

    try {
      // Create a test friendship with yourself (for testing purposes)
      const { error } = await supabase.from("friendships").insert({
        user_id: user.id,
        friend_id: user.id, // This is just for testing
        created_at: new Date().toISOString(),
      })

      if (error) {
        console.error("Test friendship error:", error)
        setError("Failed to create test friendship: " + error.message)
      } else {
        console.log("✅ Test friendship created")
        runDiagnostic() // Refresh results
      }
    } catch (error) {
      console.error("Test friendship error:", error)
      setError("Failed to create test friendship")
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Card>
        <div className="p-6">
          <h2 className="text-2xl font-bold text-white mb-4">Friends System Diagnostic</h2>

          <div className="flex gap-4 mb-6">
            <Button onClick={runDiagnostic} disabled={loading} variant="primary">
              {loading ? "Running..." : "Run Diagnostic"}
            </Button>

            <Button onClick={createTestFriendship} variant="ghost" className="text-yellow-400">
              Create Test Data
            </Button>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-600 rounded p-3 mb-4">
              <p className="text-red-400">{error}</p>
            </div>
          )}

          {results && (
            <div className="space-y-6">
              {/* User Profile */}
              <div>
                <h3 className="text-xl font-semibold text-white mb-3">User Profile</h3>
                <div className="bg-slate-700 p-4 rounded">
                  <p className="text-white">ID: {results.userProfile?.id}</p>
                  <p className="text-white">Email: {results.userProfile?.email}</p>
                  <p className="text-white">Name: {results.userProfile?.full_name || "Not set"}</p>
                  <p className="text-white">Created: {results.userProfile?.created_at}</p>
                </div>
              </div>

              {/* Summary */}
              <div>
                <h3 className="text-xl font-semibold text-white mb-3">Summary</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-700 p-4 rounded text-center">
                    <p className="text-2xl font-bold text-green-400">{results.summary.totalFriendships}</p>
                    <p className="text-gray-300">Friendships</p>
                  </div>
                  <div className="bg-slate-700 p-4 rounded text-center">
                    <p className="text-2xl font-bold text-blue-400">{results.summary.totalFriendRequests}</p>
                    <p className="text-gray-300">Received Requests</p>
                  </div>
                  <div className="bg-slate-700 p-4 rounded text-center">
                    <p className="text-2xl font-bold text-yellow-400">{results.summary.totalSentRequests}</p>
                    <p className="text-gray-300">Sent Requests</p>
                  </div>
                </div>
              </div>

              {/* Friendships */}
              <div>
                <h3 className="text-xl font-semibold text-white mb-3">Friendships ({results.friendships.length})</h3>
                {results.friendships.length === 0 ? (
                  <div className="bg-slate-700 p-4 rounded">
                    <p className="text-gray-400">No friendships found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {results.friendships.map((friendship, index) => (
                      <div key={index} className="bg-slate-700 p-4 rounded">
                        <p className="text-white">ID: {friendship.id}</p>
                        <p className="text-white">Role: {friendship.role}</p>
                        <p className="text-white">User ID: {friendship.user_id}</p>
                        <p className="text-white">Friend ID: {friendship.friend_id}</p>
                        <p className="text-white">Created: {friendship.created_at}</p>
                        {friendship.friend_profile && (
                          <p className="text-green-400">
                            Friend: {friendship.friend_profile.full_name} ({friendship.friend_profile.email})
                          </p>
                        )}
                        {friendship.requester_profile && (
                          <p className="text-green-400">
                            Requester: {friendship.requester_profile.full_name} ({friendship.requester_profile.email})
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Friend Requests */}
              <div>
                <h3 className="text-xl font-semibold text-white mb-3">
                  Received Friend Requests ({results.friendRequests.length})
                </h3>
                {results.friendRequests.length === 0 ? (
                  <div className="bg-slate-700 p-4 rounded">
                    <p className="text-gray-400">No friend requests received</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {results.friendRequests.map((request, index) => (
                      <div key={index} className="bg-slate-700 p-4 rounded">
                        <p className="text-white">ID: {request.id}</p>
                        <p className="text-white">From: {request.sender_id}</p>
                        <p className="text-white">Status: {request.status}</p>
                        <p className="text-white">Created: {request.created_at}</p>
                        {request.sender_profile && (
                          <p className="text-blue-400">
                            Sender: {request.sender_profile.full_name} ({request.sender_profile.email})
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sent Requests */}
              <div>
                <h3 className="text-xl font-semibold text-white mb-3">
                  Sent Friend Requests ({results.sentRequests.length})
                </h3>
                {results.sentRequests.length === 0 ? (
                  <div className="bg-slate-700 p-4 rounded">
                    <p className="text-gray-400">No friend requests sent</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {results.sentRequests.map((request, index) => (
                      <div key={index} className="bg-slate-700 p-4 rounded">
                        <p className="text-white">ID: {request.id}</p>
                        <p className="text-white">To: {request.receiver_id}</p>
                        <p className="text-white">Status: {request.status}</p>
                        <p className="text-white">Created: {request.created_at}</p>
                        {request.receiver_profile && (
                          <p className="text-yellow-400">
                            Receiver: {request.receiver_profile.full_name} ({request.receiver_profile.email})
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
