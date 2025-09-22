import { createClient } from "@/lib/supabase/server"

export interface GameInviteData {
  gameSessionId: string
  inviterName: string
  gameName: string
  invitedUserIds: string[]
}

export interface InviteResponse {
  success: boolean
  invitesSent: number
  errors: string[]
}

/**
 * Send game invitations to multiple users
 */
export async function sendGameInvitations(data: GameInviteData): Promise<InviteResponse> {
  const supabase = await createClient()
  const response: InviteResponse = {
    success: false,
    invitesSent: 0,
    errors: [],
  }

  try {
    // Verify the game session exists and user has permission
    const { data: gameSession, error: gameError } = await supabase
      .from("game_sessions")
      .select("id, name, user_id")
      .eq("id", data.gameSessionId)
      .single()

    if (gameError || !gameSession) {
      response.errors.push("Game session not found or access denied")
      return response
    }

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      response.errors.push("Authentication required")
      return response
    }

    // Verify user owns the game
    if (gameSession.user_id !== user.id) {
      response.errors.push("Only game owner can send invitations")
      return response
    }

    // Prepare invitations
    const invitations = data.invitedUserIds.map((inviteeId) => ({
      game_session_id: data.gameSessionId,
      inviter_id: user.id,
      invitee_id: inviteeId,
      status: "pending" as const,
    }))

    // Send invitations in batch
    const { data: insertedInvites, error: inviteError } = await supabase
      .from("game_invitations")
      .insert(invitations)
      .select()

    if (inviteError) {
      response.errors.push(`Failed to send invitations: ${inviteError.message}`)
      return response
    }

    // Update game session with invited users
    const { error: updateError } = await supabase
      .from("game_sessions")
      .update({
        invited_users: data.invitedUserIds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.gameSessionId)

    if (updateError) {
      response.errors.push("Failed to update game session")
    }

    response.success = true
    response.invitesSent = insertedInvites?.length || 0

    return response
  } catch (error) {
    response.errors.push(`Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`)
    return response
  }
}

/**
 * Accept a game invitation
 */
export async function acceptGameInvitation(invitationId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: "Authentication required" }
    }

    // Update invitation status
    const { error: updateError } = await supabase
      .from("game_invitations")
      .update({
        status: "accepted",
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitationId)
      .eq("invitee_id", user.id)
      .eq("status", "pending")

    if (updateError) {
      return { success: false, error: `Failed to accept invitation: ${updateError.message}` }
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
 * Get pending invitations for current user
 */
export async function getPendingInvitations() {
  const supabase = await createClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return { data: null, error: "Authentication required" }
    }

    const { data, error } = await supabase
      .from("game_invitations")
      .select(`
        id,
        created_at,
        game_session:game_sessions(
          id,
          name,
          start_time,
          status
        ),
        inviter:profiles!game_invitations_inviter_id_fkey(
          full_name
        )
      `)
      .eq("invitee_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })

    return { data, error }
  } catch (error) {
    return {
      data: null,
      error: `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}
