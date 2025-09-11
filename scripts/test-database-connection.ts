import { createClient } from "@supabase/supabase-js"

async function testDatabaseConnection() {
  console.log("[v0] Testing database connection...")

  // Test environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  console.log("[v0] Environment variables check:")
  console.log("[v0] SUPABASE_URL exists:", !!supabaseUrl)
  console.log("[v0] SUPABASE_ANON_KEY exists:", !!supabaseAnonKey)

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[v0] Missing required environment variables")
    return
  }

  try {
    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Test basic connection by fetching profiles
    console.log("[v0] Testing profiles table access...")
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .limit(1)

    if (profilesError) {
      console.error("[v0] Profiles query error:", profilesError)
    } else {
      console.log("[v0] Profiles query successful, count:", profiles?.length || 0)
    }

    // Test game_sessions table
    console.log("[v0] Testing game_sessions table access...")
    const { data: sessions, error: sessionsError } = await supabase
      .from("game_sessions")
      .select("id, name, status")
      .limit(1)

    if (sessionsError) {
      console.error("[v0] Game sessions query error:", sessionsError)
    } else {
      console.log("[v0] Game sessions query successful, count:", sessions?.length || 0)
    }

    // Test friendships table
    console.log("[v0] Testing friendships table access...")
    const { data: friendships, error: friendshipsError } = await supabase
      .from("friendships")
      .select("id, user_id, friend_id")
      .limit(1)

    if (friendshipsError) {
      console.error("[v0] Friendships query error:", friendshipsError)
    } else {
      console.log("[v0] Friendships query successful, count:", friendships?.length || 0)
    }

    console.log("[v0] Database connection test completed")
  } catch (error) {
    console.error("[v0] Database connection test failed:", error)
  }
}

testDatabaseConnection()
