import { supabase } from "./supabase"
import type { GameSession } from "../types"

export async function finalizeGameWithComprehensiveTracking(session: GameSession) {
  console.log("[v0] Starting comprehensive game finalization for:", session.id)
  console.log("[v0] Players in game:", session.playersInGame.length)

  try {
    // Save all player results using the new comprehensive function
    const { error: saveError } = await supabase.rpc("save_all_player_results", {
      game_session_id: session.id,
      players_data: session.playersInGame,
    })

    if (saveError) {
      console.error("[v0] Error saving player results:", saveError)
      throw saveError
    }

    console.log("[v0] Successfully saved results for all players (including floating players)")

    // Update the game session status to completed
    const { error: updateError } = await supabase
      .from("game_sessions")
      .update({
        status: "completed",
        end_time: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id)

    if (updateError) {
      console.error("[v0] Error updating game session:", updateError)
      throw updateError
    }

    console.log("[v0] Game finalization completed successfully")

    return {
      success: true,
      message: "Game finalized and all player statistics updated",
    }
  } catch (error) {
    console.error("[v0] Game finalization failed:", error)
    return {
      success: false,
      error: error.message || "Failed to finalize game",
    }
  }
}

// Enhanced function to get floating player statistics
export async function getFloatingPlayerStats(playerName: string, localPlayerId?: string) {
  try {
    console.log("[v0] Getting stats for floating player:", { playerName, localPlayerId })

    // Use the new comprehensive statistics function
    const identifier = localPlayerId || playerName
    const identifierType = localPlayerId ? "local_id" : "name"

    const { data, error } = await supabase.rpc("get_player_statistics", {
      player_identifier: identifier,
      identifier_type: identifierType,
    })

    if (error) {
      console.error("[v0] Error getting floating player stats:", error)
      return null
    }

    console.log("[v0] Floating player stats retrieved:", data)
    return data[0] || null
  } catch (error) {
    console.error("[v0] Error in getFloatingPlayerStats:", error)
    return null
  }
}

// Function to check if a player name matches an existing account
export async function checkPlayerAccountMatch(playerName: string) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .ilike("full_name", playerName.trim())
      .limit(1)

    if (error) {
      console.error("[v0] Error checking player account match:", error)
      return null
    }

    return data[0] || null
  } catch (error) {
    console.error("[v0] Error in checkPlayerAccountMatch:", error)
    return null
  }
}
