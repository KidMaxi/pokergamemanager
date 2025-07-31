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
  private static readonly VERSION = "2.0"
  private static readonly MAX_BACKUPS = 3
  private static readonly CLEANUP_INTERVAL = 24 * 60 * 60 * 1000 // 24 hours

  static saveState(state: Partial<PersistedState>): void {
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

      // Validate state before saving
      const validatedState = this.validateAndCleanState(persistedState)

      localStorage.setItem(this.MAIN_KEY, JSON.stringify(validatedState))

      // Also save to sessionStorage as additional backup
      sessionStorage.setItem(this.MAIN_KEY, JSON.stringify(validatedState))

      console.log("State saved successfully", {
        sessionCount: validatedState.sessions.length,
        view: validatedState.currentView,
      })
    } catch (error) {
      console.error("Failed to save state:", error)
      this.attemptRecovery()
    }
  }

  static loadState(): PersistedState | null {
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

  private static attemptRecovery(): void {
    console.log("Attempting state recovery")

    // Try to recover from sessionStorage
    try {
      const sessionData = sessionStorage.getItem(this.MAIN_KEY)
      if (sessionData) {
        localStorage.setItem(this.MAIN_KEY, sessionData)
        console.log("State recovered from sessionStorage")
        return
      }
    } catch (error) {
      console.error("SessionStorage recovery failed:", error)
    }

    // Try to recover from backup
    const backup = this.loadFromBackup()
    if (backup) {
      this.saveState(backup)
      console.log("State recovered from backup")
    }
  }

  static clearState(): void {
    try {
      localStorage.removeItem(this.MAIN_KEY)
      localStorage.removeItem(this.BACKUP_KEY)
      sessionStorage.removeItem(this.MAIN_KEY)
      console.log("State cleared successfully")
    } catch (error) {
      console.error("Failed to clear state:", error)
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
    }
  }
}
