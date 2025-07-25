"use client"

import type React from "react"

import { useState } from "react"
import { useAuth } from "../../contexts/AuthContext"
import Modal from "../common/Modal"
import Input from "../common/Input"
import Button from "../common/Button"

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  initialMode?: "signin" | "signup"
}

export default function AuthModal({ isOpen, onClose, initialMode = "signin" }: AuthModalProps) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const { signIn, signUp } = useAuth()

  const resetForm = () => {
    setEmail("")
    setPassword("")
    setFullName("")
    setError("")
    setSuccess("")
    setLoading(false)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccess("")

    try {
      if (mode === "signup") {
        if (!fullName.trim()) {
          setError("Full name is required")
          setLoading(false)
          return
        }

        const { error } = await signUp(email, password, fullName.trim())

        if (error) {
          setError(error.message)
        } else {
          setSuccess("Account created! Please check your email to verify your account before signing in.")
          // Don't switch to signin mode - let them verify first
          resetForm()
        }
      } else {
        const { error } = await signIn(email, password)

        if (error) {
          setError(error.message)
        } else {
          handleClose()
        }
      }
    } catch (err) {
      setError("An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setMode(mode === "signin" ? "signup" : "signin")
    setError("")
    setSuccess("")
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={mode === "signin" ? "Sign In" : "Create Account"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "signup" && (
          <Input
            label="Full Name"
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Enter your full name"
            required
          />
        )}

        <Input
          label="Email"
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          required
        />

        <Input
          label="Password"
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          required
        />

        {error && <div className="text-red-500 text-sm bg-red-50 border border-red-200 rounded p-3">{error}</div>}

        {success && (
          <div className="text-green-500 text-sm bg-green-50 border border-green-200 rounded p-3">{success}</div>
        )}

        <div className="flex justify-end space-x-2 pt-4">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? "Loading..." : mode === "signin" ? "Sign In" : "Create Account"}
          </Button>
        </div>
      </form>

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={switchMode}
          className="text-brand-primary hover:text-brand-secondary text-sm underline"
        >
          {mode === "signin" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </Modal>
  )
}
