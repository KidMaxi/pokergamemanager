"use server"

import { createServerComponentClient } from "@/lib/supabase"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export async function sendGameInvitation(gameSessionId: string, friendEmail: string) {
  try {
    const supabase = createServerComponentClient()

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return { error: "Not authenticated" }
    }

    // Find the friend by email
    const { data: friend, error: friendError } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("email", friendEmail.trim().toLowerCase())
      .single()

    if (friendError || !friend) {
      return { error: "User not found with that email address" }
    }

    if (friend.id === user.id) {
      return { error: "You cannot invite yourself to a game" }
    }

    // Check if they are friends
    const { data: friendship } = await supabase
      .from("friendships")
      .select("id")
      .eq("user_id", user.id)
      .eq("friend_id", friend.id)
      .single()

    if (!friendship) {
      return { error: "You can only invite friends to games" }
    }

    // Check if invitation already exists
    const { data: existingInvitation } = await supabase
      .from("game_invitations")
      .select("id, status")
      .eq("game_session_id", gameSessionId)
      .eq("invitee_id", friend.id)
      .single()

    if (existingInvitation) {
      if (existingInvitation.status === "pending") {
        return { error: "Invitation already sent to this user" }
      } else if (existingInvitation.status === "accepted") {
        return { error: "User has already accepted an invitation to this game" }
      }
    }

    // Send the invitation
    const { error: inviteError } = await supabase.from("game_invitations").insert({
      game_session_id: gameSessionId,
      inviter_id: user.id,
      invitee_id: friend.id,
      status: "pending",
    })

    if (inviteError) {
      console.error("Error sending invitation:", inviteError)
      return { error: "Failed to send invitation" }
    }

    return { success: `Invitation sent to ${friend.full_name || friend.email}!` }
  } catch (error) {
    console.error("Error in sendGameInvitation:", error)
    return { error: "An unexpected error occurred" }
  }
}

export async function acceptGameInvitation(invitationId: string) {
  try {
    const supabase = createServerComponentClient()

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return { error: "Not authenticated" }
    }

    // Use the database function to accept the invitation
    const { error } = await supabase.rpc("accept_game_invitation", {
      invitation_id: invitationId,
    })

    if (error) {
      console.error("Error accepting invitation:", error)
      return { error: "Failed to accept invitation" }
    }

    revalidatePath("/")
    redirect("/")
  } catch (error) {
    console.error("Error in acceptGameInvitation:", error)
    return { error: "An unexpected error occurred" }
  }
}

export async function declineGameInvitation(invitationId: string) {
  try {
    const supabase = createServerComponentClient()

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return { error: "Not authenticated" }
    }

    // Use the database function to decline the invitation
    const { error } = await supabase.rpc("decline_game_invitation", {
      invitation_id: invitationId,
    })

    if (error) {
      console.error("Error declining invitation:", error)
      return { error: "Failed to decline invitation" }
    }

    revalidatePath("/")
    return { success: "Invitation declined" }
  } catch (error) {
    console.error("Error in declineGameInvitation:", error)
    return { error: "An unexpected error occurred" }
  }
}
