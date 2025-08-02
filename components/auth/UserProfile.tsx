"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { supabase } from "../../lib/supabase"
import Modal from "../common/Modal"
import Button from "../common/Button"
import Input from "../common/Input"
import { formatCurrency, formatDate } from "../../utils"
import WinrateDisplay from "../WinrateDisplay"

interface UserProfileProps {
  isOpen: boolean
  onClose: () => void
}

const UserProfile: React.FC<UserProfileProps> = ({ isOpen, onClose }) => {
  const { user, signOut } = useAuth()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [fullName, setFullName] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen && user) {
      fetchProfile()
    }
  }, [isOpen, user])

  const fetchProfile = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).single()

      if (error) {
        console.error("Error fetching profile:", error)
        return
      }

      setProfile(data)
      setFullName(data.full_name || "")
    } catch (error) {
      console.error("Error fetching profile:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const { error } = await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("id", user!.id)

      if (error) {
        console.error("Error updating profile:", error)
        alert("Failed to update profile. Please try again.")
        return
      }

      setProfile({ ...profile, full_name: fullName.trim() })
      setEditing(false)
    } catch (error) {
      console.error("Error updating profile:", error)
      alert("Failed to update profile. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      onClose()
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="User Profile">
      <div className="space-y-6">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary mx-auto mb-4"></div>
            <p className="text-text-secondary">Loading profile...</p>
          </div>
        ) : (
          <>
            {/* Profile Information */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">Email</label>
                <p className="text-text-secondary bg-surface-secondary p-3 rounded-lg">{user?.email}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">Full Name</label>
                {editing ? (
                  <Input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                  />
                ) : (
                  <p className="text-text-secondary bg-surface-secondary p-3 rounded-lg">
                    {profile?.full_name || "Not set"}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">Account Created</label>
                <p className="text-text-secondary bg-surface-secondary p-3 rounded-lg">
                  {formatDate(profile?.created_at)}
                </p>
              </div>

              {profile?.is_admin && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                  <p className="text-yellow-400 font-medium">👑 Administrator Account</p>
                </div>
              )}
            </div>

            {/* All-Time Poker Stats */}
            <div className="border-t border-border-default pt-6">
              <h3 className="text-lg font-semibold text-text-primary mb-4">All-Time Poker Stats</h3>

              {profile?.games_played > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  {/* Games Played */}
                  <div className="bg-surface-secondary rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-brand-primary">{profile.games_played || 0}</p>
                    <p className="text-sm text-text-secondary">Games Played</p>
                  </div>

                  {/* Win Rate */}
                  <div className="bg-surface-secondary rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold">
                      <WinrateDisplay winRate={profile.win_ratio || 0} showLabel={false} className="text-2xl" />
                    </div>
                    <p className="text-sm text-text-secondary">Win Rate</p>
                  </div>

                  {/* All-time P/L */}
                  <div className="bg-surface-secondary rounded-lg p-4 text-center">
                    <p
                      className={`text-2xl font-bold ${
                        (profile.all_time_profit_loss || 0) >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {(profile.all_time_profit_loss || 0) >= 0 ? "+" : ""}
                      {formatCurrency(profile.all_time_profit_loss || 0)}
                    </p>
                    <p className="text-sm text-text-secondary">All-time P/L</p>
                  </div>

                  {/* Average P/L per Game */}
                  <div className="bg-surface-secondary rounded-lg p-4 text-center">
                    {(() => {
                      const avgProfitPerGame =
                        profile.games_played > 0 ? (profile.all_time_profit_loss || 0) / profile.games_played : 0
                      return (
                        <>
                          <p
                            className={`text-2xl font-bold ${
                              avgProfitPerGame >= 0 ? "text-green-400" : "text-red-400"
                            }`}
                          >
                            {avgProfitPerGame >= 0 ? "+" : ""}
                            {formatCurrency(avgProfitPerGame)}
                          </p>
                          <p className="text-sm text-text-secondary">Avg P/L per Game</p>
                        </>
                      )
                    })()}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 bg-surface-secondary rounded-lg">
                  <p className="text-text-secondary">No games played yet</p>
                  <p className="text-sm text-text-secondary mt-2">Start playing to see your poker statistics!</p>
                </div>
              )}

              {profile?.games_played > 0 && (
                <div className="mt-4 text-center">
                  <p className="text-sm text-text-secondary">Last game: {formatDate(profile.updated_at)}</p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between space-x-3 pt-4 border-t border-border-default">
              {editing ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditing(false)
                      setFullName(profile?.full_name || "")
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => setEditing(true)}>
                    Edit Profile
                  </Button>
                  <Button variant="danger" onClick={handleSignOut}>
                    Sign Out
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

export default UserProfile
