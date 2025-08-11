"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"
import { formatCurrency } from "../utils"
import Card from "./common/Card"

interface UserStats {
  all_time_profit_loss: number
  games_played: number
  total_wins: number
  last_game_date: string | null
}

const StatsPage: React.FC = () => {
  const { user } = useAuth()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      fetchUserStats()
    }
  }, [user])

  const fetchUserStats = async () => {
    if (!user) return

    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from("profiles")
        .select("all_time_profit_loss, games_played, total_wins, last_game_date")
        .eq("id", user.id)
        .single()

      if (fetchError) {
        console.error("Error fetching user stats:", fetchError)
        setError("Failed to load your statistics")
        return
      }

      setStats({
        all_time_profit_loss: data?.all_time_profit_loss || 0,
        games_played: data?.games_played || 0,
        total_wins: data?.total_wins || 0,
        last_game_date: data?.last_game_date || null,
      })
    } catch (err) {
      console.error("Error fetching stats:", err)
      setError("Failed to load your statistics")
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    fetchUserStats()
  }

  const calculateWinRate = () => {
    if (!stats || stats.games_played === 0) return 0
    return Math.round((stats.total_wins / stats.games_played) * 100)
  }

  const getStatsColor = (profitLoss: number) => {
    if (profitLoss > 0) return "text-green-400"
    if (profitLoss < 0) return "text-red-400"
    return "text-slate-400"
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="container mx-auto max-w-4xl">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
              <p className="text-slate-400">Loading your statistics...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="container mx-auto max-w-4xl">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="text-red-400 text-xl mb-4">⚠️</div>
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={handleRefresh}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="container mx-auto max-w-4xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Your Poker Statistics</h1>
            <p className="text-slate-400">Track your poker performance and progress</p>
          </div>
          <button
            onClick={handleRefresh}
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
          >
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
            Refresh
          </button>
        </div>

        {/* Main Stats Grid */}
        <Card className="bg-gradient-to-r from-slate-800 to-slate-700 border-2 border-green-500 mb-8">
          <div className="p-6">
            <h2 className="text-2xl font-bold text-green-400 mb-6 flex items-center">
              <span className="mr-3">📊</span>
              All-Time Performance
            </h2>

            {/* 4-Stat Grid - Same as Friends Tab */}
            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              {/* P/L */}
              <div className="bg-slate-800 rounded-lg p-4 text-center border border-slate-600">
                <div
                  className={`text-2xl sm:text-3xl font-bold mb-1 ${getStatsColor(stats?.all_time_profit_loss || 0)}`}
                >
                  {formatCurrency(stats?.all_time_profit_loss || 0)}
                </div>
                <div className="text-slate-400 text-sm font-medium">P/L</div>
              </div>

              {/* Games */}
              <div className="bg-slate-800 rounded-lg p-4 text-center border border-slate-600">
                <div className="text-2xl sm:text-3xl font-bold text-blue-400 mb-1">{stats?.games_played || 0}</div>
                <div className="text-slate-400 text-sm font-medium">Games</div>
              </div>

              {/* Wins */}
              <div className="bg-slate-800 rounded-lg p-4 text-center border border-slate-600">
                <div className="text-2xl sm:text-3xl font-bold text-yellow-400 mb-1">{stats?.total_wins || 0}</div>
                <div className="text-slate-400 text-sm font-medium">Wins</div>
              </div>

              {/* Win Rate */}
              <div className="bg-slate-800 rounded-lg p-4 text-center border border-slate-600">
                <div className="text-2xl sm:text-3xl font-bold text-purple-400 mb-1">{calculateWinRate()}%</div>
                <div className="text-slate-400 text-sm font-medium">Win Rate</div>
              </div>
            </div>

            {/* Last Game Info */}
            {stats?.last_game_date && (
              <div className="mt-6 pt-4 border-t border-slate-600">
                <p className="text-slate-400 text-center">
                  Last Game:{" "}
                  <span className="text-white font-medium">{new Date(stats.last_game_date).toLocaleDateString()}</span>
                </p>
              </div>
            )}

            {/* No Games Message */}
            {(!stats?.games_played || stats.games_played === 0) && (
              <div className="mt-6 pt-4 border-t border-slate-600 text-center">
                <div className="text-slate-400 mb-2">🎯</div>
                <p className="text-slate-400">No completed games yet. Start playing to track your statistics!</p>
              </div>
            )}
          </div>
        </Card>

        {/* Additional Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Performance Summary */}
          <Card className="bg-slate-800 border border-slate-600">
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                <span className="mr-2">🎲</span>
                Performance Summary
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Average P/L per Game:</span>
                  <span
                    className={`font-medium ${getStatsColor(
                      stats?.games_played ? stats.all_time_profit_loss / stats.games_played : 0,
                    )}`}
                  >
                    {stats?.games_played
                      ? formatCurrency(stats.all_time_profit_loss / stats.games_played)
                      : formatCurrency(0)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Win Percentage:</span>
                  <span className="text-purple-400 font-medium">{calculateWinRate()}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Total Sessions:</span>
                  <span className="text-blue-400 font-medium">{stats?.games_played || 0}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Quick Stats */}
          <Card className="bg-slate-800 border border-slate-600">
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                <span className="mr-2">⚡</span>
                Quick Stats
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Profitable Sessions:</span>
                  <span className="text-green-400 font-medium">{stats?.total_wins || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Losing Sessions:</span>
                  <span className="text-red-400 font-medium">
                    {(stats?.games_played || 0) - (stats?.total_wins || 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Overall Status:</span>
                  <span
                    className={`font-medium ${
                      (stats?.all_time_profit_loss || 0) > 0
                        ? "text-green-400"
                        : (stats?.all_time_profit_loss || 0) < 0
                          ? "text-red-400"
                          : "text-slate-400"
                    }`}
                  >
                    {(stats?.all_time_profit_loss || 0) > 0
                      ? "Profitable"
                      : (stats?.all_time_profit_loss || 0) < 0
                        ? "Down"
                        : "Break Even"}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default StatsPage
