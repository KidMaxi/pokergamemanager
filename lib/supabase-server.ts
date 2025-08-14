import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import type { Database } from "./database.types"

export function supabaseServer() {
  const cookieStore = cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          // Server-side: we can't set cookies during SSR
          // This will be handled by middleware for auth flows
        },
        remove(name: string, options: any) {
          // Server-side: we can't remove cookies during SSR
        },
      },
    },
  )
}
