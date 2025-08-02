"use client"

import type React from "react"

import { useState } from "react"
import { useAuth } from "../../contexts/AuthContext"
import Modal from "../common/Modal"
import Input from "../common/Input"
import Button from "../common/Button"

interface UserProfileProps {
  isOpen: boolean
  onClose: () => void
}

export default function UserProfile({ isOpen, onClose }: UserProfileProps) {
  const { user, profile, updateProfile, signOut } = useAuth()
  const [fullName, setFullName] = useState(profile?.full_name || "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccess("")

    try {
      const { error } = await updateProfile({
        full_name: fullName.trim(),
      })

      if (error) {
        setError(error.message)
      } else {
        setSuccess("Profile updated successfully!")
      }
    } catch (err) {
      setError("An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      onClose()
    } catch (err) {
      setError("Error signing out")
    }
  }

  // Safe getters with fallback to 0
  const gamesPlayed = profile?.games_played || 0
  const allTimePL = profile?.all_time_profit_loss || 0
  const biggestWin = profile?.biggest_win || 0
  const biggestLoss = profile?.biggest_loss || 0

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

        {/* All-Time Poker Stats */}
        <div className="bg-surface-card p-4 rounded-lg border-2 border-green-500">
          <h3 className="text-lg font-semibold text-green-400 mb-4 flex items-center">
            <span className="mr-2">🃏</span>
            All-Time Poker Stats
          </h3>

          {gamesPlayed === 0 ? (
            <div className="text-center py-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center p-3 bg-surface-secondary rounded">
                  <div className="text-2xl font-bold text-text-primary">$0.00</div>
                  <div className="text-sm text-text-secondary">Total P/L</div>
                </div>
                <div className="text-center p-3 bg-surface-secondary rounded">
                  <div className="text-2xl font-bold text-brand-primary">0</div>
                  <div className="text-sm text-text-secondary">Games Played</div>
                </div>
              </div>
              <p className="text-text-secondary">No completed games yet. Start playing to track your stats!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Basic Stats Row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-surface-secondary rounded">
                  <div className={`text-2xl font-bold ${allTimePL >= 0 ? "text-green-400" : "text-red-400"}`}>
                    ${allTimePL.toFixed(2)}
                  </div>
                  <div className="text-sm text-text-secondary">Total P/L</div>
                </div>
                <div className="text-center p-3 bg-surface-secondary rounded">
                  <div className="text-2xl font-bold text-brand-primary">{gamesPlayed}</div>
                  <div className="text-sm text-text-secondary">Games Played</div>
                </div>
              </div>

              {/* Win/Loss Records */}
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-surface-secondary rounded">
                  <div className="text-xl font-bold text-green-400">${biggestWin.toFixed(2)}</div>
                  <div className="text-sm text-text-secondary">Biggest Win</div>
                </div>
                <div className="text-center p-3 bg-surface-secondary rounded">
                  <div className="text-xl font-bold text-red-400">${Math.abs(biggestLoss).toFixed(2)}</div>
                  <div className="text-sm text-text-secondary">Biggest Loss</div>
                </div>
              </div>

              {profile?.last_game_date && (
                <div className="text-center">
                  <p className="text-sm text-text-secondary">
                    Last game: {new Date(profile.last_game_date).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          )}
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
