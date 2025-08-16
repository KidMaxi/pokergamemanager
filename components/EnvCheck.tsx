"use client"
import { getSupabaseBrowser } from "@/lib/supabase"

export default function EnvCheck() {
  try {
    const s = getSupabaseBrowser()
    console.log("supabase ok?", !!s)
    console.log("supabase url:", s.supabaseUrl)
    return <div className="text-green-600 text-sm">✅ Supabase client initialized</div>
  } catch (error) {
    console.error("Supabase error:", error)
    return <div className="text-red-600 text-sm">❌ Supabase client failed: {String(error)}</div>
  }
}
