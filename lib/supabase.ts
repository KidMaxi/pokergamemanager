import { createClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://elukerudivqbkgdjwqvz.supabase.co"
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsdWtlcnVkaXZxYmtnZGp3cXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0Njk0ODAsImV4cCI6MjA2OTA0NTQ4MH0.UmZeAJvnn2NltzvmGo6w7PGKktW0CpB9C722gANkDOs"

let supabaseClient: ReturnType<typeof createClient<Database>> | null = null

export const createClientComponentClient = () => {
  if (!supabaseClient) {
    supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return supabaseClient
}

export const createServerComponentClient = () => {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

// Admin client (uses service role key)
export const createAdminClient = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Please check Project Settings.")
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

let defaultClient: ReturnType<typeof createClient<Database>> | null = null

export const supabase = {
  get auth() {
    if (!defaultClient) {
      defaultClient = createClientComponentClient()
    }
    return defaultClient.auth
  },
  get from() {
    if (!defaultClient) {
      defaultClient = createClientComponentClient()
    }
    return defaultClient.from
  },
  get rpc() {
    if (!defaultClient) {
      defaultClient = createClientComponentClient()
    }
    return defaultClient.rpc
  },
  get storage() {
    if (!defaultClient) {
      defaultClient = createClientComponentClient()
    }
    return defaultClient.storage
  },
  get functions() {
    if (!defaultClient) {
      defaultClient = createClientComponentClient()
    }
    return defaultClient.functions
  },
  get channel() {
    if (!defaultClient) {
      defaultClient = createClientComponentClient()
    }
    return defaultClient.channel
  },
  get realtime() {
    if (!defaultClient) {
      defaultClient = createClientComponentClient()
    }
    return defaultClient.realtime
  },
}
