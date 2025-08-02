import { supabase } from "../lib/supabase"
import type { PlayerInGame } from "../types"

export interface GameSessionStats {
  totalBuyIn: number
  totalCashOut: number
  profitLoss: number
  sessionLengthMinutes: number
}

export interface UserStatistics {
  user_id: string
  total_games_played: number
  total_buy_ins: number
  total_cash_outs: number
  net_profit_loss: number
  biggest_win: number
  biggest_loss: number
  win_rate: number
  roi: number
  average_session_length_minutes: number
  total_session_time_hours: number
  profit_per_hour: number
  created_at: string
  updated_at: string
}

export interface LeaderboardEntry {
  user_id: string
  full_name: string
  email: string
  metric_value: number
  total_games_played: number
  win_rate: number
}

/**
 * Calculate game session statistics for a player
 */
export function calculateGameSessionStats(
  player: PlayerInGame,
  gameStartTime: string,
  gameEndTime?: string,
): GameSessionStats {
  const totalBuyIn = player.buyIns.reduce((sum, buyIn) => sum + buyIn.amount, 0)
  const totalCashOut = player.cashOutAmount || 0
  const profitLoss = totalCashOut - totalBuyIn

  // Calculate session length in minutes
  const startTime = new Date(gameStartTime)
  const endTime = gameEndTime ? new Date(gameEndTime) : new Date()
  const sessionLengthMinutes = Math.max(1, Math.floor((endTime.getTime() - startTime.getTime()) / (1000 * 60)))

  return {
    totalBuyIn,
    totalCashOut,
    profitLoss,
    sessionLengthMinutes,
  }
}

/**
 * Update user statistics after a game completes
 */
export async function updateUserStatisticsAfterGame(
  userId: string,
  gameStats: GameSessionStats,
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log("📊 Updating user statistics:", {
      userId,
      gameStats,
    })

    const { data, error } = await supabase.rpc("update_user_statistics_after_game", {
      p_user_id: userId,
      p_total_buy_in: gameStats.totalBuyIn,
      p_total_cash_out: gameStats.totalCashOut,
      p_session_length_minutes: gameStats.sessionLengthMinutes,
    })

    if (error) {
      console.error("❌ Database function error:", error)
      return { success: false, error: error.message }
    }

    if (data === false) {
      console.error("❌ Database function returned false - check server logs")
      return { success: false, error: "Database function returned false - check server logs" }
    }

    console.log("✅ User statistics updated successfully")
    return { success: true }
  } catch (error: any) {
    console.error("❌ Error updating user statistics:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Get user statistics with calculated fields
 */
export async function getUserStatistics(userId: string): Promise<UserStatistics | null> {
  try {
    const { data, error } = await supabase.rpc("get_user_statistics", {
      p_user_id: userId,
    })

    if (error) {
      console.error("Error fetching user statistics:", error)
      return null
    }

    return data?.[0] || null
  } catch (error) {
    console.error("Error fetching user statistics:", error)
    return null
  }
}

/**
 * Get statistics leaderboard
 */
export async function getStatisticsLeaderboard(metric = "net_profit_loss", limit = 10): Promise<LeaderboardEntry[]> {
  try {
    const { data, error } = await supabase.rpc("get_statistics_leaderboard", {
      p_metric: metric,
      p_limit: limit,
    })

    if (error) {
      console.error("Error fetching leaderboard:", error)
      return []
    }

    return data || []
  } catch (error) {
    console.error("Error fetching leaderboard:", error)
    return []
  }
}

/**
 * Ensure user statistics record exists for a user
 */
export async function ensureUserStatisticsExist(userId: string): Promise<boolean> {
  try {
    // Check if user statistics already exist
    const { data: existingStats } = await supabase.from("user_statistics").select("id").eq("user_id", userId).single()

    if (existingStats) {
      console.log("✅ User statistics already exist for user:", userId)
      return true
    }

    // Create initial user statistics record
    const { error } = await supabase.from("user_statistics").insert({
      user_id: userId,
      total_games_played: 0,
      total_buy_ins: 0,
      total_cash_outs: 0,
      net_profit_loss: 0,
      biggest_win: 0,
      biggest_loss: 0,
      win_rate: 0,
      roi: 0,
      average_session_length_minutes: 0,
      total_session_time_hours: 0,
    })

    if (error) {
      console.error("❌ Error creating user statistics:", error)
      return false
    }

    console.log("✅ Created initial user statistics for user:", userId)
    return true
  } catch (error) {
    console.error("❌ Error ensuring user statistics exist:", error)
    return false
  }
}

/**
 * Debug function to log current user statistics
 */
export async function debugUserStatistics(userId: string): Promise<void> {
  try {
    const stats = await getUserStatistics(userId)
    console.log("🔍 Current user statistics for", userId, ":", stats)
  } catch (error) {
    console.error("❌ Error debugging user statistics:", error)
  }
}

/**
 * Migrate existing profile stats to user_statistics table
 */
export async function migrateProfileStatsToUserStatistics(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc("migrate_profile_stats_to_user_statistics")

    if (error) {
      console.error("Error migrating profile stats:", error)
      return 0
    }

    console.log(`✅ Migrated ${data} user profiles to user_statistics table`)
    return data || 0
  } catch (error) {
    console.error("Error migrating profile stats:", error)
    return 0
  }
}
