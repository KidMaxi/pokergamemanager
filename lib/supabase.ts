import { createClient as createBrowserClient } from "./supabase/client"
import { createClient as createServerClient } from "./supabase/server"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

// Legacy client-side client (for backward compatibility)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

let supabaseClient: ReturnType<typeof createClient<Database>> | null = null

export const createClientComponentClient = () => {
  if (!supabaseClient) {
    supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  }
  return supabaseClient
}

export const createServerComponentClient = createServerClient

// Admin client (uses service role key)
export const createAdminClient = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export { createBrowserClient, createServerClient }

// Legacy export for backward compatibility
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
