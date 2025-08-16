"use client"
import { createClientComponentClient, createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

function need(name: string, v?: string): string {
  if (!v) throw new Error(`${name} is required`)
  return v
}

let _browser: SupabaseClient<Database> | null = null

export function getSupabaseBrowser(): SupabaseClient<Database> {
  if (_browser) return _browser

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://elukerudivqbkgdjwqvz.supabase.co"
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsdWtlcnVkaXZxYmtnZGp3cXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0Njk0ODAsImV4cCI6MjA2OTA0NTQ4MH0.UmZeAJvnn2NltzvmGo6w7PGKktW0CpB9C722gANkDOs"

  _browser = createClientComponentClient<Database>({ supabaseUrl: url, supabaseKey: key })
  return _browser
}

export function getSupabaseServer(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://elukerudivqbkgdjwqvz.supabase.co"
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsdWtlcnVkaXZxYmtnZGp3cXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0Njk0ODAsImV4cCI6MjA2OTA0NTQ4MH0.UmZeAJvnn2NltzvmGo6w7PGKktW0CpB9C722gANkDOs"

  return createServerComponentClient<Database>({ cookies, supabaseUrl: url, supabaseKey: key })
}

export function createAdminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://elukerudivqbkgdjwqvz.supabase.co"
  const serviceRoleKey = need("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY)

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// Legacy exports for backward compatibility
export const legacyCreateClientComponentClient = getSupabaseBrowser
export const legacyCreateServerComponentClient = getSupabaseServer

export const supabase = getSupabaseBrowser()
