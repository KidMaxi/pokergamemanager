"use client"

import type React from "react"
import { useState, useEffect } from "react"
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
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0)
  const [lastRefreshTime, setLastRefreshTime] = useState(0)
  const [refreshCount, setRefreshCount] = useState(0)

  useEffect(() => {
    const refreshCountFromStorage = Number.parseInt(localStorage.getItem("poker-refresh-count") || "0")
    setRefreshCount(refreshCountFromStorage)

    const lastRefresh = Number.parseInt(localStorage.getItem("poker-last-refresh") || "0")
    if (Date.now() - lastRefresh > 5 * 60 * 1000) {
      localStorage.setItem("poker-refresh-count", "0")
      setRefreshCount(0)
    }

    return () => {
      console.log("[v0] Navbar component unmounting, cleaning up...")
    }
  }, [])

  useEffect(() => {
    if (user) {
      fetchPendingRequests()
    } else {
      setPendingRequestsCount(0)
    }
  }, [user])

  const handleOpenProfile = async () => {
    if (user) {
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
        } else if (error) {
          console.error("Error loading profile:", error)
          setUserStats({
            all_time_profit_loss: 0,
            games_played: 0,
            last_game_date: null,
          })
        }
      } catch (err) {
        console.error("Error loading profile:", err)
        setUserStats({
          all_time_profit_loss: 0,
          games_played: 0,
          last_game_date: null,
        })
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
      setIsProfileModalOpen(false)
      const { error } = await signOut()

      if (error) {
        console.error("Sign out error:", error)
        setError("Error signing out")
      } else {
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

  const handleRefresh = async () => {
    const now = Date.now()

    if (now - lastRefreshTime < 2000) {
      console.log("[v0] Refresh throttled - too soon since last refresh")
      return
    }

    const currentRefreshCount = refreshCount + 1
    if (currentRefreshCount > 5) {
      console.error("[v0] Too many refreshes detected, implementing safety delay")
      if (!confirm("You've refreshed multiple times recently. This might indicate an issue. Continue anyway?")) {
        return
      }
      localStorage.setItem("poker-refresh-count", "0")
      setRefreshCount(0)
    } else {
      localStorage.setItem("poker-refresh-count", currentRefreshCount.toString())
      setRefreshCount(currentRefreshCount)
    }

    setLastRefreshTime(now)
    localStorage.setItem("poker-last-refresh", now.toString())

    setIsRefreshing(true)

    try {
      console.log("[v0] Starting refresh process, count:", currentRefreshCount)

      const controller = new AbortController()

      localStorage.removeItem("poker-cached-friends")
      localStorage.removeItem("poker-cached-games")

      const delay = Math.min(500 + currentRefreshCount * 200, 2000)
      await new Promise((resolve) => setTimeout(resolve, delay))

      localStorage.setItem("poker-current-view", activeView)
      localStorage.setItem("poker-refresh-timestamp", now.toString())

      console.log("[v0] Performing page reload...")

      window.location.replace(window.location.href)
    } catch (error) {
      console.error("[v0] Error during refresh:", error)
      setIsRefreshing(false)
      setError("Refresh failed. Please try again.")

      localStorage.setItem("poker-refresh-count", "0")
      setRefreshCount(0)
    }
  }

  const fetchPendingRequests = async () => {
    if (!user) return

    try {
      const { data, error } = await supabase
        .from("friend_requests")
        .select("id")
        .eq("receiver_id", user.id)
        .eq("status", "pending")

      if (!error && data) {
        setPendingRequestsCount(data.length)
      }
    } catch (error) {
      console.error("Error fetching pending requests:", error)
    }
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
            <div className="flex items-center space-x-2">
              <button
                onClick={handleTitleClick}
                className="bg-brand-primary text-white px-2 py-1.5 sm:px-4 sm:py-2 rounded-md text-sm sm:text-xl font-bold hover:bg-brand-primary-hover transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 focus:ring-offset-surface-card"
              >
                <span className="hidden sm:inline">Poker Home Game Manager</span>
                <span className="sm:hidden">Poker Manager</span>
              </button>

              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="bg-surface-input text-text-secondary hover:text-text-primary hover:bg-surface-hover px-2 py-1.5 sm:px-3 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 focus:ring-offset-surface-card disabled:opacity-50"
                title="Refresh page"
              >
                <div className={`${isRefreshing ? "animate-spin" : ""}`}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                    <path d="M3 21v-5h5" />
                  </svg>
                </div>
                <span className="hidden sm:inline ml-1">{isRefreshing ? "Refreshing..." : "Refresh"}</span>
              </button>
            </div>

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
                className={`relative px-2 py-1.5 sm:px-3 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                  activeView === "friends"
                    ? "bg-brand-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Friends
                {pendingRequestsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center min-w-[16px] text-[10px] font-bold">
                    {pendingRequestsCount > 9 ? "9+" : pendingRequestsCount}
                  </span>
                )}
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

      <Modal isOpen={isProfileModalOpen} onClose={handleCloseModal} title="User Profile">
        <div className="space-y-6">
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

          <Card className="bg-gradient-to-r from-slate-800 to-slate-700 border-2 border-brand-primary">
            <h3 className="text-lg font-semibold text-brand-primary mb-4 flex items-center">
              <span className="mr-2">📊</span>
              All-Time Poker Stats
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="text-center p-3 bg-slate-800 rounded-lg">
                <div className={`text-2xl font-bold ${getStatsColor(userStats?.all_time_profit_loss || 0)}`}>
                  {formatCurrency(userStats?.all_time_profit_loss || 0)}
                </div>
                <div className="text-text-secondary text-sm">Total P/L</div>
              </div>
              <div className="text-center p-3 bg-slate-800 rounded-lg">
                <div className="text-2xl font-bold text-blue-400">{userStats?.games_played || 0}</div>
                <div className="text-text-secondary text-sm">Games Played</div>
              </div>
            </div>
            {userStats?.last_game_date && (
              <div className="mt-4 text-center">
                <p className="text-text-secondary text-sm">
                  Last Game: <span className="text-white">{formatDate(userStats.last_game_date, false)}</span>
                </p>
              </div>
            )}
            {(!userStats?.games_played || userStats.games_played === 0) && (
              <div className="mt-4 text-center">
                <p className="text-text-secondary text-sm">
                  No completed games yet. Start playing to track your stats!
                </p>
              </div>
            )}
          </Card>

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
