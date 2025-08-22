import { supabaseBrowser } from "./supabase-browser"
import { supabaseServer } from "./supabase-server"

// RLS-friendly friend list fetching
export async function getFriends(useServerClient = false) {
  const supabase = useServerClient ? await supabaseServer() : supabaseBrowser

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const uid = user?.id

  if (!uid) {
    return { friends: [], error: "Not authenticated" }
  }

  try {
    // 1) Get accepted friendships where user participates
    const { data: friendships, error: friendshipsError } = await supabase
      .from("friendships")
      .select("user_id, friend_id")
      .eq("status", "accepted")
      .or(`user_id.eq.${uid},friend_id.eq.${uid}`)

    if (friendshipsError) {
      return { friends: [], error: friendshipsError.message }
    }

    if (!friendships || friendships.length === 0) {
      return { friends: [], error: null }
    }

    // 2) Extract friend IDs (the other person in each friendship)
    const friendIds = [...new Set(friendships.map((f) => (f.user_id === uid ? f.friend_id : f.user_id)))]

    // 3) Fetch friend profiles
    const { data: friends, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name, email, avatar_url, games_played, total_wins, all_time_profit_loss")
      .in("id", friendIds)

    if (profilesError) {
      return { friends: [], error: profilesError.message }
    }

    return { friends: friends || [], error: null }
  } catch (error) {
    return { friends: [], error: "Failed to fetch friends" }
  }
}

// RLS-friendly friend requests fetching
export async function getFriendRequests(type: "sent" | "received", useServerClient = false) {
  const supabase = useServerClient ? await supabaseServer() : supabaseBrowser

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const uid = user?.id

  if (!uid) {
    return { requests: [], error: "Not authenticated" }
  }

  try {
    const column = type === "sent" ? "user_id" : "friend_id"
    const otherColumn = type === "sent" ? "friend_id" : "user_id"

    // Get pending friend requests
    const { data: requests, error: requestsError } = await supabase
      .from("friendships")
      .select(`id, ${otherColumn}`)
      .eq(column, uid)
      .eq("status", "pending")

    if (requestsError) {
      return { requests: [], error: requestsError.message }
    }

    if (!requests || requests.length === 0) {
      return { requests: [], error: null }
    }

    // Get profiles for the other users
    const otherIds = requests.map((r) => r[otherColumn])
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name, email, avatar_url")
      .in("id", otherIds)

    if (profilesError) {
      return { requests: [], error: profilesError.message }
    }

    // Combine request data with profiles
    const requestsWithProfiles = requests.map((request) => ({
      id: request.id,
      profile: profiles?.find((p) => p.id === request[otherColumn]),
    }))

    return { requests: requestsWithProfiles, error: null }
  } catch (error) {
    return { requests: [], error: "Failed to fetch friend requests" }
  }
}
