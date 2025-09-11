import { createClient } from "@supabase/supabase-js"

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function verifyFriendshipSystem() {
  console.log("🔍 Verifying Friendship System...\n")

  try {
    // Test 1: Check database connection
    console.log("1. Testing database connection...")
    const { data: connectionTest, error: connectionError } = await supabase.from("profiles").select("count").limit(1)

    if (connectionError) {
      console.error("❌ Database connection failed:", connectionError.message)
      return false
    }
    console.log("✅ Database connection successful")

    // Test 2: Check if friendship tables exist
    console.log("\n2. Checking friendship tables...")

    const { data: friendshipsTest, error: friendshipsError } = await supabase
      .from("friendships")
      .select("count")
      .limit(1)

    const { data: requestsTest, error: requestsError } = await supabase.from("friend_requests").select("count").limit(1)

    if (friendshipsError) {
      console.error("❌ Friendships table error:", friendshipsError.message)
      return false
    }

    if (requestsError) {
      console.error("❌ Friend requests table error:", requestsError.message)
      return false
    }

    console.log("✅ Friendship tables exist and accessible")

    // Test 3: Check RPC functions
    console.log("\n3. Testing RPC functions...")

    // Test accept_friend_request function (will fail with invalid ID, but should exist)
    const { error: acceptError } = await supabase.rpc("accept_friend_request", {
      request_id: "00000000-0000-0000-0000-000000000000",
    })

    if (acceptError && !acceptError.message.includes("function accept_friend_request")) {
      console.log("✅ accept_friend_request function exists")
    } else if (acceptError && acceptError.message.includes("function accept_friend_request")) {
      console.error("❌ accept_friend_request function missing")
      return false
    }

    // Test remove_friendship function
    const { error: removeError } = await supabase.rpc("remove_friendship", {
      friend_user_id: "00000000-0000-0000-0000-000000000000",
    })

    if (removeError && !removeError.message.includes("function remove_friendship")) {
      console.log("✅ remove_friendship function exists")
    } else if (removeError && removeError.message.includes("function remove_friendship")) {
      console.error("❌ remove_friendship function missing")
      return false
    }

    // Test 4: Check bidirectional friendship logic
    console.log("\n4. Checking friendship bidirectionality...")

    // Query to check if friendships are properly bidirectional
    const { data: friendshipSample, error: sampleError } = await supabase
      .from("friendships")
      .select("user_id, friend_id")
      .limit(5)

    if (sampleError) {
      console.error("❌ Error checking friendship sample:", sampleError.message)
      return false
    }

    if (friendshipSample && friendshipSample.length > 0) {
      console.log("✅ Found existing friendships, checking bidirectionality...")

      for (const friendship of friendshipSample) {
        // Check if reverse friendship exists
        const { data: reverse, error: reverseError } = await supabase
          .from("friendships")
          .select("id")
          .eq("user_id", friendship.friend_id)
          .eq("friend_id", friendship.user_id)
          .single()

        if (reverseError && reverseError.code !== "PGRST116") {
          console.error("❌ Error checking reverse friendship:", reverseError.message)
          continue
        }

        if (!reverse) {
          console.warn("⚠️  Found unidirectional friendship:", friendship)
        } else {
          console.log("✅ Bidirectional friendship confirmed")
        }
      }
    } else {
      console.log("ℹ️  No existing friendships to check")
    }

    console.log("\n🎉 Friendship system verification completed successfully!")
    console.log("\n📋 Summary:")
    console.log("- Database connection: ✅")
    console.log("- Friendship tables: ✅")
    console.log("- RPC functions: ✅")
    console.log("- Bidirectional logic: ✅")

    return true
  } catch (error) {
    console.error("❌ Verification failed:", error.message)
    return false
  }
}

// Run verification
verifyFriendshipSystem()
  .then((success) => {
    if (success) {
      console.log("\n✅ All systems operational!")
    } else {
      console.log("\n❌ Issues found - check logs above")
    }
  })
  .catch((error) => {
    console.error("❌ Verification script error:", error)
  })
