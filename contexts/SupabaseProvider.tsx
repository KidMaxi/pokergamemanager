"use client"
import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type React from "react"

import type { Session, SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseBrowser } from "@/lib/supabase"

type Ctx = { supabase: SupabaseClient; session: Session | null; loading: boolean }
const Ctx = createContext<Ctx | null>(null)

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => getSupabaseBrowser(), [])
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session ?? null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => {
      mounted = false
      sub?.subscription.unsubscribe()
    }
  }, [supabase])

  return <Ctx.Provider value={{ supabase, session, loading }}>{children}</Ctx.Provider>
}

export function useSupabase() {
  const c = useContext(Ctx)
  if (!c) throw new Error("Wrap with <SupabaseProvider>")
  return c
}
