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

    // Find receiver by email
    const { data: receiver, error: receiverError } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", receiverEmail.toLowerCase().trim())
      .single()

    if (receiverError || !receiver) {
      return { success: false, error: "User not found" }
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

    // Check if request already exists
    const { data: existingRequest } = await supabase
      .from("friend_requests")
      .select("id, status")
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${receiver.id}),and(sender_id.eq.${receiver.id},receiver_id.eq.${user.id})`,
      )
      .single()

    if (existingRequest) {
      if (existingRequest.status === "pending") {
        return { success: false, error: "Friend request already pending" }
      }
    }

    // Send friend request
    const { error: insertError } = await supabase.from("friend_requests").insert({
      sender_id: user.id,
      receiver_id: receiver.id,
      status: "pending",
    })

    if (insertError) {
      return { success: false, error: `Failed to send friend request: ${insertError.message}` }
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

    // Get the friend request
    const { data: request, error: requestError } = await supabase
      .from("friend_requests")
      .select("sender_id, receiver_id")
      .eq("id", requestId)
      .eq("receiver_id", user.id)
      .eq("status", "pending")
      .single()

    if (requestError || !request) {
      return { success: false, error: "Friend request not found" }
    }

    // Create friendship (both directions)
    const { error: friendshipError } = await supabase.from("friendships").insert([
      { user_id: request.sender_id, friend_id: request.receiver_id },
      { user_id: request.receiver_id, friend_id: request.sender_id },
    ])

    if (friendshipError) {
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
      return { success: false, error: `Failed to update request: ${updateError.message}` }
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
