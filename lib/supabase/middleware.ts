import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  console.log("[v0] Middleware - Supabase URL exists:", !!supabaseUrl)
  console.log("[v0] Middleware - Supabase Anon Key exists:", !!supabaseAnonKey)

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[v0] Middleware - Missing Supabase environment variables")
    console.error("[v0] Middleware - NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "SET" : "MISSING")
    console.error("[v0] Middleware - NEXT_PUBLIC_SUPABASE_ANON_KEY:", supabaseAnonKey ? "SET" : "MISSING")

    // Return response without authentication check if env vars are missing
    return supabaseResponse
  }

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    })

    // IMPORTANT: Do not run code between createServerClient and supabase.auth.getUser()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    console.log("[v0] Middleware - User authenticated:", !!user)

    // Allow access to auth pages and public routes
    const isAuthPage = request.nextUrl.pathname.startsWith("/auth")
    const isPublicRoute = request.nextUrl.pathname === "/"

    if (!user && !isAuthPage && !isPublicRoute) {
      console.log("[v0] Middleware - Redirecting unauthenticated user to login")
      // Redirect unauthenticated users to login
      const url = request.nextUrl.clone()
      url.pathname = "/auth/login"
      return NextResponse.redirect(url)
    }

    return supabaseResponse
  } catch (error) {
    console.error("[v0] Middleware - Error creating Supabase client:", error)

    // Return response without authentication check if there's an error
    return supabaseResponse
  }
}
