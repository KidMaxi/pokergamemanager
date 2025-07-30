import type { GameSession, PlayerInGame } from "../types"

export interface GameStateValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  repaired: boolean
}

export class GameStateValidator {
  /**
   * Validate a complete game session
   */
  static validateSession(session: GameSession): GameStateValidationResult {
    const errors: string[] = []
    const warnings: string[] = []
    let repaired = false

    // Basic session validation
    if (!session.id) {
      errors.push("Session missing ID")
    }

    if (!session.name || session.name.trim() === "") {
      errors.push("Session missing or empty name")
    }

    if (!session.startTime) {
      errors.push("Session missing start time")
    }

    if (session.pointToCashRate <= 0) {
      errors.push("Invalid point to cash rate")
    }

    if (session.standardBuyInAmount <= 0) {
      errors.push("Invalid standard buy-in amount")
    }

    // Validate players
    const playerValidation = this.validatePlayers(session.playersInGame, session.pointToCashRate)
    errors.push(...playerValidation.errors)
    warnings.push(...playerValidation.warnings)

    // Validate physical points calculation
    const physicalPointsValidation = this.validatePhysicalPoints(session)
    if (!physicalPointsValidation.isValid) {
      errors.push(...physicalPointsValidation.errors)
      warnings.push(...physicalPointsValidation.warnings)
      if (physicalPointsValidation.repaired) {
        repaired = true
      }
    }

    // Validate financial consistency
    const financialValidation = this.validateFinancialConsistency(session)
    errors.push(...financialValidation.errors)
    warnings.push(...financialValidation.warnings)

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      repaired,
    }
  }

  /**
   * Validate all players in a game
   */
  static validatePlayers(players: PlayerInGame[], pointToCashRate: number): GameStateValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    for (const player of players) {
      const playerValidation = this.validatePlayer(player, pointToCashRate)
      if (!playerValidation.isValid) {
        errors.push(...playerValidation.errors.map((e) => `Player ${player.name}: ${e}`))
        warnings.push(...playerValidation.warnings.map((w) => `Player ${player.name}: ${w}`))
      }
    }

    // Check for duplicate player names
    const playerNames = players.map((p) => p.name.toLowerCase())
    const duplicateNames = playerNames.filter((name, index) => playerNames.indexOf(name) !== index)
    if (duplicateNames.length > 0) {
      errors.push(`Duplicate player names found: ${duplicateNames.join(", ")}`)
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      repaired: false,
    }
  }

  /**
   * Validate a single player
   */
  static validatePlayer(player: PlayerInGame, pointToCashRate: number): GameStateValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // Basic validation
    if (!player.playerId) {
      errors.push("Missing player ID")
    }

    if (!player.name || player.name.trim() === "") {
      errors.push("Missing or empty player name")
    }

    if (player.pointStack < 0) {
      errors.push("Negative point stack")
    }

    if (player.cashOutAmount < 0) {
      errors.push("Negative cash out amount")
    }

    // Validate buy-ins
    if (!player.buyIns || player.buyIns.length === 0) {
      errors.push("Player has no buy-ins")
    } else {
      for (const buyIn of player.buyIns) {
        if (buyIn.amount <= 0) {
          errors.push(`Invalid buy-in amount: ${buyIn.amount}`)
        }
        if (!buyIn.time) {
          errors.push("Buy-in missing timestamp")
        }
      }
    }

    // Validate cash-out logs
    for (const cashOut of player.cashOutLog) {
      if (cashOut.pointsCashedOut < 0) {
        errors.push(`Invalid cash-out points: ${cashOut.pointsCashedOut}`)
      }
      if (cashOut.cashValue < 0) {
        errors.push(`Invalid cash-out value: ${cashOut.cashValue}`)
      }
      if (!cashOut.time) {
        errors.push("Cash-out missing timestamp")
      }
    }

    // Validate early cashout logic
    if (player.status === "cashed_out_early") {
      if (player.pointStack !== 0) {
        warnings.push("Early cashout player should have 0 point stack")
      }

      // Validate pointsLeftOnTable
      if (player.pointsLeftOnTable === undefined || player.pointsLeftOnTable < 0) {
        warnings.push("Early cashout player missing or invalid pointsLeftOnTable")
      }
    }

    // Validate point calculations
    const totalBuyInPoints = player.buyIns.reduce((sum, buyIn) => {
      return sum + Math.floor(buyIn.amount / pointToCashRate)
    }, 0)

    const totalCashOutPoints = player.cashOutLog.reduce((sum, cashOut) => {
      return sum + cashOut.pointsCashedOut
    }, 0)

    const expectedRemainingPoints = totalBuyInPoints - totalCashOutPoints
    if (player.status === "active" && Math.abs(player.pointStack - expectedRemainingPoints) > 1) {
      warnings.push(`Point stack mismatch: expected ${expectedRemainingPoints}, actual ${player.pointStack}`)
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      repaired: false,
    }
  }

  /**
   * Validate physical points calculation
   */
  static validatePhysicalPoints(session: GameSession): GameStateValidationResult {
    const errors: string[] = []
    const warnings: string[] = []
    let repaired = false

    if (session.status === "completed") {
      // Completed games should have 0 physical points
      if (session.currentPhysicalPointsOnTable !== 0) {
        warnings.push("Completed game should have 0 physical points on table")
      }
      return { isValid: true, errors, warnings, repaired }
    }

    // Calculate expected physical points
    let expectedPhysicalPoints = 0

    for (const player of session.playersInGame) {
      if (player.status === "active") {
        expectedPhysicalPoints += player.pointStack
      } else if (player.status === "cashed_out_early") {
        expectedPhysicalPoints += player.pointsLeftOnTable || 0
      }
    }

    // Check if current value matches expected
    if (Math.abs(session.currentPhysicalPointsOnTable - expectedPhysicalPoints) > 0.01) {
      warnings.push(
        `Physical points mismatch: stored ${session.currentPhysicalPointsOnTable}, calculated ${expectedPhysicalPoints}`,
      )
      repaired = true
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      repaired,
    }
  }

  /**
   * Validate financial consistency
   */
  static validateFinancialConsistency(session: GameSession): GameStateValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    const totalBuyIns = session.playersInGame.reduce((sum, player) => {
      return sum + player.buyIns.reduce((playerSum, buyIn) => playerSum + buyIn.amount, 0)
    }, 0)

    const totalCashOuts = session.playersInGame.reduce((sum, player) => {
      return sum + player.cashOutAmount
    }, 0)

    const totalPointsValue = session.currentPhysicalPointsOnTable * session.pointToCashRate

    const expectedTotal = totalCashOuts + totalPointsValue
    const difference = Math.abs(totalBuyIns - expectedTotal)

    if (difference > 0.01) {
      warnings.push(
        `Financial inconsistency: Buy-ins ${totalBuyIns}, Cash-outs + Points Value ${expectedTotal}, Difference ${difference}`,
      )
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      repaired: false,
    }
  }

  /**
   * Repair a session by fixing common issues
   */
  static repairSession(session: GameSession): GameSession {
    const repairedSession = { ...session }

    // Repair physical points calculation
    let calculatedPhysicalPoints = 0
    for (const player of repairedSession.playersInGame) {
      if (player.status === "active") {
        calculatedPhysicalPoints += player.pointStack
      } else if (player.status === "cashed_out_early") {
        calculatedPhysicalPoints += player.pointsLeftOnTable || 0
      }
    }

    repairedSession.currentPhysicalPointsOnTable = calculatedPhysicalPoints

    // Repair player data
    repairedSession.playersInGame = repairedSession.playersInGame.map((player) => {
      const repairedPlayer = { ...player }

      // Ensure early cashout players have correct state
      if (repairedPlayer.status === "cashed_out_early") {
        if (repairedPlayer.pointStack !== 0) {
          console.warn(`Repairing player ${player.name}: setting point stack to 0 for early cashout`)
          repairedPlayer.pointStack = 0
        }

        if (repairedPlayer.pointsLeftOnTable === undefined) {
          console.warn(`Repairing player ${player.name}: setting pointsLeftOnTable to 0`)
          repairedPlayer.pointsLeftOnTable = 0
        }
      }

      return repairedPlayer
    })

    return repairedSession
  }
}
