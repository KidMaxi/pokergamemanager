"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState } from "react"
import type { User, Session, AuthError } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase"
import type { Database } from "../lib/database.types"

type Profile = Database["public"]["Tables"]["profiles"]["Row"]

interface AuthContextType {
  user: User | null
  profile: Profile | null
  session: Session | null
  loading: boolean
  emailVerified: boolean
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null }>
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<{ error: AuthError | null }>
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>
  refreshProfile: () => Promise<void>
  resendVerification: () => Promise<{ error: AuthError | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [emailVerified, setEmailVerified] = useState(false)

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()

      if (error) {
        console.error("Error fetching profile:", error)
        return null
      }

      return data
    } catch (error) {
      console.error("Error fetching profile:", error)
      return null
    }
  }

  const refreshProfile = async () => {
    if (user) {
      const profileData = await fetchProfile(user.id)
      setProfile(profileData)
    }
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setEmailVerified(session?.user?.email_confirmed_at ? true : false)

      if (session?.user && session.user.email_confirmed_at) {
        fetchProfile(session.user.id).then(setProfile)
      }

      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setEmailVerified(session?.user?.email_confirmed_at ? true : false)

      if (session?.user && session.user.email_confirmed_at) {
        const profileData = await fetchProfile(session.user.id)
        setProfile(profileData)
      } else {
        setProfile(null)
      }

      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      console.log("🔄 Starting user signup process...")

      if (!email?.trim() || !password?.trim() || !fullName?.trim()) {
        return { error: new Error("All fields are required") as AuthError }
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      })

      if (error) {
        console.error("❌ Signup error:", error)
        return { error }
      }

      console.log("✅ User signup successful:", data.user?.id)

      if (data.user) {
        // Wait a bit for the database trigger to potentially create the profile
        setTimeout(async () => {
          try {
            const profile = await fetchProfile(data.user!.id)
            if (!profile) {
              console.log("⚠️ Profile not found after signup, creating manually...")

              // Manually create profile if trigger didn't work
              const { error: profileError } = await supabase.from("profiles").upsert(
                {
                  id: data.user!.id,
                  full_name: fullName.trim(),
                  email: email.trim().toLowerCase(),
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  is_admin: false,
                  preferences: {},
                  all_time_profit_loss: 0,
                  games_played: 0,
                  last_game_date: null,
                },
                {
                  onConflict: "id",
                },
              )

              if (profileError) {
                console.error("❌ Manual profile creation failed:", profileError)
              } else {
                console.log("✅ Profile created manually")
              }
            } else {
              console.log("✅ Profile found after signup")
            }
          } catch (error) {
            console.error("❌ Error checking/creating profile:", error)
          }
        }, 1000)
      }

      return { error: null }
    } catch (error) {
      console.error("❌ Signup exception:", error)
      return { error: error as AuthError }
    }
  }

  const signIn = async (email: string, password: string) => {
    try {
      if (!email?.trim() || !password?.trim()) {
        return { error: new Error("Email and password are required") as AuthError }
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      return { error }
    } catch (error) {
      return { error: error as AuthError }
    }
  }

  const signOut = async () => {
    try {
      // Clear local state immediately
      setUser(null)
      setProfile(null)
      setSession(null)
      setEmailVerified(false)

      const { error } = await supabase.auth.signOut()
      return { error }
    } catch (error) {
      return { error: error as AuthError }
    }
  }

  const updateProfile = async (updates: Partial<Profile>) => {
    try {
      if (!user) {
        return { error: new Error("No user logged in") }
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)

      if (!error) {
        await refreshProfile()
      }

      return { error }
    } catch (error) {
      return { error: error as Error }
    }
  }

  const resendVerification = async () => {
    try {
      if (!user?.email) {
        return { error: new Error("No user email found") as AuthError }
      }

      const { error } = await supabase.auth.resend({
        type: "signup",
        email: user.email,
      })

      return { error }
    } catch (error) {
      return { error: error as AuthError }
    }
  }

  const value = {
    user,
    profile,
    session,
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
