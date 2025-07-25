"use client"

import { useEffect } from "react"

export const usePWA = () => {
  useEffect(() => {
    // Only attempt service worker registration in production-like environments
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      // Add a small delay to ensure the main app loads first
      const timeoutId = setTimeout(() => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log("Service Worker registered successfully:", registration)
          })
          .catch((error) => {
            // Don't throw or alert - just log the error
            console.warn("Service Worker registration failed (this won't affect app functionality):", error)
          })
      }, 2000) // Wait 2 seconds before attempting registration

      return () => clearTimeout(timeoutId)
    }
  }, [])
}
