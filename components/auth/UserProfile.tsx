"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../contexts/AuthContext"
import Button from "../common/Button"
import Input from "../common/Input"
import Modal from "../common/Modal"

interface UserStats {
  all_time_profit_loss: number
  games_played: number
  last_game_date: string | null
}

const UserProfile: React.FC = () => {
  const { user } = useAuth()
  const [profile, setProfile] = useState<any>(null)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    full_name: "",
    email: "",
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (user) {
      fetchProfile()
      fetchStats()
    }
  }, [user])

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user?.id).single()

      if (error) throw error

      setProfile(data)
      setEditForm({
        full_name: data.full_name || "",
        email: data.email || "",
      })
    } catch (error) {
      console.error("Error fetching profile:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("all_time_profit_loss, games_played, last_game_date")
        .eq("id", user?.id)
        .single()

      if (error) throw error
      setStats(data)
    } catch (error) {
      console.error("Error fetching stats:", error)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: editForm.full_name,
          email: editForm.email,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user?.id)

      if (error) throw error

      await fetchProfile()
      setIsEditing(false)
    } catch (error) {
      console.error("Error updating profile:", error)
      alert("Error updating profile. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never"
    return new Date(dateString).toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading profile...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-gray-800 rounded-lg shadow-xl p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-4">
              {/* Profile Avatar Placeholder - removed avatar_url references */}
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-2xl font-bold">
                {profile?.full_name
                  ? profile.full_name.charAt(0).toUpperCase()
                  : profile?.email?.charAt(0).toUpperCase() || "U"}
              </div>
              <div>
                <h1 className="text-3xl font-bold">{profile?.full_name || "Unnamed Player"}</h1>
                <p className="text-gray-400">{profile?.email}</p>
                <p className="text-sm text-gray-500">
                  Member since {new Date(profile?.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <Button onClick={() => setIsEditing(true)} className="bg-blue-600 hover:bg-blue-700">
              Edit Profile
            </Button>
          </div>

          {/* Stats Section */}
          <div className="border-2 border-green-500 rounded-lg p-6 mb-8">
            <h2 className="text-2xl font-bold mb-6 text-center">🃏 All-Time Poker Stats</h2>

            {stats && stats.games_played > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div
                    className={`text-3xl font-bold ${stats.all_time_profit_loss >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {formatCurrency(stats.all_time_profit_loss || 0)}
                  </div>
                  <div className="text-gray-400 mt-1">Total P/L</div>
                </div>

                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-400">{stats.games_played || 0}</div>
                  <div className="text-gray-400 mt-1">Games Played</div>
                </div>

                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-400">{formatDate(stats.last_game_date)}</div>
                  <div className="text-gray-400 mt-1">Last Game</div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-gray-400">{formatCurrency(0)}</div>
                    <div className="text-gray-400 mt-1">Total P/L</div>
                  </div>

                  <div className="text-center">
                    <div className="text-3xl font-bold text-gray-400">0</div>
                    <div className="text-gray-400 mt-1">Games Played</div>
                  </div>
                </div>
                <p className="text-gray-500 text-lg">
                  No games played yet. Join or create a game to start tracking your poker statistics!
                </p>
              </div>
            )}
          </div>

          {/* Account Information */}
          <div className="bg-gray-700 rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-4">Account Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Full Name</label>
                <div className="text-white bg-gray-600 p-3 rounded">{profile?.full_name || "Not set"}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                <div className="text-white bg-gray-600 p-3 rounded">{profile?.email}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Account Type</label>
                <div className="text-white bg-gray-600 p-3 rounded">
                  {profile?.is_admin ? "Administrator" : "Player"}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Last Updated</label>
                <div className="text-white bg-gray-600 p-3 rounded">
                  {new Date(profile?.updated_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      {isEditing && (
        <Modal isOpen={isEditing} onClose={() => setIsEditing(false)} title="Edit Profile">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Full Name</label>
              <Input
                type="text"
                value={editForm.full_name}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                placeholder="Enter your full name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="Enter your email"
              />
            </div>
            <div className="flex space-x-3 pt-4">
              <Button onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700 flex-1">
                {saving ? "Saving..." : "Save Changes"}
              </Button>
              <Button onClick={() => setIsEditing(false)} className="bg-gray-600 hover:bg-gray-700 flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default UserProfile
