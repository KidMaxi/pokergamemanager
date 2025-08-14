"use client"

import { useAuth } from "../../contexts/AuthContext"
import FriendsPage from "../../components/FriendsPage"
import AuthModal from "../../components/auth/AuthModal"
import EmailVerificationScreen from "../../components/auth/EmailVerificationScreen"
import { useState } from "react"

export default function Friends() {
  const { user, loading: authLoading, emailVerified } = useAuth()
  const [showAuthModal, setShowAuthModal] = useState(false)

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-main">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-main px-4">
        <div className="text-center space-y-4 sm:space-y-6 max-w-sm sm:max-w-md mx-auto p-4 sm:p-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-brand-primary leading-tight">
            Please sign in to view your friends
          </h1>
          <button
            onClick={() => setShowAuthModal(true)}
            className="w-full bg-brand-primary text-white py-3 px-6 rounded-lg font-medium hover:bg-brand-secondary transition-colors text-base sm:text-lg"
          >
            Sign In
          </button>
        </div>
        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} initialMode="signin" />
      </div>
    )
  }

  if (user && !emailVerified) {
    return <EmailVerificationScreen />
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface-main default-background">
      <main className="flex-grow bg-transparent">
        <FriendsPage />
      </main>
    </div>
  )
}
