"use server"

import { supabase } from "../lib/supabase"

export async function acceptGameInvitation(invitationId: string) {
  try {
    // Get the current session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session?.user) {
      console.error("Authentication error:", sessionError)
      return {
        success: false,
        error: "Not authenticated. Please sign in and try again.",
      }
    }

    const userId = session.user.id

    // First, get the invitation details
    const { data: invitation, error: inviteError } = await supabase
      .from("game_invitations")
      .select(`
        id,
        game_session_id,
        inviter_id,
        invitee_id,
        status,
        game_session:game_sessions(
          id,
          name,
          status,
          user_id
        )
      `)
      .eq("id", invitationId)
      .eq("invitee_id", userId)
      .eq("status", "pending")
      .single()

    if (inviteError || !invitation) {
      console.error("Error fetching invitation:", inviteError)
      return {
        success: false,
        error: "Invitation not found or already processed.",
      }
    }

    // Check if the game is still active
    if (invitation.game_session?.status !== "active") {
      return {
        success: false,
        error: "This game is no longer active and cannot be joined.",
      }
    }

    // Update the invitation status to accepted
    const { error: updateError } = await supabase
      .from("game_invitations")
      .update({
        status: "accepted",
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitationId)
      .eq("invitee_id", userId)

    if (updateError) {
      console.error("Error updating invitation:", updateError)
      return {
        success: false,
        error: "Failed to accept invitation. Please try again.",
      }
    }

    return {
      success: true,
      gameId: invitation.game_session_id,
      gameName: invitation.game_session?.name || "Unknown Game",
    }
  } catch (error) {
    console.error("Unexpected error accepting invitation:", error)
    return {
      success: false,
      error: "An unexpected error occurred. Please try again.",
    }
  }
}

export async function declineGameInvitation(invitationId: string) {
  try {
    // Get the current session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session?.user) {
      console.error("Authentication error:", sessionError)
      return {
        success: false,
        error: "Not authenticated. Please sign in and try again.",
      }
    }

    const userId = session.user.id

    // Update the invitation status to declined
    const { error: updateError } = await supabase
      .from("game_invitations")
      .update({
        status: "declined",
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitationId)
      .eq("invitee_id", userId)
      .eq("status", "pending")

    if (updateError) {
      console.error("Error declining invitation:", updateError)
      return {
        success: false,
        error: "Failed to decline invitation. Please try again.",
      }
    }

    return { success: true }
  } catch (error) {
    console.error("Unexpected error declining invitation:", error)
    return {
      success: false,
      error: "An unexpected error occurred. Please try again.",
    }
  }
}

export async function getGameInvitations() {
  try {
    // Get the current session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session?.user) {
      console.error("Authentication error:", sessionError)
      return {
        success: false,
        error: "Not authenticated. Please sign in and try again.",
        invitations: [],
      }
    }

    const userId = session.user.id

    // Get pending invitations for the current user
    const { data: invitations, error } = await supabase
      .from("game_invitations")
      .select(`
        id,
        game_session_id,
        inviter_id,
        status,
        created_at,
        game_session:game_sessions(
          id,
          name,
          start_time,
          status
        ),
        inviter_profile:profiles!game_invitations_inviter_id_fkey(
          full_name,
          email
        )
      `)
      .eq("invitee_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching invitations:", error)
      return {
        success: false,
        error: "Failed to load invitations. Please try again.",
        invitations: [],
      }
    }

    return {
      success: true,
      invitations: invitations || [],
    }
  } catch (error) {
    console.error("Unexpected error fetching invitations:", error)
    return {
      success: false,
      error: "An unexpected error occurred. Please try again.",
      invitations: [],
    }
  }
}
