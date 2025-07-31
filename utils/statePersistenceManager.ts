import type { GameSession } from "../types"

export interface PersistedState {
  sessions: GameSession[]
  currentView: string
  activeGameId: string | null
  timestamp: number
  version: string
}

export class StatePersistenceManager {
  private static readonly MAIN_KEY = "poker-app-state"
  private static readonly BACKUP_KEY = "poker-app-state-backup"
  private static readonly VERSION = "2.1"
  private static readonly MAX_BACKUPS = 2 // Reduced to save memory
  private static readonly CLEANUP_INTERVAL = 24 * 60 * 60 * 1000 // 24 hours
  private static readonly MAX_STORAGE_SIZE = 5 * 1024 * 1024 // 5MB limit
  private static isClient = typeof window !== "undefined"
  private static saveTimeout: NodeJS.Timeout | null = null
  private static lastSaveHash = ""

  static saveState(state: Partial<PersistedState>): void {
    if (!this.isClient) return

    // Debounce saves to prevent excessive storage operations
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
    }

    this.saveTimeout = setTimeout(() => {
      this.performSave(state)
    }, 1000)
  }

  private static performSave(state: Partial<PersistedState>): void {
    try {
      // Create backup before saving new state
      this.createBackup()

      const persistedState: PersistedState = {
        sessions: state.sessions || [],
        currentView: state.currentView || "dashboard",
        activeGameId: state.activeGameId || null,
        timestamp: Date.now(),
        version: this.VERSION,
      }

      // Validate and clean state before saving
      const validatedState = this.validateAndCleanState(persistedState)

      // Generate hash to check if state actually changed
      const stateHash = this.generateStateHash(validatedState)
      if (stateHash === this.lastSaveHash) {
        return // No changes, skip save
      }

      const stateString = JSON.stringify(validatedState)

      // Check storage size limit
      if (stateString.length > this.MAX_STORAGE_SIZE) {
        console.warn("State too large, compacting...")
        const compactedState = this.compactState(validatedState)
        const compactedString = JSON.stringify(compactedState)

        if (compactedString.length > this.MAX_STORAGE_SIZE) {
          console.error("State still too large after compaction")
          return
        }

        localStorage.setItem(this.MAIN_KEY, compactedString)
      } else {
        localStorage.setItem(this.MAIN_KEY, stateString)
      }

      // Also save to sessionStorage as additional backup (smaller version)
      const minimalState = this.createMinimalState(validatedState)
      sessionStorage.setItem(this.MAIN_KEY, JSON.stringify(minimalState))

      this.lastSaveHash = stateHash

      console.log("State saved successfully", {
        sessionCount: validatedState.sessions.length,
        view: validatedState.currentView,
        size: stateString.length,
      })
    } catch (error) {
      console.error("Failed to save state:", error)
      this.handleStorageError(error)
    }
  }

  private static generateStateHash(state: PersistedState): string {
    // Generate a simple hash of the important state data
    const hashData = {
      sessionCount: state.sessions.length,
      sessionIds: state.sessions.map((s) => s.id).sort(),
      currentView: state.currentView,
      activeGameId: state.activeGameId,
    }
    return JSON.stringify(hashData)
  }

  private static compactState(state: PersistedState): PersistedState {
    // Remove unnecessary data to reduce size
    const compactedSessions = state.sessions.map((session) => ({
      ...session,
      // Remove detailed logs to save space, keep only essential data
      playersInGame: session.playersInGame.map((player) => ({
        ...player,
        buyIns: player.buyIns.slice(-5), // Keep only last 5 buy-ins
        cashOutLog: player.cashOutLog.slice(-5), // Keep only last 5 cash-outs
      })),
    }))

    return {
      ...state,
      sessions: compactedSessions,
    }
  }

  private static createMinimalState(state: PersistedState): Partial<PersistedState> {
    // Create a minimal version for sessionStorage
    return {
      sessions: state.sessions.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        startTime: s.startTime,
        endTime: s.endTime,
      })) as GameSession[],
      currentView: state.currentView,
      activeGameId: state.activeGameId,
      timestamp: state.timestamp,
      version: state.version,
    }
  }

  static loadState(): PersistedState | null {
    if (!this.isClient) return null

    try {
      // Try localStorage first
      let stored = localStorage.getItem(this.MAIN_KEY)
      let source = "localStorage"

      // Fallback to sessionStorage
      if (!stored) {
        stored = sessionStorage.getItem(this.MAIN_KEY)
        source = "sessionStorage"
      }

      // Fallback to backup
      if (!stored) {
        return this.loadFromBackup()
      }

      const parsed = JSON.parse(stored)

      // Validate version compatibility
      if (parsed.version !== this.VERSION) {
        console.warn(`Version mismatch: ${parsed.version} vs ${this.VERSION}, attempting migration`)
        return this.migrateState(parsed)
      }

      const validatedState = this.validateAndRepairState(parsed)

      console.log(`State loaded from ${source}`, {
        sessionCount: validatedState.sessions.length,
        view: validatedState.currentView,
        age: Date.now() - validatedState.timestamp,
      })

      return validatedState
    } catch (error) {
      console.error("Failed to load state:", error)
      return this.loadFromBackup()
    }
  }

  private static createBackup(): void {
    try {
      const current = localStorage.getItem(this.MAIN_KEY)
      if (!current) return

      const backups = this.getBackups()

      // Only create backup if current state is different from last backup
      if (backups.length > 0 && backups[0].data === current) {
        return
      }

      backups.unshift({
        data: current,
        timestamp: Date.now(),
      })

      // Keep only the most recent backups
      const trimmedBackups = backups.slice(0, this.MAX_BACKUPS)

      localStorage.setItem(this.BACKUP_KEY, JSON.stringify(trimmedBackups))
    } catch (error) {
      console.error("Failed to create backup:", error)
    }
  }

  private static getBackups(): Array<{ data: string; timestamp: number }> {
    try {
      const stored = localStorage.getItem(this.BACKUP_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  }

  private static loadFromBackup(): PersistedState | null {
    try {
      const backups = this.getBackups()

      for (const backup of backups) {
        try {
          const parsed = JSON.parse(backup.data)
          const validatedState = this.validateAndRepairState(parsed)

          console.log("State restored from backup", {
            backupAge: Date.now() - backup.timestamp,
            sessionCount: validatedState.sessions.length,
          })

          return validatedState
        } catch (error) {
          console.warn("Backup validation failed, trying next backup")
        }
      }

      console.log("No valid backups found")
      return null
    } catch (error) {
      console.error("Failed to load from backup:", error)
      return null
    }
  }

  private static validateAndCleanState(state: PersistedState): PersistedState {
    return {
      sessions: Array.isArray(state.sessions) ? state.sessions.filter(this.isValidSession) : [],
      currentView: typeof state.currentView === "string" ? state.currentView : "dashboard",
      activeGameId: typeof state.activeGameId === "string" ? state.activeGameId : null,
      timestamp: typeof state.timestamp === "number" ? state.timestamp : Date.now(),
      version: this.VERSION,
    }
  }

  private static validateAndRepairState(state: any): PersistedState {
    const repaired = this.validateAndCleanState(state)

    // Additional repair logic
    repaired.sessions = repaired.sessions.map((session) => {
      // Ensure all required fields exist
      return {
        ...session,
        id: session.id || `session-${Date.now()}`,
        name: session.name || "Unnamed Game",
        status: session.status || "active",
        playersInGame: Array.isArray(session.playersInGame) ? session.playersInGame : [],
        currentPhysicalPointsOnTable:
          typeof session.currentPhysicalPointsOnTable === "number" ? session.currentPhysicalPointsOnTable : 0,
        invitedUsers: Array.isArray(session.invitedUsers) ? session.invitedUsers : [],
        isOwner: session.isOwner !== false,
      }
    })

    return repaired
  }

  private static isValidSession(session: any): boolean {
    return (
      session &&
      typeof session === "object" &&
      typeof session.id === "string" &&
      typeof session.name === "string" &&
      Array.isArray(session.playersInGame)
    )
  }

  private static migrateState(oldState: any): PersistedState {
    // Handle migration from older versions
    const migrated: PersistedState = {
      sessions: [],
      currentView: "dashboard",
      activeGameId: null,
      timestamp: Date.now(),
      version: this.VERSION,
    }

    // Migrate sessions if they exist
    if (Array.isArray(oldState.sessions)) {
      migrated.sessions = oldState.sessions.filter(this.isValidSession)
    }

    // Migrate other fields
    if (typeof oldState.currentView === "string") {
      migrated.currentView = oldState.currentView
    }

    if (typeof oldState.activeGameId === "string") {
      migrated.activeGameId = oldState.activeGameId
    }

    console.log("State migrated successfully", {
      from: oldState.version || "unknown",
      to: this.VERSION,
    })

    return migrated
  }

  private static handleStorageError(error: any): void {
    if (error.name === "QuotaExceededError") {
      console.warn("Storage quota exceeded, performing cleanup")
      this.performEmergencyCleanup()
    }
  }

  private static performEmergencyCleanup(): void {
    try {
      // Remove old backups
      localStorage.removeItem(this.BACKUP_KEY)

      // Clear old keys
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith("poker-") && key !== this.MAIN_KEY) {
          keysToRemove.push(key)
        }
      }

      keysToRemove.forEach((key) => localStorage.removeItem(key))

      console.log("Emergency cleanup completed")
    } catch (error) {
      console.error("Emergency cleanup failed:", error)
    }
  }

  static cleanup(): void {
    try {
      const backups = this.getBackups()
      const cutoff = Date.now() - this.CLEANUP_INTERVAL

      const validBackups = backups.filter((backup) => backup.timestamp > cutoff)

      if (validBackups.length !== backups.length) {
        localStorage.setItem(this.BACKUP_KEY, JSON.stringify(validBackups))
        console.log(`Cleaned up ${backups.length - validBackups.length} old backups`)
      }
    } catch (error) {
      console.error("Cleanup failed:", error)
    }
  }

  static clearState(): void {
    try {
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout)
        this.saveTimeout = null
      }

      localStorage.removeItem(this.MAIN_KEY)
      localStorage.removeItem(this.BACKUP_KEY)
      sessionStorage.removeItem(this.MAIN_KEY)
      this.lastSaveHash = ""
      console.log("State cleared successfully")
    } catch (error) {
      console.error("Failed to clear state:", error)
    }
  }

  static getDiagnostics(): any {
    const mainState = localStorage.getItem(this.MAIN_KEY)
    const sessionState = sessionStorage.getItem(this.MAIN_KEY)
    const backups = this.getBackups()

    return {
      hasMainState: !!mainState,
      hasSessionState: !!sessionState,
      backupCount: backups.length,
      mainStateSize: mainState?.length || 0,
      sessionStateSize: sessionState?.length || 0,
      oldestBackup: backups.length > 0 ? new Date(Math.min(...backups.map((b) => b.timestamp))) : null,
      newestBackup: backups.length > 0 ? new Date(Math.max(...backups.map((b) => b.timestamp))) : null,
      lastSaveHash: this.lastSaveHash,
    }
  }
}
