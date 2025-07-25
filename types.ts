export interface Player {
  id: string
  name: string
}

export interface BuyInRecord {
  logId: string
  amount: number
  time: string
  editedAt?: string
}

export interface CashOutLogRecord {
  logId: string
  pointsCashedOut: number
  cashValue: number
  time: string
  editedAt?: string
}

export interface PlayerInGame {
  playerId: string
  name: string
  pointStack: number
  buyIns: BuyInRecord[]
  cashOutAmount: number
  cashOutLog: CashOutLogRecord[]
  status: "active" | "cashed_out_early"
}

export interface GameSession {
  id: string
  name: string
  startTime: string
  endTime?: string
  status: "active" | "completed" | "pending_close"
  pointToCashRate: number
  standardBuyInAmount: number // Add this new field
  playersInGame: PlayerInGame[]
  currentPhysicalPointsOnTable: number
}

export type View = "dashboard" | "activeGame"

export interface GameResult {
  gameId: string
  gameName: string
  startTime: string
  endTime: string
  pointToCashRate: number
  playerResults: {
    playerId: string
    playerName: string
    totalBuyIn: number
    totalCashOut: number
    netProfitLoss: number
  }[]
}
