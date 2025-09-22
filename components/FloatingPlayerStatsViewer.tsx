"use client"

import type React from "react"
import { useState } from "react"
import { getFloatingPlayerStats, checkPlayerAccountMatch } from "../lib/finalize"
import { formatCurrency } from "../utils"
import Card from "./common/Card"
import Button from "./common/Button"
import Input from "./common/Input"

interface FloatingPlayerStats {
  total_games: number
  total_profit_loss: number
  total_buyins: number
  total_cashouts: number
  wins: number
  losses: number
  win_rate: number
  avg_profit_per_game: number
  biggest_win: number
  biggest_loss: number
  last_game_date: string
}

const FloatingPlayerStatsViewer: React.FC = () => {
  const [playerName, setPlayerName] = useState("")
  const [localPlayerId, setLocalPlayerId] = useState("")
  const [stats, setStats] = useState<FloatingPlayerStats | null>(null)
  const [accountMatch, setAccountMatch] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSearchStats = async () => {
    if (!playerName.trim() && !localPlayerId.trim()) {
      setError("Please enter either a player name or local player ID")
      return
    }

    setLoading(true)
    setError("")
    setStats(null)
    setAccountMatch(null)

    try {
      // Get floating player stats
      const playerStats = await getFloatingPlayerStats(playerName, localPlayerId)

      if (playerStats) {
        setStats(playerStats)

        // Check if this player matches an existing account
        if (playerName.trim()) {
          const match = await checkPlayerAccountMatch(playerName)
          setAccountMatch(match)
        }
      } else {
        setError("No statistics found for this player")
      }
    } catch (err) {
      console.error("Error fetching floating player stats:", err)
      setError("Failed to fetch player statistics")
    } finally {
      setLoading(false)
    }
  }

  const getStatsColor = (value: number) => {
    if (value > 0) return "text-green-400"
    if (value < 0) return "text-red-400"
    return "text-text-secondary"
  }

  return (
    <Card title="Floating Player Statistics Viewer" className="max-w-2xl mx-auto">
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Player Name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter player name"
          />
          <Input
            label="Local Player ID (Optional)"
            value={localPlayerId}
            onChange={(e) => setLocalPlayerId(e.target.value)}
            placeholder="local-xxxxx-xxxxx"
          />
        </div>

        <Button onClick={handleSearchStats} disabled={loading} className="w-full">
          {loading ? "Searching..." : "Search Player Stats"}
        </Button>

        {error && <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded p-3">{error}</div>}

        {accountMatch && (
          <div className="bg-blue-900/20 border border-blue-800 rounded p-3">
            <h4 className="text-blue-400 font-semibold mb-2">Account Match Found</h4>
            <p className="text-text-secondary text-sm">
              This player matches account: <span className="text-white">{accountMatch.full_name}</span> (
              {accountMatch.email})
            </p>
          </div>
        )}

        {stats && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-text-primary">Player Statistics</h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-surface-input rounded-lg">
                <div className="text-xl font-bold text-blue-400">{stats.total_games}</div>
                <div className="text-text-secondary text-sm">Total Games</div>
              </div>

              <div className="text-center p-3 bg-surface-input rounded-lg">
                <div className={`text-xl font-bold ${getStatsColor(stats.total_profit_loss)}`}>
                  {formatCurrency(stats.total_profit_loss)}
                </div>
                <div className="text-text-secondary text-sm">Total P/L</div>
              </div>

              <div className="text-center p-3 bg-surface-input rounded-lg">
                <div className="text-xl font-bold text-green-400">{stats.wins}</div>
                <div className="text-text-secondary text-sm">Wins</div>
              </div>

              <div className="text-center p-3 bg-surface-input rounded-lg">
                <div className="text-xl font-bold text-red-400">{stats.losses}</div>
                <div className="text-text-secondary text-sm">Losses</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-3 bg-surface-input rounded-lg">
                <div className="text-lg font-bold text-text-primary">{stats.win_rate.toFixed(1)}%</div>
                <div className="text-text-secondary text-sm">Win Rate</div>
              </div>

              <div className="text-center p-3 bg-surface-input rounded-lg">
                <div className={`text-lg font-bold ${getStatsColor(stats.avg_profit_per_game)}`}>
                  {formatCurrency(stats.avg_profit_per_game)}
                </div>
                <div className="text-text-secondary text-sm">Avg P/L per Game</div>
              </div>

              <div className="text-center p-3 bg-surface-input rounded-lg">
                <div className="text-lg font-bold text-text-primary">{formatCurrency(stats.total_buyins)}</div>
                <div className="text-text-secondary text-sm">Total Buy-ins</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="text-center p-3 bg-surface-input rounded-lg">
                <div className="text-lg font-bold text-green-400">{formatCurrency(stats.biggest_win)}</div>
                <div className="text-text-secondary text-sm">Biggest Win</div>
              </div>

              <div className="text-center p-3 bg-surface-input rounded-lg">
                <div className="text-lg font-bold text-red-400">{formatCurrency(stats.biggest_loss)}</div>
                <div className="text-text-secondary text-sm">Biggest Loss</div>
              </div>
            </div>

            {stats.last_game_date && (
              <div className="text-center p-3 bg-surface-input rounded-lg">
                <div className="text-text-secondary text-sm">
                  Last Game: <span className="text-white">{new Date(stats.last_game_date).toLocaleDateString()}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

export default FloatingPlayerStatsViewer
