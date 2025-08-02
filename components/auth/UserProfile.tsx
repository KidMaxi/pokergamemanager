"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { supabase } from "../../lib/supabase"
import Button from "../common/Button"
import Input from "../common/Input"
import Card from "../common/Card"
import { formatCurrency } from "../../utils"

const UserProfile: React.FC = () => {
  const { user, profile, refreshProfile } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [fullName, setFullName] = useState(profile?.full_name || "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "")
    }
  }, [profile])

  const handleSave = async () => {
    if (!user) return

    setLoading(true)
    setError("")
    setSuccess("")

    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)

      if (updateError) {
        throw updateError
      }

      await refreshProfile()
      setSuccess("Profile updated successfully!")
      setIsEditing(false)

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(""), 3000)
    } catch (error: any) {
      console.error("Error updating profile:", error)
      setError("Failed to update profile. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setFullName(profile?.full_name || "")
    setIsEditing(false)
    setError("")
    setSuccess("")
  }

  const getInitials = (name: string | null, email: string) => {
    if (name && name.trim()) {
      return name
        .trim()
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    }
    return email.charAt(0).toUpperCase()
  }

  const getProfitLossColor = (amount: number) => {
    if (amount > 0) return "text-green-400"
    if (amount < 0) return "text-red-400"
    return "text-text-secondary"
  }

  if (!user || !profile) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <p className="text-center text-text-secondary">Loading profile...</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <Card className="mb-6">
        <div className="flex items-center space-x-4 mb-6">
          {/* Avatar Circle with Initials */}
          <div className="w-16 h-16 bg-brand-primary rounded-full flex items-center justify-center text-white font-bold text-xl">
            {getInitials(profile.full_name, profile.email)}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-text-primary">{profile.full_name || "Anonymous Player"}</h2>
            <p className="text-text-secondary">{profile.email}</p>
            {profile.is_admin && (
              <span className="inline-block bg-yellow-600 text-white text-xs px-2 py-1 rounded mt-1">Admin</span>
            )}
          </div>
        </div>

        {success && (
          <div className="bg-green-900/20 border border-green-600 rounded p-3 mb-4">
            <p className="text-green-400 text-sm">✅ {success}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-600 rounded p-3 mb-4">
            <p className="text-red-400 text-sm">❌ {error}</p>
          </div>
        )}

        {isEditing ? (
          <div className="space-y-4">
            <Input
              label="Full Name"
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
            />
            <div className="flex space-x-2">
              <Button onClick={handleSave} disabled={loading} variant="primary">
                {loading ? "Saving..." : "Save Changes"}
              </Button>
              <Button onClick={handleCancel} variant="ghost" disabled={loading}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Full Name</label>
              <p className="text-text-primary bg-surface-input p-2 rounded">{profile.full_name || "Not set"}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Email</label>
              <p className="text-text-secondary bg-surface-input p-2 rounded">{profile.email}</p>
            </div>
            <Button onClick={() => setIsEditing(true)} variant="secondary">
              Edit Profile
            </Button>
          </div>
        )}
      </Card>

      {/* All-Time Poker Stats */}
      <Card className="border-2 border-green-500">
        <div className="flex items-center space-x-2 mb-4">
          <span className="text-2xl">🃏</span>
          <h3 className="text-xl font-semibold text-text-primary">All-Time Poker Stats</h3>
        </div>

        {profile.games_played === 0 ? (
          <div className="text-center py-6">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-text-primary">{formatCurrency(0)}</p>
                <p className="text-sm text-text-secondary">Total P/L</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-text-primary">0</p>
                <p className="text-sm text-text-secondary">Games Played</p>
              </div>
            </div>
            <p className="text-text-secondary text-sm">🎮 Start playing games to see your statistics here!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className={`text-2xl font-bold ${getProfitLossColor(profile.all_time_profit_loss || 0)}`}>
                {formatCurrency(profile.all_time_profit_loss || 0)}
              </p>
              <p className="text-sm text-text-secondary">Total P/L</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-text-primary">{profile.games_played}</p>
              <p className="text-sm text-text-secondary">Games Played</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

export default UserProfile
