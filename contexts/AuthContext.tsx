"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState, useCallback } from "react"
import type { User, Session, AuthError } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase"
import type { Database } from "../lib/database.types"
import { SessionManager, type SessionState } from "../utils/sessionManager"
import { PerformanceMonitor } from "../utils/performanceMonitor"

type Profile = Database["public"]["Tables"]["profiles"]["Row"]

interface AuthContextType {
  user: User | null
  profile: Profile | null
  session: Session | null
  loading: boolean
  emailVerified: boolean
  isConnected: boolean
  reconnectAttempts: number
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null }>
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>
  signOut: () => Promise<{ error: AuthError | null }>
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>
  refreshProfile: () => Promise<void>
  resendVerification: () => Promise<{ error: AuthError | null }>
  forceRefresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [emailVerified, setEmailVerified] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const [sessionManager] = useState(() => SessionManager.getInstance())
  const [performanceMonitor] = useState(() => PerformanceMonitor.getInstance())

  // Memoized profile fetching function
  const fetchProfile = useCallback(
    async (userId: string): Promise<Profile | null> => {
      try {
        performanceMonitor.markRenderStart()

        const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()

        performanceMonitor.markRenderEnd()

        if (error) {
          console.error("Error fetching profile:", error)
          return null
        }

        return data
      } catch (error) {
        console.error("Error fetching profile:", error)
        return null
      }
    },
    [performanceMonitor],
  )

  const refreshProfile = useCallback(async () => {
    if (user) {
      const profileData = await fetchProfile(user.id)
      setProfile(profileData)
    }
  }, [user, fetchProfile])

  // Handle session state changes
  useEffect(() => {
    const unsubscribe = sessionManager.subscribe((sessionState: SessionState) => {
      setUser(sessionState.user)
      setSession(sessionState.session)
      setIsConnected(sessionState.isConnected)
      setReconnectAttempts(sessionState.reconnectAttempts)
      setEmailVerified(sessionState.user?.email_confirmed_at ? true : false)

      // Fetch profile when user changes and is verified
      if (sessionState.user && sessionState.user.email_confirmed_at) {
        fetchProfile(sessionState.user.id).then(setProfile)
      } else {
        setProfile(null)
      }

      setLoading(false)
    })

    return unsubscribe
  }, [sessionManager, fetchProfile])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't destroy session manager as it's a singleton
      // sessionManager.destroy()
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    try {
      setLoading(true)
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      })

      return { error }
    } catch (error) {
      return { error: error as AuthError }
    } finally {
      setLoading(false)
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      setLoading(true)
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      return { error }
    } catch (error) {
      return { error: error as AuthError }
    } finally {
      setLoading(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      setLoading(true)

      // Clear local state immediately for better UX
      setUser(null)
      setProfile(null)
      setSession(null)
      setEmailVerified(false)
      setIsConnected(false)

      // Use session manager for proper cleanup
      await sessionManager.signOut()

      return { error: null }
    } catch (error) {
      return { error: error as AuthError }
    } finally {
      setLoading(false)
    }
  }, [sessionManager])

  const updateProfile = useCallback(
    async (updates: Partial<Profile>) => {
      try {
        if (!user) {
          return { error: new Error("No user logged in") }
        }

        const { error } = await supabase.from("profiles").update(updates).eq("id", user.id)

        if (!error) {
          await refreshProfile()
        }

        return { error }
      } catch (error) {
        return { error: error as Error }
      }
    },
    [user, refreshProfile],
  )

  const resendVerification = useCallback(async () => {
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
  }, [user])

  const forceRefresh = useCallback(async () => {
    try {
      setLoading(true)
      await sessionManager.forceRefresh()
    } catch (error) {
      console.error("Force refresh failed:", error)
    } finally {
      setLoading(false)
    }
  }, [sessionManager])

  const value = {
    user,
    profile,
    session,
    loading,
    emailVerified,
    isConnected,
    reconnectAttempts,
    signUp,
    signIn,
    signOut,
    updateProfile,
    refreshProfile,
    resendVerification,
    forceRefresh,
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
