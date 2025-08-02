"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { supabase } from "../lib/supabase"
import Card from "./common/Card"
import WinrateDisplay from "./WinrateDisplay"
import { formatCurrency } from "../utils"

interface LeaderboardUser {
  id: string
  full_name: string
  games_played: number
  total_wins: number
  win_ratio: number
  all_time_profit_loss: number
  avg_profit_per_game: number
}

const WinrateLeaderboard: React.FC = () => {
  const [users, setUsers] = useState<LeaderboardUser[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"winrate" | "profit">("winrate")

  useEffect(() => {
    fetchLeaderboardData()
  }, [])

  const fetchLeaderboardData = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from("user_stats_with_winrate")
        .select("*")
        .gte("games_played", 3) // Only show users with at least 3 games
        .order(activeTab === "winrate" ? "win_ratio" : "all_time_profit_loss", { ascending: false })
        .limit(10)

      if (error) {
        console.error("Error fetching leaderboard:", error)
        return
      }

      setUsers(data || [])
    } catch (error) {
      console.error("Error fetching leaderboard:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLeaderboardData()
  }, [activeTab])

  if (loading) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary mx-auto mb-4"></div>
            <p className="text-text-secondary">Loading leaderboard...</p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4">
      <Card>
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-brand-primary mb-2">🏆 Poker Leaderboard</h2>
            <p className="text-text-secondary">Top players with 3+ games</p>
          </div>

          {/* Tab Navigation */}
          <div className="flex justify-center space-x-4">
            <button
              onClick={() => setActiveTab("winrate")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === "winrate"
                  ? "bg-brand-primary text-white"
                  : "bg-surface-secondary text-text-secondary hover:bg-surface-tertiary"
              }`}
            >
              Win Rate Leaders
            </button>
            <button
              onClick={() => setActiveTab("profit")}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === "profit"
                  ? "bg-brand-primary text-white"
                  : "bg-surface-secondary text-text-secondary hover:bg-surface-tertiary"
              }`}
            >
              Profit Leaders
            </button>
          </div>

          {/* Leaderboard List */}
          <div className="space-y-3">
            {users.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-text-secondary">No players found with 3+ games</p>
              </div>
            ) : (
              users.map((user, index) => (
                <div
                  key={user.id}
                  className={`flex items-center justify-between p-4 rounded-lg ${
                    index === 0
                      ? "bg-yellow-500/10 border border-yellow-500/20"
                      : index === 1
                        ? "bg-gray-500/10 border border-gray-500/20"
                        : index === 2
                          ? "bg-orange-500/10 border border-orange-500/20"
                          : "bg-surface-secondary"
                  }`}
                >
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      <span
                        className={`text-2xl font-bold ${
                          index === 0
                            ? "text-yellow-400"
                            : index === 1
                              ? "text-gray-400"
                              : index === 2
                                ? "text-orange-400"
                                : "text-text-secondary"
                        }`}
                      >
                        #{index + 1}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-text-primary">{user.full_name || "Anonymous Player"}</h3>
                      <p className="text-sm text-text-secondary">
                        {user.games_played} games • {user.total_wins} wins
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    {activeTab === "winrate" ? (
                      <div>
                        <WinrateDisplay winRate={user.win_ratio} showLabel={false} className="text-lg" />
                        <p className="text-sm text-text-secondary">{formatCurrency(user.avg_profit_per_game)}/game</p>
                      </div>
                    ) : (
                      <div>
                        <p
                          className={`text-lg font-semibold ${
                            user.all_time_profit_loss >= 0 ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {user.all_time_profit_loss >= 0 ? "+" : ""}
                          {formatCurrency(user.all_time_profit_loss)}
                        </p>
                        <WinrateDisplay winRate={user.win_ratio} showLabel={false} className="text-sm" />
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}

export default WinrateLeaderboard
