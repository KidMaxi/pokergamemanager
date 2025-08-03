"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "../lib/supabase"
import type { User } from "@supabase/supabase-js"

interface Profile {
  id: string
  full_name: string | null
  email: string
  games_played: number | null
  all_time_profit_loss: number | null
  last_game_date: string | null
  is_admin: boolean | null
  created_at: string
  updated_at: string | null
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  emailVerified: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  emailVerified: false,
  refreshProfile: async () => {},
})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [emailVerified, setEmailVerified] = useState(false)

  const fetchProfile = async (userId: string) => {
    try {
      console.log("🔄 Fetching profile for user:", userId)

      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()

      if (error) {
        console.error("Error fetching profile:", error)
        return null
      }

      console.log("✅ Profile fetched successfully:", data)
      return data
    } catch (error) {
      console.error("Error in fetchProfile:", error)
      return null
    }
  }

  const refreshProfile = async () => {
    if (!user) {
      console.log("No user available for profile refresh")
      return
    }

    try {
      console.log("🔄 Refreshing profile data...")
      const profileData = await fetchProfile(user.id)
      if (profileData) {
        setProfile(profileData)
        console.log("✅ Profile refreshed successfully")
      }
    } catch (error) {
      console.error("Error refreshing profile:", error)
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
          console.log("✅ Initial session found:", session.user.id)
          setUser(session.user)
          setEmailVerified(session.user.email_confirmed_at !== null)

          // Fetch profile data
          const profileData = await fetchProfile(session.user.id)
          if (profileData) {
            setProfile(profileData)
          }
        } else {
          console.log("No initial session found")
        }
      } catch (error) {
        console.error("Error in getInitialSession:", error)
      } finally {
        setLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("🔄 Auth state changed:", event, session?.user?.id)

      if (event === "SIGNED_IN" && session?.user) {
        setUser(session.user)
        setEmailVerified(session.user.email_confirmed_at !== null)

        // Fetch profile data
        const profileData = await fetchProfile(session.user.id)
        if (profileData) {
          setProfile(profileData)
        }
      } else if (event === "SIGNED_OUT") {
        setUser(null)
        setProfile(null)
        setEmailVerified(false)
      } else if (event === "TOKEN_REFRESHED" && session?.user) {
        // Update user but keep profile unless it's stale
        setUser(session.user)
        setEmailVerified(session.user.email_confirmed_at !== null)
      }

      setLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const value = {
    user,
    profile,
    loading,
    emailVerified,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
