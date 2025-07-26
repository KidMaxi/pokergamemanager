"use client"

import type React from "react"
import { useState } from "react"
import type { View } from "../types"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"
import { formatCurrency, formatDate } from "../utils"
import Modal from "./common/Modal"
import Input from "./common/Input"
import Button from "./common/Button"
import Card from "./common/Card"

interface NavbarProps {
  setCurrentView: (view: View) => void
  activeView: View
  user: any
}

interface UserStats {
  all_time_profit_loss: number
  games_played: number
  last_game_date: string | null
}

const Navbar: React.FC<NavbarProps> = ({ setCurrentView, activeView, user }) => {
  const { signOut } = useAuth()
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [fullName, setFullName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [userStats, setUserStats] = useState<UserStats | null>(null)

  const handleOpenProfile = async () => {
    if (user) {
      // Load current profile data including stats
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("full_name, all_time_profit_loss, games_played, last_game_date")
          .eq("id", user.id)
          .single()

        if (data) {
          setFullName(data.full_name || "")
          setUserStats({
            all_time_profit_loss: data.all_time_profit_loss || 0,
            games_played: data.games_played || 0,
            last_game_date: data.last_game_date,
          })
        }
      } catch (err) {
        console.error("Error loading profile:", err)
      }
    }
    setIsProfileModalOpen(true)
    setError("")
    setSuccess("")
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setLoading(true)
    setError("")
    setSuccess("")

    try {
      const { error } = await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("id", user.id)

      if (error) {
        setError(error.message)
      } else {
        setSuccess("Profile updated successfully!")
        setTimeout(() => setSuccess(""), 3000)
      }
    } catch (err: any) {
      setError("An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      setIsProfileModalOpen(false) // Close modal immediately
      const { error } = await signOut()

      if (error) {
        console.error("Sign out error:", error)
        setError("Error signing out")
      } else {
        // Force a page reload to ensure clean state
        window.location.reload()
      }
    } catch (err) {
      console.error("Sign out error:", err)
      setError("Error signing out")
    }
  }

  const handleCloseModal = () => {
    setIsProfileModalOpen(false)
    setError("")
    setSuccess("")
    setFullName("")
    setUserStats(null)
  }

  const handleTitleClick = () => {
    setCurrentView("dashboard")
  }

  const getStatsColor = (profitLoss: number) => {
    if (profitLoss > 0) return "text-green-400"
    if (profitLoss < 0) return "text-red-400"
    return "text-text-secondary"
  }

  return (
    <>
      <nav className="bg-surface-card border-b border-border-default">
        <div className="container mx-auto px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex justify-between items-center">
            {/* Mobile-optimized title */}
            <button
              onClick={handleTitleClick}
              className="bg-brand-primary text-white px-2 py-1.5 sm:px-4 sm:py-2 rounded-md text-sm sm:text-xl font-bold hover:bg-brand-primary-hover transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 focus:ring-offset-surface-card"
            >
              <span className="hidden sm:inline">Poker Home Game Manager</span>
              <span className="sm:hidden">Poker Manager</span>
            </button>

            <div className="flex items-center space-x-1 sm:space-x-2">
              <button
                onClick={() => setCurrentView("dashboard")}
                className={`px-2 py-1.5 sm:px-3 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                  activeView === "dashboard"
                    ? "bg-brand-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Dashboard
              </button>

              <button
                onClick={() => setCurrentView("friends")}
                className={`px-2 py-1.5 sm:px-3 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                  activeView === "friends"
                    ? "bg-brand-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Friends
              </button>

              {user && (
                <button
                  onClick={handleOpenProfile}
                  className="flex items-center space-x-1 sm:space-x-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-md text-xs sm:text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-input transition-colors"
                >
                  <div className="w-5 h-5 sm:w-6 sm:h-6 bg-brand-primary rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {user.email?.charAt(0).toUpperCase() || "U"}
                  </div>
                  <span className="hidden sm:inline">Profile</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Profile Modal */}
      <Modal isOpen={isProfileModalOpen} onClose={handleCloseModal} title="User Profile">
        <div className="space-y-6">
          {/* User Info */}
          <div className="bg-surface-input p-4 rounded-lg border border-border-default">
            <h3 className="text-lg font-semibold text-text-primary mb-2">Account Information</h3>
            <p className="text-text-secondary">
              <strong className="text-text-primary">Email:</strong> {user?.email}
            </p>
            <p className="text-text-secondary">
              <strong className="text-text-primary">Account Created:</strong>{" "}
              {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "N/A"}
            </p>
          </div>

          {/* All-Time Stats */}
          {userStats && (
            <Card className="bg-gradient-to-r from-slate-800 to-slate-700 border-2 border-brand-primary">
              <h3 className="text-lg font-semibold text-brand-primary mb-4 flex items-center">
                <span className="mr-2">📊</span>
                All-Time Poker Stats
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="text-center p-3 bg-slate-800 rounded-lg">
                  <div className={`text-2xl font-bold ${getStatsColor(userStats.all_time_profit_loss)}`}>
                    {formatCurrency(userStats.all_time_profit_loss)}
                  </div>
                  <div className="text-text-secondary text-sm">Total P/L</div>
                </div>
                <div className="text-center p-3 bg-slate-800 rounded-lg">
                  <div className="text-2xl font-bold text-blue-400">{userStats.games_played}</div>
                  <div className="text-text-secondary text-sm">Games Played</div>
                </div>
              </div>
              {userStats.last_game_date && (
                <div className="mt-4 text-center">
                  <p className="text-text-secondary text-sm">
                    Last Game: <span className="text-white">{formatDate(userStats.last_game_date, false)}</span>
                  </p>
                </div>
              )}
              {userStats.games_played === 0 && (
                <div className="mt-4 text-center">
                  <p className="text-text-secondary text-sm">
                    No completed games yet. Start playing to track your stats!
                  </p>
                </div>
              )}
            </Card>
          )}

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

            {error && (
              <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded p-3">{error}</div>
            )}

            {success && (
              <div className="text-green-400 text-sm bg-green-900/20 border border-green-800 rounded p-3">
                {success}
              </div>
            )}

            <Button type="submit" variant="primary" disabled={loading} className="w-full">
              {loading ? "Updating..." : "Update Profile"}
            </Button>
          </form>

          {/* Actions */}
          <div className="flex justify-between pt-4 border-t border-border-default">
            <Button onClick={handleCloseModal} variant="ghost">
              Close
            </Button>
            <Button onClick={handleSignOut} variant="danger">
              Sign Out
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

export default Navbar
