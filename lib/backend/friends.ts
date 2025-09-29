import { createClient } from "@/lib/supabase/server"

export interface FriendRequest {
  id: string
  sender_id: string
  receiver_id: string
  status: string
  created_at: string
  sender_profile?: {
    full_name: string
    email: string
  }
}

/**
 * Send a friend request
 */
export async function sendFriendRequest(receiverEmail: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: "Authentication required" }
    }

    const normalizedEmail = receiverEmail.toLowerCase().trim()
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return { success: false, error: "Please enter a valid email address" }
    }

    // Find receiver by email
    const { data: receiver, error: receiverError } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", normalizedEmail)
      .single()

    if (receiverError || !receiver) {
      return { success: false, error: "User not found with that email address" }
    }

    if (receiver.id === user.id) {
      return { success: false, error: "Cannot send friend request to yourself" }
    }

    // Check if friendship already exists
    const { data: existingFriendship } = await supabase
      .from("friendships")
      .select("id")
      .or(
        `and(user_id.eq.${user.id},friend_id.eq.${receiver.id}),and(user_id.eq.${receiver.id},friend_id.eq.${user.id})`,
      )
      .single()

    if (existingFriendship) {
      return { success: false, error: "Already friends with this user" }
    }

    // Check if request already exists (in either direction)
    const { data: existingRequest } = await supabase
      .from("friend_requests")
      .select("id, status, sender_id, receiver_id")
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${receiver.id}),and(sender_id.eq.${receiver.id},receiver_id.eq.${user.id})`,
      )
      .single()

    if (existingRequest) {
      if (existingRequest.status === "pending") {
        if (existingRequest.sender_id === user.id) {
          return { success: false, error: "Friend request already sent and pending" }
        } else {
          return {
            success: false,
            error: "This user has already sent you a friend request. Check your pending requests.",
          }
        }
      }
    }

    const { error: insertError } = await supabase.from("friend_requests").upsert(
      {
        sender_id: user.id,
        receiver_id: receiver.id,
        status: "pending",
        created_at: new Date().toISOString(),
      },
      {
        onConflict: "sender_id,receiver_id",
      },
    )

    if (insertError) {
      console.error("Error inserting friend request:", insertError)
      return { success: false, error: `Failed to send friend request: ${insertError.message}` }
    }

    return { success: true }
  } catch (error) {
    console.error("Unexpected error in sendFriendRequest:", error)
    return {
      success: false,
      error: `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}

/**
 * Accept a friend request
 */
export async function acceptFriendRequest(requestId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: "Authentication required" }
    }

    // Get the friend request first
    const { data: request, error: requestError } = await supabase
      .from("friend_requests")
      .select("sender_id, receiver_id, status")
      .eq("id", requestId)
      .eq("receiver_id", user.id)
      .single()

    if (requestError || !request) {
      return { success: false, error: "Friend request not found or you don't have permission to accept it" }
    }

    if (request.status !== "pending") {
      return { success: false, error: "This friend request has already been processed" }
    }

    // Check if friendship already exists (race condition protection)
    const { data: existingFriendship } = await supabase
      .from("friendships")
      .select("id")
      .or(
        `and(user_id.eq.${request.sender_id},friend_id.eq.${request.receiver_id}),and(user_id.eq.${request.receiver_id},friend_id.eq.${request.sender_id})`,
      )
      .single()

    if (existingFriendship) {
      // Update request status even if friendship exists
      await supabase
        .from("friend_requests")
        .update({ status: "accepted", updated_at: new Date().toISOString() })
        .eq("id", requestId)

      return { success: false, error: "You are already friends with this user" }
    }

    // Create friendship (both directions) using upsert for safety
    const { error: friendshipError } = await supabase.from("friendships").upsert(
      [
        { user_id: request.sender_id, friend_id: request.receiver_id, created_at: new Date().toISOString() },
        { user_id: request.receiver_id, friend_id: request.sender_id, created_at: new Date().toISOString() },
      ],
      {
        onConflict: "user_id,friend_id",
      },
    )

    if (friendshipError) {
      console.error("Error creating friendship:", friendshipError)
      return { success: false, error: `Failed to create friendship: ${friendshipError.message}` }
    }

    // Update request status
    const { error: updateError } = await supabase
      .from("friend_requests")
      .update({
        status: "accepted",
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)

    if (updateError) {
      console.error("Error updating request status:", updateError)
      // Don't fail the whole operation if status update fails
      console.warn("Friendship created but request status update failed")
    }

    return { success: true }
  } catch (error) {
    console.error("Unexpected error in acceptFriendRequest:", error)
    return {
      success: false,
      error: `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}

/**
 * Get user's friends list
 */
export async function getFriendsList() {
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
      .from("friendships")
      .select(`
        friend_id,
        friend:profiles!friendships_friend_id_fkey(
          id,
          full_name,
          email
        )
      `)
      .eq("user_id", user.id)

    return { data, error }
  } catch (error) {
    return {
      data: null,
      error: `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}

/**
 * Get pending friend requests
 */
export async function getPendingFriendRequests() {
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
      .from("friend_requests")
      .select(`
        id,
        sender_id,
        created_at,
        sender:profiles!friend_requests_sender_id_fkey(
          full_name,
          email
        )
      `)
      .eq("receiver_id", user.id)
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
