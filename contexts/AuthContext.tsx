"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"
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

  const sessionManagerRef = useRef<SessionManager | null>(null)
  const performanceMonitorRef = useRef<PerformanceMonitor | null>(null)
  const profileCacheRef = useRef<{ [key: string]: Profile }>({})
  const lastProfileFetchRef = useRef<{ [key: string]: number }>({})
  const profileFetchCooldown = 30000 // 30 seconds

  // Initialize managers only once
  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionManagerRef.current = SessionManager.getInstance()
      performanceMonitorRef.current = PerformanceMonitor.getInstance()
    }
  }, [])

  // Memoized profile fetching function with caching
  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    if (!userId) return null

    // Check cache first
    const cached = profileCacheRef.current[userId]
    const lastFetch = lastProfileFetchRef.current[userId] || 0
    const now = Date.now()

    if (cached && now - lastFetch < profileFetchCooldown) {
      return cached
    }

    try {
      performanceMonitorRef.current?.markRenderStart()

      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()

      performanceMonitorRef.current?.markRenderEnd()

      if (error) {
        console.error("Error fetching profile:", error)
        return cached || null // Return cached version if available
      }

      // Update cache
      profileCacheRef.current[userId] = data
      lastProfileFetchRef.current[userId] = now

      return data
    } catch (error) {
      console.error("Error fetching profile:", error)
      return cached || null
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (user) {
      // Clear cache for this user to force refresh
      delete profileCacheRef.current[user.id]
      delete lastProfileFetchRef.current[user.id]

      const profileData = await fetchProfile(user.id)
      setProfile(profileData)
    }
  }, [user, fetchProfile])

  // Handle session state changes with debouncing
  useEffect(() => {
    if (!sessionManagerRef.current) return

    let updateTimeout: NodeJS.Timeout | null = null

    const unsubscribe = sessionManagerRef.current.subscribe((sessionState: SessionState) => {
      // Debounce rapid session state changes
      if (updateTimeout) {
        clearTimeout(updateTimeout)
      }

      updateTimeout = setTimeout(() => {
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
      }, 100) // 100ms debounce
    })

    return () => {
      unsubscribe()
      if (updateTimeout) {
        clearTimeout(updateTimeout)
      }
    }
  }, [fetchProfile])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear caches
      profileCacheRef.current = {}
      lastProfileFetchRef.current = {}
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

      // Clear caches
      profileCacheRef.current = {}
      lastProfileFetchRef.current = {}

      // Use session manager for proper cleanup
      if (sessionManagerRef.current) {
        await sessionManagerRef.current.signOut()
      }

      return { error: null }
    } catch (error) {
      return { error: error as AuthError }
    } finally {
      setLoading(false)
    }
  }, [])

  const updateProfile = useCallback(
    async (updates: Partial<Profile>) => {
      try {
        if (!user) {
          return { error: new Error("No user logged in") }
        }

        const { error } = await supabase.from("profiles").update(updates).eq("id", user.id)

        if (!error) {
          // Clear cache and refresh
          delete profileCacheRef.current[user.id]
          delete lastProfileFetchRef.current[user.id]
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

      // Clear all caches
      profileCacheRef.current = {}
      lastProfileFetchRef.current = {}

      if (sessionManagerRef.current) {
        await sessionManagerRef.current.forceRefresh()
      }
    } catch (error) {
      console.error("Force refresh failed:", error)
    } finally {
      setLoading(false)
    }
  }, [])

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
