"use client"

import type React from "react"
import { useState } from "react"
import { useSupabase } from "../../contexts/SupabaseProvider"
import Button from "../common/Button"
import Card from "../common/Card"

const EmailVerificationScreen: React.FC = () => {
  const { session, supabase } = useSupabase()
  const user = session?.user
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const handleResendVerification = async () => {
    setLoading(true)
    setError("")
    setMessage("")

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: user?.email || "",
      })

      if (error) {
        setError(error.message)
      } else {
        setMessage("Verification email sent! Please check your inbox and spam folder.")
      }
    } catch (err) {
      setError("Failed to resend verification email. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()

      if (error) {
        console.error("Sign out error:", error)
        setError("Error signing out. Please try again.")
      } else {
        window.location.reload()
      }
    } catch (err) {
      console.error("Error signing out:", err)
      setError("Error signing out. Please try again.")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-main px-4">
      <div className="max-w-md mx-auto">
        <Card className="text-center">
          <div className="mb-6">
            <div className="w-16 h-16 bg-yellow-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-white text-2xl">📧</span>
            </div>
            <h1 className="text-2xl font-bold text-text-primary mb-2">Verify Your Email</h1>
            <p className="text-text-secondary">We've sent a verification email to:</p>
            <p className="text-brand-primary font-semibold mt-1">{user?.email}</p>
          </div>

          <div className="space-y-4">
            <div className="bg-blue-900/20 border border-blue-600 rounded-lg p-4">
              <h3 className="text-blue-200 font-semibold mb-2">📋 Next Steps:</h3>
              <ol className="text-blue-200 text-sm text-left space-y-1">
                <li>1. Check your email inbox</li>
                <li>2. Look for an email from Supabase</li>
                <li>3. Click the verification link</li>
                <li>4. Return here and refresh the page</li>
              </ol>
            </div>

            <div className="bg-yellow-900/20 border border-yellow-600 rounded-lg p-3">
              <p className="text-yellow-200 text-sm">
                <strong>💡 Tip:</strong> Check your spam/junk folder if you don't see the email within a few minutes.
              </p>
            </div>

            {message && (
              <div className="text-green-400 text-sm bg-green-900/20 border border-green-800 rounded p-3">
                {message}
              </div>
            )}

            {error && (
              <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded p-3">{error}</div>
            )}

            <div className="space-y-3 pt-4">
              <Button onClick={handleResendVerification} variant="primary" disabled={loading} className="w-full">
                {loading ? "Sending..." : "Resend Verification Email"}
              </Button>

              <Button onClick={() => window.location.reload()} variant="secondary" className="w-full">
                I've Verified - Refresh Page
              </Button>

              <Button onClick={handleSignOut} variant="ghost" className="w-full text-text-secondary">
                Sign Out & Use Different Email
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default EmailVerificationScreen
