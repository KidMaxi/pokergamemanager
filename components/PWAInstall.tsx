"use client"

import type React from "react"
import { useState, useEffect } from "react"
import Button from "./common/Button"

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed"
    platform: string
  }>
  prompt(): Promise<void>
}

const PWAInstall: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    try {
      // Check if app is already installed
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      const isInWebAppiOS = (window.navigator as any).standalone === true
      setIsInstalled(isStandalone || isInWebAppiOS)

      // Listen for the beforeinstallprompt event
      const handleBeforeInstallPrompt = (e: Event) => {
        try {
          e.preventDefault()
          setDeferredPrompt(e as BeforeInstallPromptEvent)
          setShowInstallPrompt(true)
        } catch (error) {
          console.warn("Error handling install prompt:", error)
        }
      }

      // Listen for app installed event
      const handleAppInstalled = () => {
        try {
          setIsInstalled(true)
          setShowInstallPrompt(false)
          setDeferredPrompt(null)
        } catch (error) {
          console.warn("Error handling app installed:", error)
        }
      }

      window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.addEventListener("appinstalled", handleAppInstalled)

      return () => {
        window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
        window.removeEventListener("appinstalled", handleAppInstalled)
      }
    } catch (error) {
      console.warn("PWA Install component error (non-critical):", error)
    }
  }, [])

  const handleInstallClick = async () => {
    try {
      if (!deferredPrompt) return

      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice

      if (outcome === "accepted") {
        console.log("User accepted the install prompt")
      } else {
        console.log("User dismissed the install prompt")
      }

      setDeferredPrompt(null)
      setShowInstallPrompt(false)
    } catch (error) {
      console.warn("Error during install:", error)
      // Hide the prompt if there's an error
      setShowInstallPrompt(false)
    }
  }

  const handleDismiss = () => {
    try {
      setShowInstallPrompt(false)
      // Hide for this session
      sessionStorage.setItem("pwa-install-dismissed", "true")
    } catch (error) {
      console.warn("Error dismissing install prompt:", error)
    }
  }

  // Don't show if already installed or dismissed this session or if there were errors
  if (isInstalled || !showInstallPrompt) {
    return null
  }

  // Additional safety check for sessionStorage
  try {
    if (sessionStorage.getItem("pwa-install-dismissed")) {
      return null
    }
  } catch (error) {
    // If sessionStorage fails, just don't show the prompt
    return null
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 bg-surface-card border border-brand-primary rounded-lg p-4 shadow-lg z-50 max-w-sm mx-auto">
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 bg-brand-primary rounded-lg flex items-center justify-center">
            <span className="text-white text-lg">♠</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">Install Poker Manager</h3>
          <p className="text-xs text-text-secondary mt-1">Add to your home screen for quick access and offline use!</p>
          <div className="flex space-x-2 mt-3">
            <Button onClick={handleInstallClick} size="sm" variant="primary" className="text-xs px-3 py-1">
              Install
            </Button>
            <Button onClick={handleDismiss} size="sm" variant="ghost" className="text-xs px-3 py-1">
              Not now
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PWAInstall
