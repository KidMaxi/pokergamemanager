"use client"

import { useState, useEffect } from "react"
import { useSupabase } from "../../contexts/SupabaseProvider"
import { createAdminClient } from "../../lib/supabase"
import Modal from "../common/Modal"
import Button from "../common/Button"
import Card from "../common/Card"

interface AdminPanelProps {
  isOpen: boolean
  onClose: () => void
}

interface DatabaseStats {
  totalUsers: number
  totalPlayers: number
  totalGameSessions: number
  activeGames: number
  completedGames: number
}

interface UserData {
  id: string
  email: string
  full_name: string | null
  created_at: string
  is_admin: boolean
  game_count: number
}

export default function AdminPanel({ isOpen, onClose }: AdminPanelProps) {
  const { session, supabase } = useSupabase()
  const user = session?.user
  const [profile, setProfile] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "database">("overview")
  const [stats, setStats] = useState<DatabaseStats | null>(null)
  const [users, setUsers] = useState<UserData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // SQL Query state
  const [sqlQuery, setSqlQuery] = useState("")
  const [queryResult, setQueryResult] = useState<any>(null)
  const [queryLoading, setQueryLoading] = useState(false)

  useEffect(() => {
    if (isOpen && user) {
      fetchProfile()
    }
  }, [isOpen, user])

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).single()
      if (error) throw error
      setProfile(data)
    } catch (err) {
      console.error("Error fetching profile:", err)
    }
  }

  const fetchStats = async () => {
    try {
      setLoading(true)

      // Get total users
      const { count: totalUsers } = await supabase.from("profiles").select("*", { count: "exact", head: true })

      // Get total players
      const { count: totalPlayers } = await supabase.from("players").select("*", { count: "exact", head: true })

      // Get total game sessions
      const { count: totalGameSessions } = await supabase
        .from("game_sessions")
        .select("*", { count: "exact", head: true })

      // Get active games
      const { count: activeGames } = await supabase
        .from("game_sessions")
        .select("*", { count: "exact", head: true })
        .eq("status", "active")

      // Get completed games
      const { count: completedGames } = await supabase
        .from("game_sessions")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed")

      setStats({
        totalUsers: totalUsers || 0,
        totalPlayers: totalPlayers || 0,
        totalGameSessions: totalGameSessions || 0,
        activeGames: activeGames || 0,
        completedGames: completedGames || 0,
      })
    } catch (err) {
      setError("Failed to fetch statistics")
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      setLoading(true)

      const { data, error } = await supabase
        .from("profiles")
        .select(`
          id,
          email,
          full_name,
          created_at,
          is_admin,
          game_sessions(count)
        `)
        .order("created_at", { ascending: false })

      if (error) throw error

      const usersWithGameCount = data.map((user) => ({
        ...user,
        game_count: Array.isArray(user.game_sessions) ? user.game_sessions.length : 0,
      }))

      setUsers(usersWithGameCount)
    } catch (err) {
      setError("Failed to fetch users")
    } finally {
      setLoading(false)
    }
  }

  const toggleUserAdmin = async (userId: string, currentAdminStatus: boolean) => {
    try {
      const { error } = await supabase.from("profiles").update({ is_admin: !currentAdminStatus }).eq("id", userId)

      if (error) throw error

      setSuccess(`User admin status updated successfully`)
      fetchUsers() // Refresh the users list
    } catch (err) {
      setError("Failed to update user admin status")
    }
  }

  const executeQuery = async () => {
    if (!sqlQuery.trim()) {
      setError("Please enter a SQL query")
      return
    }

    try {
      setQueryLoading(true)
      setError("")
      setQueryResult(null)

      // Use admin client for raw SQL queries
      const adminClient = createAdminClient()
      const { data, error } = await adminClient.rpc("execute_sql", {
        query: sqlQuery,
      })

      if (error) throw error

      setQueryResult(data)
      setSuccess("Query executed successfully")
    } catch (err: any) {
      setError(`Query failed: ${err.message}`)
    } finally {
      setQueryLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && profile?.is_admin) {
      fetchStats()
      if (activeTab === "users") {
        fetchUsers()
      }
    }
  }, [isOpen, activeTab, profile])

  if (!profile?.is_admin) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Access Denied">
        <div className="text-center py-8">
          <p className="text-text-secondary">You don't have admin privileges to access this panel.</p>
          <Button onClick={onClose} variant="primary" className="mt-4">
            Close
          </Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Admin Panel">
      <div className="space-y-6">
        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-surface-card rounded-lg p-1">
          {[
            { key: "overview", label: "Overview" },
            { key: "users", label: "Users" },
            { key: "database", label: "Database" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key ? "bg-brand-primary text-white" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && <div className="text-red-500 text-sm bg-red-50 border border-red-200 rounded p-3">{error}</div>}

        {success && (
          <div className="text-green-500 text-sm bg-green-50 border border-green-200 rounded p-3">{success}</div>
        )}

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-text-primary">System Overview</h3>

            {loading ? (
              <div className="text-center py-8">Loading statistics...</div>
            ) : stats ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Card className="text-center">
                  <div className="text-2xl font-bold text-brand-primary">{stats.totalUsers}</div>
                  <div className="text-text-secondary text-sm">Total Users</div>
                </Card>
                <Card className="text-center">
                  <div className="text-2xl font-bold text-blue-400">{stats.totalPlayers}</div>
                  <div className="text-text-secondary text-sm">Total Players</div>
                </Card>
                <Card className="text-center">
                  <div className="text-2xl font-bold text-green-400">{stats.totalGameSessions}</div>
                  <div className="text-text-secondary text-sm">Total Games</div>
                </Card>
                <Card className="text-center">
                  <div className="text-2xl font-bold text-yellow-400">{stats.activeGames}</div>
                  <div className="text-text-secondary text-sm">Active Games</div>
                </Card>
                <Card className="text-center">
                  <div className="text-2xl font-bold text-purple-400">{stats.completedGames}</div>
                  <div className="text-text-secondary text-sm">Completed Games</div>
                </Card>
              </div>
            ) : null}
          </div>
        )}

        {/* Users Tab */}
        {activeTab === "users" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-text-primary">User Management</h3>
              <Button onClick={fetchUsers} variant="secondary" size="sm">
                Refresh
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-8">Loading users...</div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 bg-surface-card rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium text-text-primary">
                        {user.full_name || "No name"}
                        {user.is_admin && (
                          <span className="ml-2 text-xs bg-brand-primary text-white px-2 py-1 rounded">ADMIN</span>
                        )}
                      </div>
                      <div className="text-sm text-text-secondary">{user.email}</div>
                      <div className="text-xs text-text-secondary">
                        Joined: {new Date(user.created_at).toLocaleDateString()} • Games: {user.game_count}
                      </div>
                    </div>
                    <Button
                      onClick={() => toggleUserAdmin(user.id, user.is_admin)}
                      variant={user.is_admin ? "danger" : "secondary"}
                      size="sm"
                    >
                      {user.is_admin ? "Remove Admin" : "Make Admin"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Database Tab */}
        {activeTab === "database" && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-text-primary">Database Management</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">SQL Query</label>
                <textarea
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  placeholder="Enter your SQL query here..."
                  className="w-full h-32 p-3 bg-surface-input border border-border-default rounded-md text-text-primary font-mono text-sm"
                />
              </div>

              <Button onClick={executeQuery} variant="primary" disabled={queryLoading || !sqlQuery.trim()}>
                {queryLoading ? "Executing..." : "Execute Query"}
              </Button>

              {queryResult && (
                <div className="space-y-2">
                  <h4 className="font-medium text-text-primary">Query Result:</h4>
                  <pre className="bg-surface-card p-4 rounded-lg text-sm overflow-auto max-h-64">
                    {JSON.stringify(queryResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
              <p className="text-yellow-800 text-sm">
                <strong>Warning:</strong> Be careful when executing SQL queries. Always backup your data before making
                changes.
              </p>
            </div>
          </div>
        )}

        {/* Close Button */}
        <div className="flex justify-end pt-4 border-t border-border-default">
          <Button onClick={onClose} variant="ghost">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
