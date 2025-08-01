import { supabase } from "../lib/supabase"
import type { GameSession } from "../types"

export interface ParticipantInfo {
  playerId: string
  name: string
  profileId?: string
  email?: string
  isRegisteredUser: boolean
  stats?: {
    allTimeProfitLoss: number
    gamesPlayed: number
  }
}

/**
 * Resolves participant information by matching player names with user profiles
 */
export async function resolveGameParticipants(session: GameSession): Promise<ParticipantInfo[]> {
  try {
    console.log("🔍 Resolving participants for game:", session.id)

    const participants: ParticipantInfo[] = []

    // Get all player names from the game
    const playerNames = session.playersInGame.map((p) => p.name.toLowerCase().trim())

    if (playerNames.length === 0) {
      console.log("No players in game yet")
      return participants
    }

    // Query profiles that match player names (case-insensitive)
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, all_time_profit_loss, games_played")
      .or(playerNames.map((name) => `full_name.ilike.${name}`).join(","))

    if (error) {
      console.error("Error fetching participant profiles:", error)
      // Return basic info without profile data
      return session.playersInGame.map((player) => ({
        playerId: player.playerId,
        name: player.name,
        isRegisteredUser: false,
      }))
    }

    console.log("Found profiles:", profiles?.length || 0)

    // Match players with profiles
    for (const player of session.playersInGame) {
      const matchingProfile = profiles?.find(
        (profile) => profile.full_name?.toLowerCase().trim() === player.name.toLowerCase().trim(),
      )

      const participantInfo: ParticipantInfo = {
        playerId: player.playerId,
        name: player.name,
        isRegisteredUser: !!matchingProfile,
      }

      if (matchingProfile) {
        participantInfo.profileId = matchingProfile.id
        participantInfo.email = matchingProfile.email
        participantInfo.stats = {
          allTimeProfitLoss: matchingProfile.all_time_profit_loss || 0,
          gamesPlayed: matchingProfile.games_played || 0,
        }
      }

      participants.push(participantInfo)
    }

    console.log("Resolved participants:", participants.length)
    return participants
  } catch (error) {
    console.error("Error resolving game participants:", error)
    // Return basic info as fallback
    return session.playersInGame.map((player) => ({
      playerId: player.playerId,
      name: player.name,
      isRegisteredUser: false,
    }))
  }
}

/**
 * Gets detailed game information including participant profiles
 */
export async function getGameWithParticipants(gameId: string) {
  try {
    const { data, error } = await supabase.rpc("get_game_participants", {
      game_session_id: gameId,
    })

    if (error) {
      console.error("Error getting game participants:", error)
      return null
    }

    return data
  } catch (error) {
    console.error("Error calling get_game_participants:", error)
    return null
  }
}

/**
 * Validates that a user can join a game (no duplicate names)
 */
export function canUserJoinGame(session: GameSession, userName: string): { canJoin: boolean; reason?: string } {
  const normalizedUserName = userName.toLowerCase().trim()

  // Check if a player with this name already exists
  const existingPlayer = session.playersInGame.find((player) => player.name.toLowerCase().trim() === normalizedUserName)

  if (existingPlayer) {
    return {
      canJoin: false,
      reason: `A player named "${userName}" is already in this game`,
    }
  }

  // Check if game is still accepting players
  if (session.status !== "active") {
    return {
      canJoin: false,
      reason: "This game is no longer accepting new players",
    }
  }

  return { canJoin: true }
}
