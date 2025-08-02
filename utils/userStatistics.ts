import { supabase } from "../lib/supabase"
import type { PlayerInGame } from "../types"

export interface GameSessionStats {
  totalBuyIn: number
  totalCashOut: number
  profitLoss: number
  sessionLengthMinutes: number
}

export interface UserStatistics {
  userId: string
  totalGamesPlayed: number
  totalBuyIns: number
  totalCashOuts: number
  netProfitLoss: number
  biggestWin: number
  biggestLoss: number
  winRate: number
  roi: number
  averageSessionLengthMinutes: number
  totalSessionTimeHours: number
  profitPerHour: number
  createdAt: string
  updatedAt: string
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
  let sessionLengthMinutes = 0
  if (gameEndTime) {
    const startTime = new Date(gameStartTime)
    const endTime = new Date(gameEndTime)
    sessionLengthMinutes = Math.max(0, Math.floor((endTime.getTime() - startTime.getTime()) / (1000 * 60)))
  }

  return {
    totalBuyIn,
    totalCashOut,
    profitLoss,
    sessionLengthMinutes,
  }
}

/**
 * Update user statistics after a game is completed
 */
export async function updateUserStatisticsAfterGame(
  userId: string,
  gameStats: GameSessionStats,
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log("📊 Updating user statistics:", { userId, gameStats })

    // Call the database function with correct parameter order
    const { data, error } = await supabase.rpc("update_user_statistics_after_game", {
      p_user_id: userId,
      p_total_buy_in: gameStats.totalBuyIn,
      p_total_cash_out: gameStats.totalCashOut,
      p_session_length_minutes: gameStats.sessionLengthMinutes,
    })

    if (error) {
      console.error("Database function error:", error)
      return { success: false, error: error.message }
    }

    if (data === false) {
      return { success: false, error: "Function returned false" }
    }

    console.log("✅ User statistics updated successfully")
    return { success: true }
  } catch (error: any) {
    console.error("Error updating user statistics:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Get user statistics
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

    if (!data || data.length === 0) {
      return null
    }

    return data[0] as UserStatistics
  } catch (error) {
    console.error("Error fetching user statistics:", error)
    return null
  }
}

/**
 * Get statistics leaderboard
 */
export async function getStatisticsLeaderboard(metric = "net_profit_loss", limit = 10): Promise<any[]> {
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
 * Ensure user statistics record exists
 */
export async function ensureUserStatisticsExist(userId: string): Promise<void> {
  try {
    // Insert a default record if it doesn't exist
    const { error } = await supabase.from("user_statistics").insert({ user_id: userId }).select().single()

    // Ignore conflict errors (record already exists)
    if (error && !error.message.includes("duplicate key")) {
      console.error("Error ensuring user statistics exist:", error)
    }
  } catch (error) {
    console.error("Error ensuring user statistics exist:", error)
  }
}

/**
 * Migrate existing profile stats to user statistics
 */
export async function migrateProfileStatsToUserStatistics(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc("migrate_profile_stats_to_user_statistics")

    if (error) {
      console.error("Error migrating profile stats:", error)
      return 0
    }

    return data || 0
  } catch (error) {
    console.error("Error migrating profile stats:", error)
    return 0
  }
}

/**
 * Format currency values for display
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

/**
 * Format percentage values for display
 */
export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`
}

/**
 * Format duration in minutes to human readable format
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60

  if (hours > 0) {
    return `${hours}h ${mins}m`
  }
  return `${mins}m`
}

/**
 * Format hours to human readable format
 */
export function formatHours(hours: number): string {
  if (hours === 1) {
    return "1 hour"
  }
  return `${hours} hours`
}
