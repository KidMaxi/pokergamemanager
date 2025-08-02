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

/**
 * Calculate game session statistics for a player
 * Handles all edge cases including break-even scenarios
 */
export function calculateGameSessionStats(
  player: PlayerInGame,
  gameStartTime: string,
  gameEndTime?: string,
): GameSessionStats {
  // Calculate total buy-in (sum of all buy-ins for this player)
  const totalBuyIn = player.buyIns.reduce((sum, buyIn) => sum + buyIn.amount, 0)

  // Get cash-out amount (0 if player didn't cash out)
  const totalCashOut = player.cashOutAmount || 0

  // Calculate profit/loss (can be positive, negative, or zero for break-even)
  const profitLoss = totalCashOut - totalBuyIn

  // Calculate session length in minutes
  let sessionLengthMinutes = 0
  if (gameEndTime && gameStartTime) {
    const startTime = new Date(gameStartTime)
    const endTime = new Date(gameEndTime)
    const diffMs = endTime.getTime() - startTime.getTime()
    sessionLengthMinutes = Math.max(0, Math.round(diffMs / (1000 * 60)))
  }

  console.log("📊 Calculated game session stats:", {
    playerId: player.playerId,
    playerName: player.name,
    totalBuyIn,
    totalCashOut,
    profitLoss,
    sessionLengthMinutes,
    isWin: profitLoss > 0,
    isLoss: profitLoss < 0,
    isBreakEven: profitLoss === 0,
  })

  return {
    totalBuyIn,
    totalCashOut,
    profitLoss,
    sessionLengthMinutes,
  }
}

/**
 * Update user statistics after a game is completed
 * Foolproof function that handles all edge cases
 */
export async function updateUserStatisticsAfterGame(
  userId: string,
  gameStats: GameSessionStats,
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log("📊 Updating user statistics:", { userId, gameStats })

    // Validate input parameters
    if (!userId) {
      console.error("Invalid userId:", userId)
      return { success: false, error: "User ID is required" }
    }

    if (gameStats.totalBuyIn < 0) {
      console.error("Invalid totalBuyIn:", gameStats.totalBuyIn)
      return { success: false, error: "Total buy-in cannot be negative" }
    }

    if (gameStats.totalCashOut < 0) {
      console.error("Invalid totalCashOut:", gameStats.totalCashOut)
      return { success: false, error: "Total cash-out cannot be negative" }
    }

    if (gameStats.sessionLengthMinutes < 0) {
      console.error("Invalid sessionLengthMinutes:", gameStats.sessionLengthMinutes)
      return { success: false, error: "Session length cannot be negative" }
    }

    // Call the database function with the correct parameter order
    console.log("🔄 Calling database function with parameters:", {
      p_user_id: userId,
      p_total_buy_in: gameStats.totalBuyIn,
      p_total_cash_out: gameStats.totalCashOut,
      p_session_length_minutes: gameStats.sessionLengthMinutes,
    })

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
      console.error("Database function returned false")
      return { success: false, error: "Database function returned false - check server logs" }
    }

    console.log("✅ User statistics updated successfully, function returned:", data)

    // Verify the update by fetching the updated statistics
    const updatedStats = await getUserStatistics(userId)
    if (updatedStats) {
      console.log("📈 Updated statistics:", {
        totalGames: updatedStats.total_games_played,
        netProfitLoss: updatedStats.net_profit_loss,
        winRate: updatedStats.win_rate,
        roi: updatedStats.roi,
      })
    }

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
    console.log("📊 Fetching user statistics for:", userId)

    const { data, error } = await supabase.rpc("get_user_statistics", {
      p_user_id: userId,
    })

    if (error) {
      console.error("Error fetching user statistics:", error)
      return null
    }

    if (!data || data.length === 0) {
      console.log("No statistics found for user:", userId)
      return null
    }

    console.log("✅ Retrieved user statistics:", data[0])
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
 * Ensure user statistics record exists for a user
 */
export async function ensureUserStatisticsExist(userId: string): Promise<boolean> {
  try {
    console.log("🔍 Ensuring user statistics exist for:", userId)

    // Check if statistics record exists
    const { data: existing, error: checkError } = await supabase
      .from("user_statistics")
      .select("id, total_games_played")
      .eq("user_id", userId)
      .single()

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 is "not found" error, which is expected if no record exists
      console.error("Error checking user statistics:", checkError)
      return false
    }

    // If record doesn't exist, create it
    if (!existing) {
      console.log("📝 Creating user statistics record for:", userId)

      const { error: insertError } = await supabase.from("user_statistics").insert({
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

      if (insertError) {
        console.error("Error creating user statistics record:", insertError)
        return false
      }

      console.log("✅ Created user statistics record for:", userId)
    } else {
      console.log("✅ User statistics record already exists for:", userId, "with", existing.total_games_played, "games")
    }

    return true
  } catch (error) {
    console.error("Error ensuring user statistics exist:", error)
    return false
  }
}

/**
 * Debug function to check if statistics are being collected
 */
export async function debugUserStatistics(userId: string): Promise<void> {
  try {
    console.log("🔍 DEBUG: Checking user statistics for:", userId)

    // Check if user statistics record exists
    const { data: stats, error: statsError } = await supabase
      .from("user_statistics")
      .select("*")
      .eq("user_id", userId)
      .single()

    if (statsError) {
      console.log("❌ No user statistics record found:", statsError.message)
      return
    }

    console.log("📊 Current user statistics:", {
      totalGames: stats.total_games_played,
      totalBuyIns: stats.total_buy_ins,
      totalCashOuts: stats.total_cash_outs,
      netProfitLoss: stats.net_profit_loss,
      biggestWin: stats.biggest_win,
      biggestLoss: stats.biggest_loss,
      winRate: stats.win_rate,
      roi: stats.roi,
      avgSessionLength: stats.average_session_length_minutes,
      totalSessionHours: stats.total_session_time_hours,
      lastUpdated: stats.updated_at,
    })

    // Check recent game sessions for this user
    const { data: sessions, error: sessionsError } = await supabase
      .from("game_sessions")
      .select("id, name, status, players_data, end_time")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(5)

    if (sessionsError) {
      console.log("❌ Error fetching recent sessions:", sessionsError.message)
      return
    }

    console.log("🎮 Recent completed games:", sessions?.length || 0)
    sessions?.forEach((session, index) => {
      console.log(`Game ${index + 1}:`, {
        id: session.id,
        name: session.name,
        status: session.status,
        endTime: session.end_time,
        playersCount: Array.isArray(session.players_data) ? session.players_data.length : 0,
      })
    })
  } catch (error) {
    console.error("Error in debug function:", error)
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
