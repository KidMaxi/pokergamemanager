"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useSupabase } from "../../contexts/SupabaseProvider"
import Modal from "../common/Modal"
import Input from "../common/Input"
import Button from "../common/Button"

interface UserProfileProps {
  isOpen: boolean
  onClose: () => void
}

export default function UserProfile({ isOpen, onClose }: UserProfileProps) {
  const { session, supabase } = useSupabase()
  const user = session?.user
  const [profile, setProfile] = useState<any>(null)
  const [fullName, setFullName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

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
      setFullName(data?.full_name || "")
    } catch (err) {
      console.error("Error fetching profile:", err)
    }
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccess("")

    try {
      const { error } = await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("id", user!.id)

      if (error) {
        setError(error.message)
      } else {
        setSuccess("Profile updated successfully!")
        await fetchProfile()
      }
    } catch (err) {
      setError("An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
      onClose()
    } catch (err) {
      setError("Error signing out")
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="User Profile">
      <div className="space-y-6">
        {/* User Info */}
        <div className="bg-surface-card p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-text-primary mb-2">Account Information</h3>
          <p className="text-text-secondary">
            <strong>Email:</strong> {user?.email}
          </p>
          <p className="text-text-secondary">
            <strong>Account Created:</strong>{" "}
            {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "N/A"}
          </p>
          {profile?.is_admin && (
            <p className="text-brand-primary font-semibold">
              <strong>Admin Account</strong>
            </p>
          )}
        </div>

        {/* Poker Stats Section */}
        <div className="bg-surface-card p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-text-primary mb-3">Poker Statistics</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-surface-background rounded-lg">
              <div className="text-2xl font-bold text-text-primary">{profile?.games_played || 0}</div>
              <div className="text-sm text-text-secondary">Games Played</div>
            </div>
            <div className="text-center p-3 bg-surface-background rounded-lg">
              <div className="text-2xl font-bold text-text-primary">{profile?.total_wins || 0}</div>
              <div className="text-sm text-text-secondary">Total Wins</div>
            </div>
            <div className="text-center p-3 bg-surface-background rounded-lg">
              <div
                className={`text-2xl font-bold ${
                  (profile?.games_played || 0) > 0
                    ? `${Math.round(((profile.total_wins || 0) / profile.games_played) * 100)}%`
                    : "0%"
                }`}
              >
                {profile?.games_played && profile.games_played > 0
                  ? `${Math.round(((profile.total_wins || 0) / profile.games_played) * 100)}%`
                  : "0%"}
              </div>
              <div className="text-sm text-text-secondary">Win Rate</div>
            </div>
            <div className="text-center p-3 bg-surface-background rounded-lg">
              <div
                className={`text-2xl font-bold ${
                  (profile?.all_time_profit_loss || 0) >= 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                ${profile?.all_time_profit_loss ? Number(profile.all_time_profit_loss).toFixed(2) : "0.00"}
              </div>
              <div className="text-sm text-text-secondary">P/L</div>
            </div>
          </div>
        </div>

        {/* Update Profile Form */}
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <Input
            label="Full Name"
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Enter your full name"
          />

          {error && <div className="text-red-500 text-sm bg-red-50 border border-red-200 rounded p-3">{error}</div>}

          {success && (
            <div className="text-green-500 text-sm bg-green-50 border border-green-200 rounded p-3">{success}</div>
          )}

          <Button type="submit" variant="primary" disabled={loading} className="w-full">
            {loading ? "Updating..." : "Update Profile"}
          </Button>
        </form>

        {/* Actions */}
        <div className="flex justify-between pt-4 border-t border-border-default">
          <Button onClick={onClose} variant="ghost">
            Close
          </Button>
          <Button onClick={handleSignOut} variant="danger">
            Sign Out
          </Button>
        </div>
      </div>
    </Modal>
  )
}
