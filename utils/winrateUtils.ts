import { supabase } from "../lib/supabase"

export interface WinrateStats {
  games_played: number
  total_wins: number
  win_ratio: number
  all_time_profit_loss: number
  avg_profit_per_game: number
}

export const formatWinRate = (winRate: number): string => {
  if (winRate === null || winRate === undefined || isNaN(winRate)) {
    return "0.0%"
  }
  return `${winRate.toFixed(1)}%`
}

export const getWinRateColor = (winRate: number): string => {
  if (winRate >= 70) return "text-green-400"
  if (winRate >= 50) return "text-yellow-400"
  return "text-red-400"
}

export const debugUserWinrateStats = async (userId: string): Promise<void> => {
  try {
    console.log("🎯 Debugging winrate stats for user:", userId)

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, games_played, total_wins, win_ratio, all_time_profit_loss")
      .eq("id", userId)
      .single()

    if (error) {
      console.error("❌ Error fetching user stats:", error)
      return
    }

    if (!data) {
      console.log("❌ No user found with ID:", userId)
      return
    }

    console.log("📊 Current User Stats:", {
      name: data.full_name,
      gamesPlayed: data.games_played,
      totalWins: data.total_wins,
      winRatio: data.win_ratio,
      profitLoss: data.all_time_profit_loss,
      calculatedWinRate: data.games_played > 0 ? ((data.total_wins / data.games_played) * 100).toFixed(2) : "0.00",
    })
  } catch (error) {
    console.error("❌ Error in debugUserWinrateStats:", error)
  }
}

export const recalculateAllWinRatios = async (): Promise<{ success: boolean; count?: number; error?: string }> => {
  try {
    console.log("🔄 Starting recalculation of all win ratios...")

    const { data, error } = await supabase.rpc("recalculate_all_win_ratios")

    if (error) {
      console.error("❌ Error recalculating win ratios:", error)
      return { success: false, error: error.message }
    }

    console.log("✅ Recalculation result:", data)
    return { success: data.success, count: data.updated_count }
  } catch (error) {
    console.error("❌ Error in recalculateAllWinRatios:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

export const getUserWinrateStats = async (userId: string): Promise<WinrateStats | null> => {
  try {
    const { data, error } = await supabase.from("user_stats_with_winrate").select("*").eq("id", userId).single()

    if (error || !data) {
      console.log("No winrate stats found for user:", userId)
      return null
    }

    return {
      games_played: data.games_played || 0,
      total_wins: data.total_wins || 0,
      win_ratio: data.win_ratio || 0,
      all_time_profit_loss: data.all_time_profit_loss || 0,
      avg_profit_per_game: data.avg_profit_per_game || 0,
    }
  } catch (error) {
    console.error("Error fetching user winrate stats:", error)
    return null
  }
}
