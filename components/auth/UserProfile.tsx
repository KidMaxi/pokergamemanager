"use client"

import { useState } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { supabase } from "../../lib/supabase"
import { Card } from "../common/Card"
import { Button } from "../common/Button"

export default function UserProfile() {
  const { user, profile, refreshProfile } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [fullName, setFullName] = useState(profile?.full_name || "")
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    if (!user || !fullName.trim()) return

    setLoading(true)
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)

      if (error) throw error

      await refreshProfile()
      setIsEditing(false)
    } catch (error) {
      console.error("Error updating profile:", error)
      alert("Failed to update profile. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setFullName(profile?.full_name || "")
    setIsEditing(false)
  }

  const formatCurrency = (amount: number) => {
    const sign = amount >= 0 ? "+" : ""
    return `${sign}$${amount.toFixed(2)}`
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never"
    return new Date(dateString).toLocaleDateString()
  }

  if (!user) return null

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-bold text-text-primary mb-6">User Profile</h2>

        {/* Basic Info Section */}
        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Email</label>
            <div className="text-text-primary bg-surface-secondary p-3 rounded-lg">{user.email}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Full Name</label>
            {isEditing ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full p-3 border border-border-primary rounded-lg bg-surface-main text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  placeholder="Enter your full name"
                />
                <div className="flex space-x-2">
                  <Button
                    onClick={handleSave}
                    disabled={loading || !fullName.trim()}
                    className="bg-brand-primary text-white px-4 py-2 rounded-lg hover:bg-brand-secondary disabled:opacity-50"
                  >
                    {loading ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    onClick={handleCancel}
                    disabled={loading}
                    className="bg-surface-secondary text-text-primary px-4 py-2 rounded-lg hover:bg-surface-tertiary"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="text-text-primary bg-surface-secondary p-3 rounded-lg flex-grow mr-3">
                  {profile?.full_name || "Not set"}
                </div>
                <Button
                  onClick={() => {
                    setFullName(profile?.full_name || "")
                    setIsEditing(true)
                  }}
                  className="bg-brand-primary text-white px-4 py-2 rounded-lg hover:bg-brand-secondary"
                >
                  Edit
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Game Statistics Section */}
        <div className="border-t border-border-primary pt-6">
          <h3 className="text-xl font-semibold text-text-primary mb-4">Game Statistics</h3>

          {profile?.games_played > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-surface-secondary p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-brand-primary">{profile.games_played || 0}</div>
                <div className="text-sm text-text-secondary">Games Played</div>
              </div>

              <div className="bg-surface-secondary p-4 rounded-lg text-center">
                <div
                  className={`text-2xl font-bold ${
                    (profile.all_time_profit_loss || 0) >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {formatCurrency(profile.all_time_profit_loss || 0)}
                </div>
                <div className="text-sm text-text-secondary">All-Time P/L</div>
              </div>

              <div className="bg-surface-secondary p-4 rounded-lg text-center">
                <div className="text-lg font-semibold text-text-primary">{formatDate(profile.last_game_date)}</div>
                <div className="text-sm text-text-secondary">Last Game</div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">🎯</div>
              <h4 className="text-lg font-semibold text-text-primary mb-2">No Games Played Yet</h4>
              <p className="text-text-secondary">Start or join your first poker game to see your statistics here!</p>
            </div>
          )}
        </div>

        {/* Account Info Section */}
        <div className="border-t border-border-primary pt-6 mt-6">
          <h3 className="text-xl font-semibold text-text-primary mb-4">Account Information</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-text-secondary">Account Created:</span>
              <div className="text-text-primary font-medium">{new Date(user.created_at).toLocaleDateString()}</div>
            </div>

            <div>
              <span className="text-text-secondary">Email Verified:</span>
              <div className={`font-medium ${user.email_confirmed_at ? "text-green-600" : "text-red-600"}`}>
                {user.email_confirmed_at ? "Yes" : "No"}
              </div>
            </div>

            <div>
              <span className="text-text-secondary">Last Sign In:</span>
              <div className="text-text-primary font-medium">
                {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : "Never"}
              </div>
            </div>

            <div>
              <span className="text-text-secondary">Profile Updated:</span>
              <div className="text-text-primary font-medium">
                {profile?.updated_at ? new Date(profile.updated_at).toLocaleDateString() : "Never"}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
