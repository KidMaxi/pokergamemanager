import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function fixUnidirectionalFriendships() {
  console.log("🔍 Checking for unidirectional friendships...")

  try {
    // Get all friendships
    const { data: allFriendships, error: friendshipsError } = await supabase.from("friendships").select("*")

    if (friendshipsError) {
      console.error("❌ Error fetching friendships:", friendshipsError)
      return
    }

    console.log(`📊 Found ${allFriendships.length} total friendship records`)

    const unidirectionalFriendships = []
    const processedPairs = new Set()

    // Check each friendship for bidirectionality
    for (const friendship of allFriendships) {
      const pairKey = [friendship.user_id, friendship.friend_id].sort().join("-")

      if (processedPairs.has(pairKey)) {
        continue // Already processed this pair
      }

      processedPairs.add(pairKey)

      // Check if reverse friendship exists
      const { data: reverseFriendship, error: reverseError } = await supabase
        .from("friendships")
        .select("id")
        .eq("user_id", friendship.friend_id)
        .eq("friend_id", friendship.user_id)
        .single()

      if (reverseError && reverseError.code === "PGRST116") {
        // No reverse friendship found - this is unidirectional
        unidirectionalFriendships.push(friendship)
        console.log(`❌ Unidirectional friendship found: ${friendship.user_id} -> ${friendship.friend_id}`)
      } else if (reverseError) {
        console.error("Error checking reverse friendship:", reverseError)
      } else {
        console.log(`✅ Bidirectional friendship: ${friendship.user_id} <-> ${friendship.friend_id}`)
      }
    }

    console.log(`\n📈 Summary:`)
    console.log(`   Total friendships: ${allFriendships.length}`)
    console.log(`   Unidirectional: ${unidirectionalFriendships.length}`)
    console.log(`   Bidirectional pairs: ${(allFriendships.length - unidirectionalFriendships.length) / 2}`)

    // Fix unidirectional friendships
    if (unidirectionalFriendships.length > 0) {
      console.log(`\n🔧 Fixing ${unidirectionalFriendships.length} unidirectional friendships...`)

      for (const friendship of unidirectionalFriendships) {
        try {
          const { error: insertError } = await supabase.from("friendships").insert({
            user_id: friendship.friend_id,
            friend_id: friendship.user_id,
            created_at: friendship.created_at, // Use same timestamp
          })

          if (insertError) {
            console.error(`❌ Failed to create reverse friendship for ${friendship.id}:`, insertError)
          } else {
            console.log(`✅ Created reverse friendship: ${friendship.friend_id} -> ${friendship.user_id}`)
          }
        } catch (error) {
          console.error(`❌ Error creating reverse friendship:`, error)
        }
      }

      console.log("\n✅ Finished fixing unidirectional friendships")
    } else {
      console.log("\n✅ All friendships are already bidirectional!")
    }

    // Test the accept_friend_request function
    console.log("\n🧪 Testing accept_friend_request function...")

    const { data: testResult, error: testError } = await supabase.rpc("accept_friend_request", {
      request_id: "00000000-0000-0000-0000-000000000000",
    })

    if (testError) {
      if (testError.message.includes("Friend request not found")) {
        console.log("✅ accept_friend_request function is working (expected error for non-existent request)")
      } else {
        console.error("❌ accept_friend_request function error:", testError)
      }
    } else {
      console.log("✅ accept_friend_request function executed successfully")
    }
  } catch (error) {
    console.error("❌ Script error:", error)
  }
}

// Run the fix
fixUnidirectionalFriendships()
