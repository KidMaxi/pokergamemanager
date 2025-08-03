"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState } from "react"
import type { User } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase"

interface Profile {
  id: string
  email: string
  full_name: string | null
  created_at: string
  updated_at: string
  is_admin: boolean
  all_time_profit_loss: number
  games_played: number
  last_game_date: string | null
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  emailVerified: boolean
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: any }>
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: any }>
  refreshProfile: () => Promise<void>
  resendVerification: () => Promise<{ error: any }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [emailVerified, setEmailVerified] = useState(false)

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
          await fetchProfile(session.user.id)
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
      console.log("Auth state changed:", event, session?.user?.id)

      if (session?.user) {
        setUser(session.user)
        setEmailVerified(session.user.email_confirmed_at !== null)
        await fetchProfile(session.user.id)
      } else {
        setUser(null)
        setProfile(null)
        setEmailVerified(false)
      }

      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchProfile = async (userId: string) => {
    try {
      console.log("🔄 Fetching profile for user:", userId)
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()

      if (error) {
        console.error("Error fetching profile:", error)
        return
      }

      console.log("✅ Profile loaded:", {
        id: data.id,
        full_name: data.full_name,
        games_played: data.games_played,
        all_time_profit_loss: data.all_time_profit_loss,
        last_game_date: data.last_game_date,
      })
      setProfile(data)
    } catch (error) {
      console.error("Error fetching profile:", error)
    }
  }

  const refreshProfile = async () => {
    if (!user) {
      console.log("❌ No user available for profile refresh")
      return
    }

    try {
      console.log("🔄 Refreshing profile data for user:", user.id)
      await fetchProfile(user.id)
      console.log("✅ Profile refresh completed")
    } catch (error) {
      console.error("❌ Error refreshing profile:", error)
    }
  }

  const signUp = async (email: string, password: string, fullName?: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      })

      if (error) {
        return { error }
      }

      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        return { error }
      }

      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      throw error
    }
    setUser(null)
    setProfile(null)
    setEmailVerified(false)
  }

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) {
      return { error: new Error("No user logged in") }
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)
        .select()
        .single()

      if (error) {
        return { error }
      }

      setProfile(data)
      return { error: null }
    } catch (error) {
      return { error }
    }
  }

  const resendVerification = async () => {
    if (!user?.email) {
      return { error: new Error("No user email found") }
    }

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: user.email,
      })

      return { error }
    } catch (error) {
      return { error }
    }
  }

  const value = {
    user,
    profile,
    loading,
    emailVerified,
    signUp,
    signIn,
    signOut,
    updateProfile,
    refreshProfile,
    resendVerification,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
