import type { GameSession, PlayerInGame } from "../types"

export class GameStateManager {
  private static readonly STORAGE_KEY = "poker-game-state"
  private static readonly BACKUP_KEY = "poker-game-backup"
  private static readonly STATE_VERSION = "1.0"

  /**
   * Save game state with backup and validation
   */
  static saveGameState(sessions: GameSession[]): void {
    try {
      // Create backup of current state before saving new one
      const currentState = this.loadGameState()
      if (currentState.length > 0) {
        localStorage.setItem(
          this.BACKUP_KEY,
          JSON.stringify({
            sessions: currentState,
            timestamp: new Date().toISOString(),
            version: this.STATE_VERSION,
          }),
        )
      }

      // Validate and clean sessions before saving
      const validatedSessions = sessions.map((session) => this.validateAndCleanSession(session))

      // Save new state
      localStorage.setItem(
        this.STORAGE_KEY,
        JSON.stringify({
          sessions: validatedSessions,
          timestamp: new Date().toISOString(),
          version: this.STATE_VERSION,
        }),
      )

      console.log("Game state saved successfully", { sessionCount: validatedSessions.length })
    } catch (error) {
      console.error("Failed to save game state:", error)
      // Attempt to restore from backup if save fails
      this.restoreFromBackup()
    }
  }

  /**
   * Load game state with fallback to backup
   */
  static loadGameState(): GameSession[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      if (!stored) {
        console.log("No stored game state found")
        return []
      }

      const parsed = JSON.parse(stored)
      if (!parsed.sessions || !Array.isArray(parsed.sessions)) {
        console.warn("Invalid game state format, attempting backup restore")
        return this.restoreFromBackup()
      }

      // Validate and repair each session
      const repairedSessions = parsed.sessions.map((session) => this.validateAndRepairSession(session))

      console.log("Game state loaded successfully", {
        sessionCount: repairedSessions.length,
        timestamp: parsed.timestamp,
      })

      return repairedSessions
    } catch (error) {
      console.error("Failed to load game state:", error)
      return this.restoreFromBackup()
    }
  }

  /**
   * Validate and clean session data before saving
   */
  private static validateAndCleanSession(session: GameSession): GameSession {
    // Ensure all required fields exist
    const cleanedSession: GameSession = {
      id: session.id || `session-${Date.now()}`,
      name: session.name || "Unnamed Game",
      startTime: session.startTime || new Date().toISOString(),
      endTime: session.endTime,
      status: session.status || "active",
      pointToCashRate: session.pointToCashRate || 1,
      standardBuyInAmount: session.standardBuyInAmount || 25,
      playersInGame: session.playersInGame?.map((player) => this.validatePlayer(player)) || [],
      currentPhysicalPointsOnTable: 0, // Will be recalculated
      invitedUsers: session.invitedUsers || [],
      isOwner: session.isOwner,
    }

    // Recalculate physical points on table
    cleanedSession.currentPhysicalPointsOnTable = this.calculatePhysicalPoints(cleanedSession)

    return cleanedSession
  }

  /**
   * Validate and repair session data after loading
   */
  private static validateAndRepairSession(session: GameSession): GameSession {
    const repairedSession = this.validateAndCleanSession(session)

    // Additional repair logic for loaded sessions
    if (repairedSession.status === "active" || repairedSession.status === "pending_close") {
      // Recalculate physical points to ensure accuracy
      const calculatedPoints = this.calculatePhysicalPoints(repairedSession)

      if (Math.abs(repairedSession.currentPhysicalPointsOnTable - calculatedPoints) > 0.01) {
        console.warn(`Physical points mismatch detected for session ${repairedSession.id}`, {
          stored: repairedSession.currentPhysicalPointsOnTable,
          calculated: calculatedPoints,
        })
        repairedSession.currentPhysicalPointsOnTable = calculatedPoints
      }
    }

    return repairedSession
  }

  /**
   * Validate and clean player data
   */
  private static validatePlayer(player: PlayerInGame): PlayerInGame {
    return {
      playerId: player.playerId || `player-${Date.now()}`,
      name: player.name || "Unknown Player",
      pointStack: Math.max(0, player.pointStack || 0),
      buyIns: player.buyIns || [],
      cashOutAmount: Math.max(0, player.cashOutAmount || 0),
      cashOutLog: player.cashOutLog || [],
      status: player.status || "active",
      pointsLeftOnTable: Math.max(0, player.pointsLeftOnTable || 0),
    }
  }

  /**
   * Calculate accurate physical points on table
   */
  private static calculatePhysicalPoints(session: GameSession): number {
    let totalPoints = 0

    for (const player of session.playersInGame) {
      if (player.status === "active") {
        // Active players contribute their current stack
        totalPoints += player.pointStack
      } else if (player.status === "cashed_out_early") {
        // Early cashout players contribute points they left on table
        totalPoints += player.pointsLeftOnTable || 0
      }
    }

    return totalPoints
  }

  /**
   * Restore from backup
   */
  private static restoreFromBackup(): GameSession[] {
    try {
      const backup = localStorage.getItem(this.BACKUP_KEY)
      if (!backup) {
        console.log("No backup available")
        return []
      }

      const parsed = JSON.parse(backup)
      if (!parsed.sessions || !Array.isArray(parsed.sessions)) {
        console.warn("Invalid backup format")
        return []
      }

      console.log("Restored from backup", {
        sessionCount: parsed.sessions.length,
        backupTimestamp: parsed.timestamp,
      })

      return parsed.sessions.map((session) => this.validateAndRepairSession(session))
    } catch (error) {
      console.error("Failed to restore from backup:", error)
      return []
    }
  }

  /**
   * Clear all stored data (for debugging/reset)
   */
  static clearAllData(): void {
    localStorage.removeItem(this.STORAGE_KEY)
    localStorage.removeItem(this.BACKUP_KEY)
    console.log("All game state data cleared")
  }

  /**
   * Get diagnostic information about stored data
   */
  static getDiagnostics(): any {
    const mainState = localStorage.getItem(this.STORAGE_KEY)
    const backupState = localStorage.getItem(this.BACKUP_KEY)

    return {
      hasMainState: !!mainState,
      hasBackup: !!backupState,
      mainStateSize: mainState?.length || 0,
      backupStateSize: backupState?.length || 0,
      mainStateTimestamp: mainState ? JSON.parse(mainState).timestamp : null,
      backupStateTimestamp: backupState ? JSON.parse(backupState).timestamp : null,
    }
  }
}
