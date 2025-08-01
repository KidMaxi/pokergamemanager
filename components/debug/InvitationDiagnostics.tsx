"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../contexts/AuthContext"
import Card from "../common/Card"
import Button from "../common/Button"

interface DiagnosticInfo {
  invitations: any[]
  gameSessions: any[]
  profiles: any[]
  friendships: any[]
}

const InvitationDiagnostics: React.FC = () => {
  const { user } = useAuth()
  const [diagnostics, setDiagnostics] = useState<DiagnosticInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [testResult, setTestResult] = useState<string>("")

  const runDiagnostics = async () => {
    if (!user) return

    setLoading(true)
    try {
      console.log("🔍 Running invitation diagnostics for user:", user.id)

      // Get all invitations for this user
      const { data: invitations, error: invError } = await supabase
        .from("game_invitations")
        .select(`
          *,
          game_session:game_sessions(*),
          inviter_profile:profiles!game_invitations_inviter_id_fkey(*)
        `)
        .eq("invitee_id", user.id)
        .order("created_at", { ascending: false })

      // Get all game sessions where user is involved
      const { data: gameSessions, error: gameError } = await supabase
        .from("game_sessions")
        .select("*")
        .or(`user_id.eq.${user.id},invited_users.cs.{${user.id}}`)

      // Get user profile
      const { data: profiles, error: profileError } = await supabase.from("profiles").select("*").eq("id", user.id)

      // Get friendships
      const { data: friendships, error: friendError } = await supabase
        .from("friendships")
        .select("*")
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)

      setDiagnostics({
        invitations: invitations || [],
        gameSessions: gameSessions || [],
        profiles: profiles || [],
        friendships: friendships || [],
      })

      console.log("Diagnostics results:", {
        invitations: invitations?.length || 0,
        gameSessions: gameSessions?.length || 0,
        profiles: profiles?.length || 0,
        friendships: friendships?.length || 0,
      })
    } catch (error) {
      console.error("Error running diagnostics:", error)
      setTestResult(`Error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const testInvitationAcceptance = async () => {
    if (!diagnostics?.invitations.length) {
      setTestResult("No pending invitations to test")
      return
    }

    const pendingInvitation = diagnostics.invitations.find((inv) => inv.status === "pending")
    if (!pendingInvitation) {
      setTestResult("No pending invitations found")
      return
    }

    try {
      console.log("🧪 Testing invitation acceptance for:", pendingInvitation.id)

      const { data: result, error } = await supabase.rpc("accept_game_invitation", {
        invitation_id: pendingInvitation.id,
      })

      if (error) {
        setTestResult(`Test failed: ${error.message}`)
      } else {
        setTestResult(`Test result: ${JSON.stringify(result, null, 2)}`)
      }
    } catch (error) {
      setTestResult(`Test error: ${error}`)
    }
  }

  useEffect(() => {
    if (user) {
      runDiagnostics()
    }
  }, [user])

  if (!user) {
    return <div>Please log in to run diagnostics</div>
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-xl font-bold text-brand-primary mb-4">Invitation System Diagnostics</h3>

        <div className="space-y-4">
          <Button onClick={runDiagnostics} disabled={loading} variant="primary">
            {loading ? "Running..." : "Refresh Diagnostics"}
          </Button>

          {diagnostics && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-900/20 p-3 rounded">
                  <h4 className="font-semibold text-blue-400">Invitations</h4>
                  <p className="text-2xl font-bold text-white">{diagnostics.invitations.length}</p>
                  <p className="text-xs text-blue-300">
                    Pending: {diagnostics.invitations.filter((i) => i.status === "pending").length}
                  </p>
                </div>

                <div className="bg-green-900/20 p-3 rounded">
                  <h4 className="font-semibold text-green-400">Game Sessions</h4>
                  <p className="text-2xl font-bold text-white">{diagnostics.gameSessions.length}</p>
                  <p className="text-xs text-green-300">
                    Active: {diagnostics.gameSessions.filter((g) => g.status === "active").length}
                  </p>
                </div>

                <div className="bg-purple-900/20 p-3 rounded">
                  <h4 className="font-semibold text-purple-400">Profile</h4>
                  <p className="text-2xl font-bold text-white">{diagnostics.profiles.length}</p>
                  <p className="text-xs text-purple-300">{diagnostics.profiles[0]?.full_name || "No name"}</p>
                </div>

                <div className="bg-yellow-900/20 p-3 rounded">
                  <h4 className="font-semibold text-yellow-400">Friendships</h4>
                  <p className="text-2xl font-bold text-white">{diagnostics.friendships.length}</p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-white">Recent Invitations:</h4>
                {diagnostics.invitations.slice(0, 3).map((invitation) => (
                  <div key={invitation.id} className="bg-slate-800 p-3 rounded text-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-white font-medium">{invitation.game_session?.name || "Unknown Game"}</p>
                        <p className="text-slate-400">
                          From: {invitation.inviter_profile?.full_name || invitation.inviter_profile?.email}
                        </p>
                        <p className="text-slate-400">
                          Status:{" "}
                          <span
                            className={`font-semibold ${
                              invitation.status === "pending"
                                ? "text-yellow-400"
                                : invitation.status === "accepted"
                                  ? "text-green-400"
                                  : "text-red-400"
                            }`}
                          >
                            {invitation.status}
                          </span>
                        </p>
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(invitation.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Button onClick={testInvitationAcceptance} variant="secondary" size="sm">
                  Test Invitation Acceptance
                </Button>
                {testResult && (
                  <pre className="bg-slate-900 p-3 rounded text-xs text-green-400 overflow-auto">{testResult}</pre>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

export default InvitationDiagnostics
