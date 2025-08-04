"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState } from "react"
import type { User, Session } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase"

interface Profile {
  id: string
  username: string
  email: string
  full_name?: string
  avatar_url?: string
  created_at: string
  updated_at: string
  total_games?: number
  total_winnings?: number
  average_buyin?: number
  win_ratio?: number
}

interface AuthContextType {
  user: User | null
  profile: any | null
  session: Session | null
  loading: boolean
  emailVerified: boolean
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>
  signOut: () => Promise<{ error: any }>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  session: null,
  loading: true,
  emailVerified: false,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => ({ error: null }),
  refreshProfile: async () => {},
})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<any | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [emailVerified, setEmailVerified] = useState(false)

  const fetchProfile = async (userId: string) => {
    try {
      console.log("Fetching profile for user:", userId)
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()

      if (error) {
        console.error("Error fetching profile:", error)
        return null
      }

      console.log("Profile fetched successfully:", data)
      return data
    } catch (error) {
      console.error("Exception fetching profile:", error)
      return null
    }
  }

  const refreshProfile = async () => {
    if (!user) {
      console.log("No user available for profile refresh")
      return
    }

    try {
      console.log("Refreshing profile data for user:", user.id)

      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single()

      if (error) {
        console.error("Error refreshing profile:", error)
        return
      }

      console.log("Profile refresh completed:", {
        games_played: data.games_played,
        all_time_profit_loss: data.all_time_profit_loss,
        last_game_date: data.last_game_date,
      })

      setProfile(data)
    } catch (error) {
      console.error("Exception during profile refresh:", error)
    }
  }

  const signIn = async (email: string, password: string) => {
    try {
      console.log("🔐 Attempting to sign in user:", email)

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      })

      if (error) {
        console.error("❌ Sign in error:", error)
        return { error }
      }

      if (data.user) {
        console.log("✅ Sign in successful:", data.user.id)
        // User state will be updated by the auth state change listener
      }

      return { error: null }
    } catch (error) {
      console.error("❌ Exception during sign in:", error)
      return { error }
    }
  }

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      console.log("📝 Attempting to sign up user:", email)

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      })

      if (error) {
        console.error("❌ Sign up error:", error)
        return { error }
      }

      if (data.user) {
        console.log("✅ Sign up successful:", data.user.id)
        // Profile will be created by the database trigger
      }

      return { error: null }
    } catch (error) {
      console.error("❌ Exception during sign up:", error)
      return { error }
    }
  }

  const signOut = async () => {
    try {
      console.log("🚪 Signing out user...")

      // Clear local state immediately
      setUser(null)
      setProfile(null)
      setEmailVerified(false)
      setSession(null)

      // Sign out from Supabase
      const { error } = await supabase.auth.signOut()

      if (error) {
        console.error("❌ Sign out error:", error)
        return { error }
      }

      console.log("✅ Sign out successful")
      return { error: null }
    } catch (error) {
      console.error("❌ Exception during sign out:", error)
      return { error }
    }
  }

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

        if (error) {
          console.error("Error getting session:", error)
          setLoading(false)
          return
        }

        if (session?.user) {
          setUser(session.user)
          setSession(session)
          setEmailVerified(session.user.email_confirmed_at !== null)

          // Fetch profile data
          const profileData = await fetchProfile(session.user.id)
          setProfile(profileData)
        }

        setLoading(false)
      } catch (error) {
        console.error("Error in getInitialSession:", error)
        setLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth state changed:", event, session?.user?.id)

      if (session?.user) {
        setUser(session.user)
        setSession(session)
        setEmailVerified(session.user.email_confirmed_at !== null)

        // Fetch profile data for new session
        const profileData = await fetchProfile(session.user.id)
        setProfile(profileData)
      } else {
        setUser(null)
        setSession(null)
        setEmailVerified(false)
        setProfile(null)
      }

      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Remove automatic reconnection handling that might cause logouts
  useEffect(() => {
    if (!user) return

    // Only handle network reconnection, not visibility changes that might cause logouts
    const handleNetworkReconnect = async () => {
      try {
        console.log("🌐 Network reconnected, refreshing auth session...")

        // Refresh auth session silently without forcing logout
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

        if (error) {
          console.error("Error refreshing session on reconnect:", error)
          return
        }

        if (session?.user) {
          console.log("✅ Session refreshed successfully on reconnect")
          // Refresh profile data
          const profileData = await fetchProfile(session.user.id)
          setProfile(profileData)
        }
      } catch (error) {
        console.error("Error handling network reconnect:", error)
      }
    }

    // Only listen for network reconnection, remove visibility change handler
    window.addEventListener("online", handleNetworkReconnect)

    return () => {
      window.removeEventListener("online", handleNetworkReconnect)
    }
  }, [user])

  const value = {
    user,
    profile,
    session,
    loading,
    emailVerified,
    refreshProfile,
    signIn,
    signUp,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
