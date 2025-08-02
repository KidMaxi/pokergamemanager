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
  total_session_time_minutes: number
  profit_per_hour: number
  favorite_buy_in_amount: number
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
  const totalCashOut = player.cashOutAmount
  const profitLoss = totalCashOut - totalBuyIn

  // Calculate session length in minutes
  let sessionLengthMinutes = 0
  if (gameEndTime) {
    const startTime = new Date(gameStartTime)
    const endTime = new Date(gameEndTime)
    sessionLengthMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60))
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

    const { data, error } = await supabase.rpc("update_user_statistics_after_game", {
      p_user_id: userId,
      p_total_buy_in: gameStats.totalBuyIn,
      p_total_cash_out: gameStats.totalCashOut,
      p_session_length_minutes: gameStats.sessionLengthMinutes,
    })

    if (error) {
      console.error("Error updating user statistics:", error)
      return { success: false, error: error.message }
    }

    console.log("✅ User statistics updated successfully")
    return { success: true }
  } catch (error) {
    console.error("Error updating user statistics:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

/**
 * Get comprehensive user statistics
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
 * Ensure user statistics record exists for a user
 */
export async function ensureUserStatisticsExist(userId: string): Promise<boolean> {
  try {
    // Check if statistics record exists
    const { data: existing, error: checkError } = await supabase
      .from("user_statistics")
      .select("id")
      .eq("user_id", userId)
      .single()

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 is "not found" error, which is expected if no record exists
      console.error("Error checking user statistics:", checkError)
      return false
    }

    // If record doesn't exist, create it
    if (!existing) {
      const { error: insertError } = await supabase.from("user_statistics").insert({
        user_id: userId,
      })

      if (insertError) {
        console.error("Error creating user statistics record:", insertError)
        return false
      }

      console.log("✅ Created user statistics record for:", userId)
    }

    return true
  } catch (error) {
    console.error("Error ensuring user statistics exist:", error)
    return false
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
