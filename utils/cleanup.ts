"use client"

import React from "react"

export interface CleanupManager {
  register: (cleanup: () => void) => () => void
  cleanup: () => void
  isActive: () => boolean
}

export function createCleanupManager(): CleanupManager {
  let cleanupFunctions: (() => void)[] = []
  let isActive = true

  return {
    register: (cleanup: () => void) => {
      if (!isActive) {
        console.warn("[v0] Attempting to register cleanup on inactive manager")
        return () => {}
      }

      cleanupFunctions.push(cleanup)

      // Return unregister function
      return () => {
        const index = cleanupFunctions.indexOf(cleanup)
        if (index > -1) {
          cleanupFunctions.splice(index, 1)
        }
      }
    },

    cleanup: () => {
      console.log(`[v0] Running ${cleanupFunctions.length} cleanup functions`)

      cleanupFunctions.forEach((cleanup, index) => {
        try {
          cleanup()
        } catch (error) {
          console.error(`[v0] Error in cleanup function ${index}:`, error)
        }
      })

      cleanupFunctions = []
      isActive = false
    },

    isActive: () => isActive,
  }
}

export function useCleanupManager() {
  const [manager] = React.useState(() => createCleanupManager())

  React.useEffect(() => {
    return () => {
      manager.cleanup()
    }
  }, [manager])

  return manager
}

export function createSafeAsyncOperation<T>(operation: () => Promise<T>, cleanup: CleanupManager): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!cleanup.isActive()) {
      reject(new Error("Operation cancelled - component unmounted"))
      return
    }

    let cancelled = false

    const unregister = cleanup.register(() => {
      cancelled = true
    })

    operation()
      .then((result) => {
        if (!cancelled && cleanup.isActive()) {
          resolve(result)
        }
      })
      .catch((error) => {
        if (!cancelled && cleanup.isActive()) {
          reject(error)
        }
      })
      .finally(() => {
        unregister()
      })
  })
}

export const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key)
    } catch (error) {
      console.error(`[v0] Error reading localStorage key "${key}":`, error)
      return null
    }
  },

  setItem: (key: string, value: string): boolean => {
    try {
      localStorage.setItem(key, value)
      return true
    } catch (error) {
      console.error(`[v0] Error writing localStorage key "${key}":`, error)
      return false
    }
  },

  removeItem: (key: string): boolean => {
    try {
      localStorage.removeItem(key)
      return true
    } catch (error) {
      console.error(`[v0] Error removing localStorage key "${key}":`, error)
      return false
    }
  },

  clear: (): boolean => {
    try {
      localStorage.clear()
      return true
    } catch (error) {
      console.error("[v0] Error clearing localStorage:", error)
      return false
    }
  },
}

export const refreshManager = {
  getRefreshCount: (): number => {
    const count = safeStorage.getItem("poker-refresh-count")
    return count ? Number.parseInt(count, 10) || 0 : 0
  },

  incrementRefreshCount: (): number => {
    const newCount = refreshManager.getRefreshCount() + 1
    safeStorage.setItem("poker-refresh-count", newCount.toString())
    safeStorage.setItem("poker-last-refresh", Date.now().toString())
    return newCount
  },

  resetRefreshCount: (): void => {
    safeStorage.removeItem("poker-refresh-count")
    safeStorage.removeItem("poker-last-refresh")
  },

  isRefreshSafe: (): boolean => {
    const count = refreshManager.getRefreshCount()
    const lastRefresh = safeStorage.getItem("poker-last-refresh")

    if (count >= 5) {
      return false
    }

    if (lastRefresh) {
      const timeSinceLastRefresh = Date.now() - Number.parseInt(lastRefresh, 10)
      return timeSinceLastRefresh > 2000 // 2 second minimum between refreshes
    }

    return true
  },
}
