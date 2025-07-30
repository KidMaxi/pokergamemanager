import type { GameSession, PlayerInGame } from "../types"

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  repairedSession?: GameSession
}

export class GameStateValidator {
  /**
   * Comprehensive validation of a game session
   */
  static validateSession(session: GameSession): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []
    const repairedSession = { ...session }

    // Basic field validation
    if (!session.id) {
      errors.push("Session missing ID")
    }

    if (!session.name) {
      warnings.push("Session missing name")
      repairedSession.name = "Unnamed Game"
    }

    if (!session.startTime) {
      errors.push("Session missing start time")
    }

    if (session.pointToCashRate <= 0) {
      errors.push("Invalid point to cash rate")
    }

    if (session.standardBuyInAmount <= 0) {
      warnings.push("Invalid standard buy-in amount")
      repairedSession.standardBuyInAmount = 25
    }

    // Validate players
    const playerValidation = this.validatePlayers(session.playersInGame)
    errors.push(...playerValidation.errors)
    warnings.push(...playerValidation.warnings)
    repairedSession.playersInGame = playerValidation.repairedPlayers

    // Validate physical points calculation
    const pointsValidation = this.validatePhysicalPoints(repairedSession)
    if (!pointsValidation.isValid) {
      warnings.push(
        `Physical points mismatch: stored=${session.currentPhysicalPointsOnTable}, calculated=${pointsValidation.calculatedPoints}`,
      )
      repairedSession.currentPhysicalPointsOnTable = pointsValidation.calculatedPoints
    }

    // Validate financial consistency
    const financialValidation = this.validateFinancialConsistency(repairedSession)
    errors.push(...financialValidation.errors)
    warnings.push(...financialValidation.warnings)

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      repairedSession: errors.length === 0 ? repairedSession : undefined,
    }
  }

  /**
   * Validate all players in a session
   */
  private static validatePlayers(players: PlayerInGame[]): {
    errors: string[]
    warnings: string[]
    repairedPlayers: PlayerInGame[]
  } {
    const errors: string[] = []
    const warnings: string[] = []
    const repairedPlayers: PlayerInGame[] = []

    for (const player of players) {
      const playerValidation = this.validatePlayer(player)
      errors.push(...playerValidation.errors.map((e) => `Player ${player.name}: ${e}`))
      warnings.push(...playerValidation.warnings.map((w) => `Player ${player.name}: ${w}`))

      if (playerValidation.repairedPlayer) {
        repairedPlayers.push(playerValidation.repairedPlayer)
      }
    }

    return { errors, warnings, repairedPlayers }
  }

  /**
   * Validate individual player data
   */
  private static validatePlayer(player: PlayerInGame): {
    errors: string[]
    warnings: string[]
    repairedPlayer?: PlayerInGame
  } {
    const errors: string[] = []
    const warnings: string[] = []
    const repairedPlayer = { ...player }

    // Basic validation
    if (!player.playerId) {
      errors.push("Missing player ID")
    }

    if (!player.name) {
      warnings.push("Missing player name")
      repairedPlayer.name = "Unknown Player"
    }

    if (player.pointStack < 0) {
      warnings.push("Negative point stack")
      repairedPlayer.pointStack = 0
    }

    if (player.cashOutAmount < 0) {
      warnings.push("Negative cash out amount")
      repairedPlayer.cashOutAmount = 0
    }

    // Validate buy-ins
    if (!player.buyIns || player.buyIns.length === 0) {
      errors.push("Player has no buy-ins")
    } else {
      const totalBuyIn = player.buyIns.reduce((sum, buyIn) => sum + (buyIn.amount || 0), 0)
      if (totalBuyIn <= 0) {
        errors.push("Total buy-in amount is zero or negative")
      }
    }

    // Validate early cashout logic
    if (player.status === "cashed_out_early") {
      if (player.pointStack > 0) {
        warnings.push("Cashed out player still has points in stack")
        repairedPlayer.pointStack = 0
      }

      // Ensure pointsLeftOnTable is properly set
      if (player.pointsLeftOnTable === undefined) {
        // Calculate based on cash out log
        const totalCashedOutPoints = player.cashOutLog.reduce((sum, log) => sum + log.pointsCashedOut, 0)
        const totalBuyInPoints = player.buyIns.reduce((sum, buyIn) => sum + Math.floor(buyIn.amount / 1), 0) // Assuming 1:1 rate for calculation
        repairedPlayer.pointsLeftOnTable = Math.max(0, totalBuyInPoints - totalCashedOutPoints)

        if (repairedPlayer.pointsLeftOnTable > 0) {
          warnings.push(`Calculated pointsLeftOnTable: ${repairedPlayer.pointsLeftOnTable}`)
        }
      }
    }

    return {
      errors,
      warnings,
      repairedPlayer: errors.length === 0 ? repairedPlayer : undefined,
    }
  }

  /**
   * Validate physical points calculation
   */
  private static validatePhysicalPoints(session: GameSession): {
    isValid: boolean
    calculatedPoints: number
  } {
    let calculatedPoints = 0

    for (const player of session.playersInGame) {
      if (player.status === "active") {
        calculatedPoints += player.pointStack
      } else if (player.status === "cashed_out_early") {
        calculatedPoints += player.pointsLeftOnTable || 0
      }
    }

    return {
      isValid: Math.abs(session.currentPhysicalPointsOnTable - calculatedPoints) < 0.01,
      calculatedPoints,
    }
  }

  /**
   * Validate financial consistency
   */
  private static validateFinancialConsistency(session: GameSession): {
    errors: string[]
    warnings: string[]
  } {
    const errors: string[] = []
    const warnings: string[] = []

    const totalBuyIns = session.playersInGame.reduce(
      (sum, player) => sum + player.buyIns.reduce((playerSum, buyIn) => playerSum + buyIn.amount, 0),
      0,
    )

    const totalCashOuts = session.playersInGame.reduce((sum, player) => sum + player.cashOutAmount, 0)

    const remainingValue = session.currentPhysicalPointsOnTable * session.pointToCashRate

    const totalAccountedValue = totalCashOuts + remainingValue

    if (Math.abs(totalBuyIns - totalAccountedValue) > 0.01) {
      warnings.push(
        `Financial mismatch: Buy-ins=$${totalBuyIns.toFixed(2)}, Accounted=$${totalAccountedValue.toFixed(2)}`,
      )
    }

    return { errors, warnings }
  }
}
