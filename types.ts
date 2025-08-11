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
  pointsLeftOnTable?: number // Points left on table when cashing out early
}

export interface GameSession {
  id: string
  name: string
  startTime: string
  endTime?: string
  status: "active" | "completed" | "pending_close"
  pointToCashRate: number
  standardBuyInAmount: number
  playersInGame: PlayerInGame[]
  currentPhysicalPointsOnTable: number
  invitedUsers?: string[]
  isOwner?: boolean // Track if the current user owns this game
}

export type View = "dashboard" | "activeGame" | "friends" | "stats"

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

// Friends system types
export interface FriendRequest {
  id: string
  sender_id: string
  receiver_id: string
  status: "pending" | "accepted" | "declined"
  created_at: string
  updated_at: string
  sender_profile?: {
    full_name: string | null
    email: string
  }
  receiver_profile?: {
    full_name: string | null
    email: string
  }
}

export interface Friendship {
  id: string
  user_id: string
  friend_id: string
  created_at: string
  friend_profile?: {
    full_name: string | null
    email: string
    all_time_profit_loss: number
    games_played: number
  }
}

export interface GameInvitation {
  id: string
  game_session_id: string
  inviter_id: string
  invitee_id: string
  status: "pending" | "accepted" | "declined"
  created_at: string
  updated_at: string
  game_session?: {
    name: string
    start_time: string
    status: string
  }
  inviter_profile?: {
    full_name: string | null
    email: string
  }
}

export interface PlayerManagementProps {
  players: Player[]
  gameSessions: GameSession[]
  onAddPlayer: (player: Player) => void
  onEditPlayer: (playerId: string, newName: string) => void
  onDeletePlayer: (playerId: string) => string | null
}

export interface ActiveGameScreenProps {
  session: GameSession
  players: Player[]
  onUpdateSession: (session: GameSession) => void
  onEndGame: (session: GameSession) => void
  onNavigateToDashboard: () => void
  onAddNewPlayerGlobally: (name: string) => Promise<Player | null>
}
