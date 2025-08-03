"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase"

interface AuthContextType {
  user: User | null
  loading: boolean
  emailVerified: boolean
  profile: any | null
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  emailVerified: false,
  profile: null,
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
  const [loading, setLoading] = useState(true)
  const [emailVerified, setEmailVerified] = useState(false)
  const [profile, setProfile] = useState<any | null>(null)

  const refreshProfile = async () => {
    if (!user) {
      console.log("No user available for profile refresh")
      return
    }

    try {
      console.log("🔄 Refreshing profile data for user:", user.id)

      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single()

      if (error) {
        console.error("❌ Error refreshing profile:", error)
        return
      }

      console.log("✅ Profile refresh completed:", {
        games_played: data.games_played,
        all_time_profit_loss: data.all_time_profit_loss,
        last_game_date: data.last_game_date,
      })

      setProfile(data)
    } catch (error) {
      console.error("❌ Exception during profile refresh:", error)
    }
  }

  const fetchProfile = async (userId: string) => {
    try {
      console.log("📋 Fetching initial profile for user:", userId)

      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()

      if (error) {
        console.error("Error fetching profile:", error)
        return null
      }

      console.log("✅ Initial profile loaded:", {
        full_name: data.full_name,
        games_played: data.games_played,
        all_time_profit_loss: data.all_time_profit_loss,
      })

      return data
    } catch (error) {
      console.error("Exception fetching profile:", error)
      return null
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
        setEmailVerified(session.user.email_confirmed_at !== null)

        // Fetch profile data for new session
        const profileData = await fetchProfile(session.user.id)
        setProfile(profileData)
      } else {
        setUser(null)
        setEmailVerified(false)
        setProfile(null)
      }

      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Add automatic reconnection handling for network recovery and session refresh
  useEffect(() => {
    if (!user) return

    const handleNetworkReconnect = async () => {
      try {
        console.log("🌐 Network reconnected, refreshing auth session...")

        // Refresh auth session silently
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

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && user) {
        try {
          console.log("👁️ App became visible, checking session health...")

          // Check if session is still valid
          const {
            data: { session },
            error,
          } = await supabase.auth.getSession()

          if (error || !session) {
            console.log("⚠️ Session invalid on visibility change")
            return
          }

          // Refresh profile to ensure data is current
          await refreshProfile()
        } catch (error) {
          console.error("Error handling visibility change:", error)
        }
      }
    }

    // Listen for network reconnection
    window.addEventListener("online", handleNetworkReconnect)

    // Listen for app becoming visible (tab switch, mobile app foreground)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("online", handleNetworkReconnect)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [user])

  const value = {
    user,
    loading,
    emailVerified,
    profile,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
