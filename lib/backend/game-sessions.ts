import { createClient } from "@/lib/supabase/server"
import type { GameSession } from "@/types"

/**
 * Save game session to database with proper validation
 */
export async function saveGameSession(session: GameSession): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: "Authentication required" }
    }

    const insertData = {
      id: session.id,
      user_id: user.id,
      name: session.name,
      start_time: session.startTime,
      end_time: session.endTime,
      status: session.status,
      point_to_cash_rate: session.pointToCashRate,
      players_data: session.playersInGame,
      invited_users: session.invitedUsers || [],
      game_metadata: {
        standardBuyInAmount: session.standardBuyInAmount,
      },
    }

    const { error } = await supabase.from("game_sessions").insert(insertData)

    if (error) {
      return { success: false, error: `Failed to save game session: ${error.message}` }
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}

/**
 * Update game session in database
 */
export async function updateGameSession(session: GameSession): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: "Authentication required" }
    }

    const updateData = {
      name: session.name,
      end_time: session.endTime,
      status: session.status,
      point_to_cash_rate: session.pointToCashRate,
      players_data: session.playersInGame,
      invited_users: session.invitedUsers || [],
      game_metadata: {
        standardBuyInAmount: session.standardBuyInAmount,
      },
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from("game_sessions")
      .update(updateData)
      .eq("id", session.id)
      .eq("user_id", user.id)

    if (error) {
      return { success: false, error: `Failed to update game session: ${error.message}` }
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}

/**
 * Load user's game sessions (owned and invited)
 */
export async function loadUserGameSessions() {
  const supabase = await createClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: "Authentication required" }
    }

    // Load owned games
    const { data: ownedGames, error: ownedError } = await supabase
      .from("game_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (ownedError) {
      return { data: null, error: `Failed to load owned games: ${ownedError.message}` }
    }

    // Load invited games
    const { data: invitedGames, error: invitedError } = await supabase
      .from("game_invitations")
      .select(`
        game_session:game_sessions(*)
      `)
      .eq("invitee_id", user.id)
      .eq("status", "accepted")

    if (invitedError) {
      return { data: null, error: `Failed to load invited games: ${invitedError.message}` }
    }

    // Combine and deduplicate
    const allGamesMap = new Map()

    // Add owned games
    ownedGames?.forEach((session) => {
      allGamesMap.set(session.id, { ...session, isOwner: true })
    })

    // Add invited games (don't override owned games)
    invitedGames?.forEach((inv) => {
      if (inv.game_session && !allGamesMap.has(inv.game_session.id)) {
        allGamesMap.set(inv.game_session.id, { ...inv.game_session, isOwner: false })
      }
    })

    const combinedSessions = Array.from(allGamesMap.values())

    return { data: combinedSessions, error: null }
  } catch (error) {
    return {
      data: null,
      error: `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}
