"use client"

import type React from "react"
import { useState, useMemo, useEffect } from "react"
import type { GameSession, PlayerInGame, Player, CashOutLogRecord, Friendship } from "../types"
import {
  formatCurrency,
  formatDate,
  formatTime,
  generateLogId,
  calculateDuration,
  formatDurationCompact,
} from "../utils"
import Button from "./common/Button"
import Input from "./common/Input"
import Modal from "./common/Modal"
import Card from "./common/Card"
import LiveTimer from "./common/LiveTimer"
import PaymentSummary from "./PaymentSummary"
import FriendInvitationDebugger from "./debug/FriendInvitationDebugger"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"
import { calculatePayments } from "../utils/paymentCalculator"
import { resolveGameParticipants, type ParticipantInfo } from "../utils/participantUtils"

interface ActiveGameScreenProps {
  session: GameSession
  players: Player[]
  onUpdateSession: (updatedSession: GameSession) => void
  onEndGame: (finalizedSession: GameSession) => void
  onNavigateToDashboard: () => void
  onAddNewPlayerGlobally: (playerName: string) => Player | null
}

interface PlayerGameCardProps {
  playerInGame: PlayerInGame
  pointRate: number
  onBuyIn: () => void
  onCashOut: () => void
  onEditBuyIn: (buyInLogId: string) => void
  onDeleteBuyIn: (buyInLogId: string) => void
  gameStatus: GameSession["status"]
  currentPhysicalPointsOnTable: number
  isGameOwner: boolean
  currentUserId?: string
  friendRequestState?: "none" | "pending" | "friends"
  onSendFriendRequest?: () => void
  isLoadingFriendRequest?: boolean
  hasUserProfile?: boolean
  participantInfo?: ParticipantInfo
}

const PlayerGameCard: React.FC<PlayerGameCardProps> = ({
  playerInGame,
  pointRate,
  onBuyIn,
  onCashOut,
  onEditBuyIn,
  onDeleteBuyIn,
  gameStatus,
  currentPhysicalPointsOnTable,
  isGameOwner,
  currentUserId,
  friendRequestState,
  onSendFriendRequest,
  isLoadingFriendRequest,
  hasUserProfile,
  participantInfo,
}) => {
  const totalBuyInCash = playerInGame.buyIns.reduce((sum, b) => sum + b.amount, 0)
  const netProfitOrLoss =
    playerInGame.cashOutAmount +
    (playerInGame.status === "active" ? playerInGame.pointStack * pointRate : 0) -
    totalBuyInCash

  return (
    <Card className={`mb-3 sm:mb-4 ${playerInGame.status === "cashed_out_early" ? "opacity-60 bg-slate-800" : ""}`}>
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h5 className="text-lg sm:text-xl font-semibold text-brand-primary truncate">{playerInGame.name}</h5>
              {participantInfo?.isRegisteredUser && (
                <span className="text-xs bg-green-600 text-white px-2 py-1 rounded" title="Registered User">
                  ✓
                </span>
              )}
            </div>
            {/* Friend request button - only show for other players who aren't friends AND have user profiles */}
            {currentUserId &&
              playerInGame.name !== currentUserId &&
              hasUserProfile &&
              friendRequestState === "none" &&
              onSendFriendRequest && (
                <button
                  onClick={onSendFriendRequest}
                  disabled={isLoadingFriendRequest}
                  className="ml-2 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded transition-colors flex items-center space-x-1"
                  title="Send Friend Request"
                >
                  {isLoadingFriendRequest ? (
                    <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <span>👥</span>
                      <span className="hidden sm:inline">Add Friend</span>
                    </>
                  )}
                </button>
              )}
            {/* Show friend status indicators - only for players with profiles */}
            {currentUserId &&
              playerInGame.name !== currentUserId &&
              hasUserProfile &&
              friendRequestState === "friends" && (
                <span className="ml-2 px-2 py-1 text-xs bg-green-600 text-white rounded" title="Already Friends">
                  ✓ Friends
                </span>
              )}
            {currentUserId &&
              playerInGame.name !== currentUserId &&
              hasUserProfile &&
              friendRequestState === "pending" && (
                <span
                  className="ml-2 px-2 py-1 text-xs bg-yellow-600 text-white rounded"
                  title="Friend Request Pending"
                >
                  ⏳ Pending
                </span>
              )}
          </div>
          {playerInGame.status === "cashed_out_early" && (
            <div className="space-y-1">
              <p className="text-xs sm:text-sm text-yellow-400 font-semibold">Player Cashed Out Early</p>
              {playerInGame.pointsLeftOnTable !== undefined && playerInGame.pointsLeftOnTable > 0 && (
                <p className="text-xs text-orange-400">Left {playerInGame.pointsLeftOnTable} points on table</p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1 text-xs sm:text-sm">
          <p className="text-text-primary">
            Points: <span className="font-bold text-white">{playerInGame.pointStack}</span>
            {playerInGame.status === "cashed_out_early" && playerInGame.pointsLeftOnTable !== undefined && (
              <span className="text-orange-400 ml-2">(Left: {playerInGame.pointsLeftOnTable})</span>
            )}
          </p>
          <p className="text-text-primary">
            Buy-ins: <span className="text-white">{formatCurrency(totalBuyInCash)}</span> ({playerInGame.buyIns.length})
          </p>
          <p className="text-text-primary">
            Cash-outs: <span className="text-white">{formatCurrency(playerInGame.cashOutAmount)}</span>
          </p>
          <p className="text-text-primary">
            P/L:{" "}
            <span className={`font-bold ${netProfitOrLoss >= 0 ? "text-green-400" : "text-red-400"}`}>
              {formatCurrency(netProfitOrLoss)}
            </span>
          </p>
        </div>

        {/* Buy-in log with mobile optimization */}
        <div>
          <p className="text-xs font-semibold text-text-secondary mb-1">Buy-ins:</p>
          {playerInGame.buyIns.length > 0 ? (
            <div className="space-y-1 max-h-20 overflow-y-auto">
              {playerInGame.buyIns.map((buyIn) => (
                <div key={buyIn.logId} className="flex items-center justify-between bg-slate-800 p-2 rounded text-xs">
                  <div className="flex-1 min-w-0 pr-2">
                    <span className="text-white">{formatCurrency(buyIn.amount)}</span>
                    <span className="text-text-secondary ml-1">at {formatTime(buyIn.time)}</span>
                    {buyIn.editedAt && <em className="text-slate-400 block">(edited)</em>}
                  </div>
                  {/* Only show edit/delete buttons if user is the game owner */}
                  {gameStatus !== "completed" && isGameOwner && (
                    <div className="flex space-x-1 flex-shrink-0">
                      <button
                        onClick={() => onEditBuyIn(buyIn.logId)}
                        className="text-blue-400 hover:text-blue-300 p-1"
                        title="Edit"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => onDeleteBuyIn(buyIn.logId)}
                        className="text-red-400 hover:text-red-300 p-1"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-text-secondary">None yet</p>
          )}
        </div>

        {/* Action buttons - only show if user is the game owner */}
        {gameStatus !== "completed" && playerInGame.status === "active" && isGameOwner && (
          <div className="flex space-x-2 pt-2">
            <Button
              onClick={onBuyIn}
              size="sm"
              variant="secondary"
              disabled={gameStatus === "pending_close"}
              className="flex-1 text-xs py-2"
            >
              Buy-in
            </Button>
            <Button
              onClick={onCashOut}
              size="sm"
              variant="ghost"
              className="flex-1 bg-gray-600 text-white hover:bg-gray-700 text-xs py-2"
              disabled={gameStatus === "pending_close"}
            >
              Cash Out
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

interface BuyInLog {
  logId: string
  amount: number
  time: string
}

interface CashOutLog {
  logId: string
  amount: number
  time: string
}

export default function ActiveGameScreen({
  session,
  players,
  onUpdateSession,
  onEndGame,
  onNavigateToDashboard,
  onAddNewPlayerGlobally,
}: ActiveGameScreenProps) {
  const { user } = useAuth()
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false)
  const [showBuyInModal, setShowBuyInModal] = useState(false)
  const [showCashOutModal, setShowCashOutModal] = useState(false)
  const [showEndGameModal, setShowEndGameModal] = useState(false)
  const [showCloseGameModal, setShowCloseGameModal] = useState(false)
  const [showFinalizeGameModal, setShowFinalizeGameModal] = useState(false)
  const [showInviteFriendsModal, setShowInviteFriendsModal] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerInGame | null>(null)
  const [newPlayerName, setNewPlayerName] = useState("")
  const [buyInAmount, setBuyInAmount] = useState(session.standardBuyInAmount.toString())
  const [cashOutAmount, setCashOutAmount] = useState("")
  const [finalPointInputs, setFinalPointInputs] = useState<{ [playerId: string]: string }>({})
  const [friends, setFriends] = useState<any[]>([])
  const [selectedFriends, setSelectedFriends] = useState<string[]>([])
  const [loadingFriends, setLoadingFriends] = useState(false)
  const [showPaymentSummary, setShowPaymentSummary] = useState(false)
  const [showFriendInviteDebugger, setShowFriendInviteDebugger] = useState(false)
  const [isAddPlayerModalOpen, setIsAddPlayerModalOpen] = useState(false)
  const [newPlayerNameInModal, setNewPlayerNameInModal] = useState("")
  const [isInviteFriendsModalOpen, setIsInviteFriendsModalOpen] = useState(false)
  const [friendsOld, setFriendsOld] = useState<Friendship[]>([])
  const [loadingFriendsOld, setLoadingFriendsOld] = useState(false)
  const [selectedFriendsToInvite, setSelectedFriendsToInvite] = useState<string[]>([])
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState("")
  const [inviteSuccess, setInviteSuccess] = useState("")
  const [showDebugger, setShowDebugger] = useState(false)
  const [friendRequestStates, setFriendRequestStates] = useState<Record<string, "none" | "pending" | "friends">>({})
  const [loadingFriendRequests, setLoadingFriendRequests] = useState<Record<string, boolean>>({})
  const [playersWithProfiles, setPlayersWithProfiles] = useState<Set<string>>(new Set())
  const [isBuyInModalOpen, setIsBuyInModalOpen] = useState(false)
  const [buyInPlayerId, setBuyInPlayerId] = useState<string | null>(null)
  const [buyInAmountOld, setBuyInAmountOld] = useState<number>(25)
  const [isCashOutModalOpen, setIsCashOutModalOpen] = useState(false)
  const [cashOutPlayerId, setCashOutPlayerId] = useState<string | null>(null)
  const [cashOutPointAmount, setCashOutPointAmount] = useState<string>("")
  const [isEditBuyInModalOpen, setIsEditBuyInModalOpen] = useState(false)
  const [editingBuyIn, setEditingBuyIn] = useState<{ playerId: string; buyInLogId: string; amount: number } | null>(
    null,
  )
  const [editBuyInAmount, setEditBuyInAmount] = useState<number>(0)
  const [isDeleteBuyInModalOpen, setIsDeleteBuyInModalOpen] = useState(false)
  const [deletingBuyIn, setDeletingBuyIn] = useState<{ playerId: string; buyInLogId: string; amount: number } | null>(
    null,
  )
  const [formError, setFormError] = useState("")
  const [isCloseGameConfirmModalOpen, setIsCloseGameConfirmModalOpen] = useState(false)
  const [isFinalizeResultsModalOpen, setIsFinalizeResultsModalOpen] = useState(false)
  const [finalPointInputsOld, setFinalPointInputsOld] = useState<
    Array<{ playerId: string; name: string; points: string }>
  >([])
  const [physicalPointsForFinalize, setPhysicalPointsForFinalize] = useState<number>(0)
  const [finalizeFormError, setFinalizeFormError] = useState("")
  const isGameOwner = session.isOwner !== false
  const [showConfirmCloseModal, setShowConfirmCloseModal] = useState(false)
  const [participantInfo, setParticipantInfo] = useState<ParticipantInfo[]>([])
  const [loadingParticipants, setLoadingParticipants] = useState(false)

  // Initialize final point inputs when entering pending_close state
  useEffect(() => {
    if (session.status === "pending_close") {
      const inputs: { [playerId: string]: string } = {}
      session.playersInGame.forEach((player) => {
        if (player.status === "active") {
          inputs[player.playerId] = (player.pointStack || 0).toString()
        }
      })
      setFinalPointInputs(inputs)
    }
  }, [session.status, session.playersInGame])

  // Load friends when invite modal opens
  useEffect(() => {
    if (showInviteFriendsModal) {
      loadFriends()
    }
  }, [showInviteFriendsModal])

  // Load participant information when players change
  useEffect(() => {
    if (session.playersInGame.length > 0) {
      loadParticipantInfo()
    }
  }, [session.playersInGame])

  const loadFriends = async () => {
    if (!user) return

    setLoadingFriends(true)
    try {
      // Get accepted friendships where current user is either the requester or receiver
      const { data: friendships, error } = await supabase
        .from("friendships")
        .select(`
          id,
          requester_id,
          receiver_id,
          requester:profiles!friendships_requester_id_fkey(id, full_name, email),
          receiver:profiles!friendships_receiver_id_fkey(id, full_name, email)
        `)
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)

      if (error) {
        console.error("Error loading friends:", error)
        return
      }

      // Transform friendships to get the friend (not the current user)
      const friendsList =
        friendships?.map((friendship) => {
          const isRequester = friendship.requester_id === user.id
          return isRequester ? friendship.receiver : friendship.requester
        }) || []

      // Filter out friends who are already invited to this game
      const uninvitedFriends = friendsList.filter((friend) => !session.invitedUsers?.includes(friend.id))

      setFriends(uninvitedFriends)
    } catch (error) {
      console.error("Error loading friends:", error)
    } finally {
      setLoadingFriends(false)
    }
  }

  const loadParticipantInfo = async () => {
    if (!session.playersInGame.length) return

    setLoadingParticipants(true)
    try {
      const participants = await resolveGameParticipants(session)
      setParticipantInfo(participants)
      console.log("✅ Loaded participant info:", participants)
    } catch (error) {
      console.error("Error loading participant info:", error)
    } finally {
      setLoadingParticipants(false)
    }
  }

  const handleInviteFriendsToGame = async () => {
    if (!user || selectedFriends.length === 0) return

    try {
      console.log("Inviting friends to game:", selectedFriends)

      // Send invitations to selected friends
      const invitations = selectedFriends.map((friendId) => ({
        game_session_id: session.id,
        inviter_id: user.id,
        invitee_id: friendId,
        status: "pending" as const,
      }))

      const { error: inviteError } = await supabase.from("game_invitations").insert(invitations)

      if (inviteError) {
        console.error("Error sending invitations:", inviteError)
        alert("Failed to send invitations. Please try again.")
        return
      }

      // Update the game session with new invited users
      const updatedInvitedUsers = [...(session.invitedUsers || []), ...selectedFriends]
      const updatedSession = {
        ...session,
        invitedUsers: updatedInvitedUsers,
      }

      console.log("Updating session with new invited users:", updatedInvitedUsers)

      // Update the session in database
      const { error: updateError } = await supabase
        .from("game_sessions")
        .update({ invited_users: updatedInvitedUsers })
        .eq("id", session.id)
        .eq("user_id", user.id)

      if (updateError) {
        console.error("Error updating game session:", updateError)
        alert("Invitations sent but failed to update game. Please refresh the page.")
        return
      }

      // CRITICAL FIX: Call onUpdateSession to propagate changes to parent component
      onUpdateSession(updatedSession)

      // Reset state and close modal
      setSelectedFriends([])
      setShowInviteFriendsModal(false)

      alert(`Successfully invited ${selectedFriends.length} friend(s) to the game!`)
    } catch (error) {
      console.error("Error inviting friends:", error)
      alert("Failed to invite friends. Please try again.")
    }
  }

  const handleAddPlayer = async () => {
    if (!newPlayerName.trim()) {
      alert("Please enter a player name.")
      return
    }

    // Check if player name already exists in the game
    const existingPlayer = session.playersInGame.find(
      (p) => p.name.toLowerCase() === newPlayerName.trim().toLowerCase(),
    )
    if (existingPlayer) {
      alert("A player with this name already exists in the game.")
      return
    }

    // Add player globally first
    const newGlobalPlayer = await onAddNewPlayerGlobally(newPlayerName.trim())
    if (!newGlobalPlayer) return

    // Create player with initial buy-in
    const initialBuyIn = {
      logId: generateLogId(),
      amount: session.standardBuyInAmount,
      time: new Date().toISOString(),
    }

    const pointsFromBuyIn = Math.floor(session.standardBuyInAmount / session.pointToCashRate)

    const newPlayerInGame: PlayerInGame = {
      playerId: newGlobalPlayer.id,
      name: newPlayerName.trim(),
      pointStack: pointsFromBuyIn,
      buyIns: [initialBuyIn],
      cashOutAmount: 0,
      cashOutLog: [],
      status: "active",
    }

    const updatedSession = {
      ...session,
      playersInGame: [...session.playersInGame, newPlayerInGame],
      currentPhysicalPointsOnTable: session.currentPhysicalPointsOnTable + pointsFromBuyIn,
    }

    onUpdateSession(updatedSession)
    setNewPlayerName("")
    setShowAddPlayerModal(false)
  }

  const handleBuyIn = () => {
    if (!selectedPlayer) return

    const amount = Number.parseFloat(buyInAmount)
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid buy-in amount.")
      return
    }

    const newBuyIn = {
      logId: generateLogId(),
      amount: amount,
      time: new Date().toISOString(),
    }

    const pointsFromBuyIn = Math.floor(amount / session.pointToCashRate)

    const updatedPlayersInGame = session.playersInGame.map((player) => {
      if (player.playerId === selectedPlayer.playerId) {
        return {
          ...player,
          pointStack: player.pointStack + pointsFromBuyIn,
          buyIns: [...player.buyIns, newBuyIn],
        }
      }
      return player
    })

    const updatedSession = {
      ...session,
      playersInGame: updatedPlayersInGame,
      currentPhysicalPointsOnTable: session.currentPhysicalPointsOnTable + pointsFromBuyIn,
    }

    onUpdateSession(updatedSession)
    setBuyInAmount(session.standardBuyInAmount.toString())
    setShowBuyInModal(false)
    setSelectedPlayer(null)
  }

  const handleCashOut = () => {
    if (!selectedPlayer) return

    const amount = Number.parseFloat(cashOutAmount)
    if (isNaN(amount) || amount < 0) {
      alert("Please enter a valid cash out amount.")
      return
    }

    const cashOutLog = {
      logId: generateLogId(),
      amount: amount,
      time: new Date().toISOString(),
    }

    const updatedPlayersInGame = session.playersInGame.map((player) => {
      if (player.playerId === selectedPlayer.playerId) {
        return {
          ...player,
          cashOutAmount: amount,
          cashOutLog: [...player.cashOutLog, cashOutLog],
          status: "cashed_out_early" as const,
          pointsLeftOnTable: player.pointStack, // Track points left on table
        }
      }
      return player
    })

    const updatedSession = {
      ...session,
      playersInGame: updatedPlayersInGame,
      // Don't subtract points from table yet - they stay until game ends
    }

    onUpdateSession(updatedSession)
    setCashOutAmount("")
    setShowCashOutModal(false)
    setSelectedPlayer(null)
  }

  const handleConfirmCloseGameAction = () => {
    const updatedSession = {
      ...session,
      status: "pending_close" as const,
    }
    onUpdateSession(updatedSession)
    setShowCloseGameModal(false)
  }

  const handleFinalPointInputChange = (playerId: string, value: string) => {
    setFinalPointInputs((prev) => ({
      ...prev,
      [playerId]: value,
    }))
  }

  const handleExecuteFinalizeGame = () => {
    // Validate all inputs
    const activePlayers = session.playersInGame.filter((p) => p.status === "active")
    for (const player of activePlayers) {
      const inputValue = finalPointInputs[player.playerId]
      const points = Number.parseFloat(inputValue)
      if (isNaN(points) || points < 0) {
        alert(`Please enter a valid point count for ${player.name}`)
        return
      }
    }

    // Update all active players with their final point counts
    const updatedPlayersInGame = session.playersInGame.map((player) => {
      if (player.status === "active") {
        const finalPoints = Number.parseFloat(finalPointInputs[player.playerId])
        const cashOutAmount = finalPoints * session.pointToCashRate
        return {
          ...player,
          pointStack: finalPoints,
          cashOutAmount: cashOutAmount,
          status: "completed" as const,
        }
      }
      return player
    })

    const finalizedSession = {
      ...session,
      playersInGame: updatedPlayersInGame,
      status: "completed" as const,
      endTime: new Date().toISOString(),
      currentPhysicalPointsOnTable: 0,
    }

    onEndGame(finalizedSession)
    setShowFinalizeGameModal(false)
  }

  const getPlayerTotalBuyIn = (player: PlayerInGame) => {
    return player.buyIns.reduce((sum, buyIn) => sum + buyIn.amount, 0)
  }

  const getPlayerCurrentValue = (player: PlayerInGame) => {
    if (player.status === "cashed_out_early") {
      return player.cashOutAmount
    }
    return player.pointStack * session.pointToCashRate
  }

  const getPlayerProfitLoss = (player: PlayerInGame) => {
    const totalBuyIn = getPlayerTotalBuyIn(player)
    const currentValue = getPlayerCurrentValue(player)
    return currentValue - totalBuyIn
  }

  const canCloseGame = () => {
    const activePlayers = session.playersInGame.filter((p) => p.status === "active")
    return activePlayers.length >= 1 && session.status === "active"
  }

  const canFinalizeGame = () => {
    return session.status === "pending_close"
  }

  const activePlayers = session.playersInGame.filter((p) => p.status === "active")
  const cashedOutPlayers = session.playersInGame.filter((p) => p.status === "cashed_out_early")

  // Calculate payment summary for completed games
  const paymentSummary = session.status === "completed" ? calculatePayments(session.playersInGame) : null

  // Add Friend to Game states

  // Debug states

  // Friend request states

  // Buy-in editing states

  // Buy-in deletion states

  // Check if current user is the game owner

  // Enhanced game state checks
  const gameStateInfo = useMemo(() => {
    const activePlayers = session.playersInGame.filter((p) => p.status === "active")
    const cashedOutPlayers = session.playersInGame.filter((p) => p.status === "cashed_out_early")

    // Game is considered "active" for invitations if:
    // 1. Session status is "active"
    // 2. User is the owner
    // 3. There are still active players OR the game hasn't been closed yet
    const canInviteFriends = session.status === "active" && isGameOwner
    const canAddPlayers = session.status === "active" && isGameOwner
    const canAddBuyIns = session.status === "active" && isGameOwner

    return {
      activePlayers,
      cashedOutPlayers,
      canInviteFriends,
      canAddPlayers,
      canAddBuyIns,
      hasActivePlayers: activePlayers.length > 0,
      hasCashedOutPlayers: cashedOutPlayers.length > 0,
    }
  }, [session.playersInGame, session.status, isGameOwner])

  const totalBuyInValueOverall = useMemo(() => {
    return session.playersInGame.reduce((sum, p) => sum + p.buyIns.reduce((s, b) => s + b.amount, 0), 0)
  }, [session.playersInGame])

  const totalCashOutValueAcrossAllPlayers = useMemo(() => {
    return session.playersInGame.reduce((sum, p) => sum + p.cashOutAmount, 0)
  }, [session.playersInGame])

  // Load friends for invitation
  const loadFriendsForInvitation = async () => {
    if (!user) return

    setLoadingFriendsOld(true)
    try {
      const { data: friendsData, error } = await supabase
        .from("friendships")
        .select("id, user_id, friend_id, created_at")
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)

      if (error) {
        console.error("Error loading friendships:", error)
        setFriendsOld([])
        return
      }

      if (!friendsData || friendsData.length === 0) {
        setFriendsOld([])
        return
      }

      const friendIds = friendsData.map((f) => (f.user_id === user.id ? f.friend_id : f.user_id))
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", friendIds)

      if (profilesError) {
        console.error("Error loading friend profiles:", profilesError)
        setFriendsOld([])
        return
      }

      const friendsWithProfiles = friendsData.map((friendship) => {
        const friendId = friendship.user_id === user.id ? friendship.friend_id : friendship.user_id
        return {
          ...friendship,
          friend_id: friendId,
          friend_profile: profilesData?.find((p) => p.id === friendId),
        }
      })

      setFriendsOld(friendsWithProfiles)
    } catch (error) {
      console.error("Error loading friends:", error)
      setFriendsOld([])
    } finally {
      setLoadingFriendsOld(false)
    }
  }

  const loadFriendRelationships = async () => {
    if (!user) return

    try {
      const playerIds = session.playersInGame.map((p) => p.playerId).filter(Boolean)
      if (playerIds.length === 0) return

      const { data: friendships, error: friendshipsError } = await supabase
        .from("friendships")
        .select("friend_id, user_id")
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
        .in("friend_id", playerIds.concat(playerIds.map(() => user.id)))

      if (friendshipsError) {
        console.error("Error loading friendships:", friendshipsError)
        return
      }

      // Extract friend IDs considering bidirectional relationships
      const friendIds = new Set<string>()
      friendships?.forEach((f) => {
        if (f.user_id === user.id) {
          friendIds.add(f.friend_id)
        } else if (f.friend_id === user.id) {
          friendIds.add(f.user_id)
        }
      })

      // Load pending friend requests
      const { data: requests, error: requestsError } = await supabase
        .from("friend_requests")
        .select("sender_id, receiver_id")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .eq("status", "pending")

      if (requestsError) {
        console.error("Error loading friend requests:", requestsError)
        return
      }

      const pendingRequestIds = new Set<string>()
      requests?.forEach((r) => {
        if (r.sender_id === user.id) {
          pendingRequestIds.add(r.receiver_id)
        } else if (r.receiver_id === user.id) {
          pendingRequestIds.add(r.sender_id)
        }
      })

      // Update friend request states for all players
      const newStates: Record<string, "none" | "pending" | "friends"> = {}
      session.playersInGame.forEach((player) => {
        if (player.playerId === user.id) {
          newStates[player.name] = "friends" // Self
        } else if (friendIds.has(player.playerId)) {
          newStates[player.name] = "friends"
        } else if (pendingRequestIds.has(player.playerId)) {
          newStates[player.name] = "pending"
        } else {
          newStates[player.name] = "none"
        }
      })

      setFriendRequestStates(newStates)
    } catch (error) {
      console.error("Error in loadFriendRelationships:", error)
    }
  }

  // Send friend request to a player
  const handleSendFriendRequest = async (playerName: string) => {
    if (!user) return

    setLoadingFriendRequests((prev) => ({ ...prev, [playerName]: true }))

    try {
      // Find the target user by their full name
      const { data: targetUser, error: userError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("full_name", playerName)
        .single()

      if (userError || !targetUser) {
        console.error("Target user not found:", userError)
        return
      }

      // Send friend request
      const { error: requestError } = await supabase.from("friend_requests").insert({
        sender_id: user.id,
        receiver_id: targetUser.id,
        status: "pending",
      })

      if (requestError) {
        console.error("Error sending friend request:", requestError)
        return
      }

      // Update local state
      setFriendRequestStates((prev) => ({
        ...prev,
        [playerName]: "pending",
      }))

      console.log(`Friend request sent to ${playerName}`)
    } catch (error) {
      console.error("Error sending friend request:", error)
    } finally {
      setLoadingFriendRequests((prev) => ({ ...prev, [playerName]: false }))
    }
  }

  // Filter friends who haven't been invited yet
  const getUninvitedFriends = () => {
    const alreadyInvited = session.invitedUsers || []
    return friendsOld.filter((friend) => !alreadyInvited.includes(friend.friend_id))
  }

  // FIXED: Enhanced invitation handling with proper error handling and state updates
  const handleInviteFriendsToGameOld = async () => {
    if (!user || selectedFriendsToInvite.length === 0) return

    setInviteLoading(true)
    setInviteError("")
    setInviteSuccess("")

    try {
      console.log("Starting friend invitation process...", {
        gameId: session.id,
        friendsToInvite: selectedFriendsToInvite,
        currentInvitedUsers: session.invitedUsers,
      })

      // Step 1: Create invitation records in database
      const invitations = selectedFriendsToInvite.map((friendId) => ({
        game_session_id: session.id,
        inviter_id: user.id,
        invitee_id: friendId,
        status: "pending" as const,
      }))

      const { data: createdInvitations, error: invitationError } = await supabase
        .from("game_invitations")
        .insert(invitations)
        .select()

      if (invitationError) {
        console.error("Failed to create invitations:", invitationError)
        throw new Error(`Failed to create invitations: ${invitationError.message}`)
      }

      console.log("Invitations created successfully:", createdInvitations)

      // Step 2: Update the game session with new invited users
      const currentInvitedUsers = session.invitedUsers || []
      const updatedInvitedUsers = [...currentInvitedUsers, ...selectedFriendsToInvite]

      const { error: updateError } = await supabase
        .from("game_sessions")
        .update({ invited_users: updatedInvitedUsers })
        .eq("id", session.id)
        .eq("user_id", user.id)

      if (updateError) {
        console.error("Failed to update game session:", updateError)
        throw new Error(`Failed to update game session: ${updateError.message}`)
      }

      console.log("Game session updated with new invited users:", updatedInvitedUsers)

      // Step 3: Update local session state immediately
      const updatedSession = {
        ...session,
        invitedUsers: updatedInvitedUsers,
      }

      // CRITICAL FIX: Call onUpdateSession to propagate changes to parent component
      onUpdateSession(updatedSession)

      console.log("Local session state updated successfully")

      // Step 4: Show success message
      setInviteSuccess(
        `Successfully sent ${selectedFriendsToInvite.length} invitation${selectedFriendsToInvite.length > 1 ? "s" : ""}!`,
      )
      setSelectedFriendsToInvite([])

      // Step 5: Close modal after a short delay
      setTimeout(() => {
        setIsInviteFriendsModalOpen(false)
        setInviteSuccess("")
      }, 2000)

      // Step 6: Refresh friends list to update UI
      await loadFriendsForInvitation()
    } catch (error: any) {
      console.error("Error in friend invitation process:", error)
      setInviteError(`Failed to send invitations: ${error.message}`)
    } finally {
      setInviteLoading(false)
    }
  }

  // Load friend relationships when component mounts or players change
  useEffect(() => {
    if (user && session.playersInGame.length > 0) {
      loadFriendRelationships()
    }
  }, [user, session.playersInGame])

  const handleFriendInviteToggle = (friendId: string) => {
    setSelectedFriendsToInvite((prev) =>
      prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId],
    )
  }

  // Create a player with automatic standard buy-in
  const createPlayerWithBuyIn = (name: string): PlayerInGame => {
    const initialBuyIn = {
      logId: generateLogId(),
      amount: session.standardBuyInAmount,
      time: new Date().toISOString(),
    }

    const pointsFromBuyIn = Math.floor(session.standardBuyInAmount / session.pointToCashRate)

    return {
      playerId: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: name,
      pointStack: pointsFromBuyIn,
      buyIns: [initialBuyIn],
      cashOutAmount: 0,
      cashOutLog: [],
      status: "active",
    }
  }

  const handleAddPlayerToGame = () => {
    console.log("[v0] Adding player to game:", newPlayerName)

    if (!newPlayerName.trim()) {
      console.log("[v0] Empty player name provided")
      return
    }

    try {
      const existingPlayer = session.playersInGame.find(
        (p) => p.name.toLowerCase() === newPlayerName.trim().toLowerCase(),
      )

      if (existingPlayer) {
        console.log("[v0] Player already exists in game:", newPlayerName)
        alert("A player with this name is already in the game.")
        return
      }

      const newPlayer = onAddNewPlayerGlobally(newPlayerName.trim())
      if (!newPlayer) {
        console.log("[v0] Failed to create new player globally")
        alert("Failed to add player. Please try again.")
        return
      }

      const pointsFromBuyIn = Math.floor(session.standardBuyInAmount / session.pointToCashRate)

      const newPlayerInGame: PlayerInGame = {
        playerId: newPlayer.id,
        name: newPlayer.name,
        pointStack: pointsFromBuyIn,
        buyIns: [
          {
            logId: generateLogId(),
            amount: session.standardBuyInAmount,
            time: new Date().toISOString(),
          },
        ],
        cashOutAmount: 0,
        cashOutLog: [],
        status: "active",
      }

      const updatedSession = {
        ...session,
        playersInGame: [...session.playersInGame, newPlayerInGame],
        currentPhysicalPointsOnTable: session.currentPhysicalPointsOnTable + pointsFromBuyIn,
      }

      console.log("[v0] Player added successfully:", newPlayer.name)
      onUpdateSession(updatedSession)
      setNewPlayerName("")
      setShowAddPlayerModal(false)
    } catch (error) {
      console.error("[v0] Error adding player to game:", error)
      alert("Failed to add player. Please try again.")
    }
  }

  const openBuyInModal = (playerId: string) => {
    setBuyInPlayerId(playerId)
    setBuyInAmountOld(session.standardBuyInAmount)
    setIsBuyInModalOpen(true)
    setFormError("")
  }

  const handleBuyInOld = () => {
    console.log("[v0] Starting buy-in process for player:", buyInPlayerId, "amount:", buyInAmountOld)

    if (!buyInPlayerId || buyInAmountOld <= 0) {
      setFormError("Invalid buy-in amount.")
      return
    }

    const player = session.playersInGame.find((p) => p.playerId === buyInPlayerId)
    if (!player || player.status === "cashed_out_early") {
      setFormError("Player not found or has already cashed out.")
      return
    }

    if (session.status === "pending_close" || session.status === "completed") {
      setFormError("Cannot add buy-ins to a game that is closing or completed.")
      return
    }

    try {
      const pointsToAdd = Math.floor(buyInAmountOld / session.pointToCashRate)
      console.log("[v0] Calculated points to add:", pointsToAdd)

      const newBuyIn = {
        logId: generateLogId(),
        amount: buyInAmountOld,
        time: new Date().toISOString(),
      }

      const updatedSession = {
        ...session,
        playersInGame: session.playersInGame.map((p) =>
          p.playerId === buyInPlayerId
            ? {
                ...p,
                pointStack: p.pointStack + pointsToAdd,
                buyIns: [...p.buyIns, newBuyIn],
              }
            : p,
        ),
        currentPhysicalPointsOnTable: session.currentPhysicalPointsOnTable + pointsToAdd,
      }

      console.log("[v0] Buy-in successful, updating session")
      onUpdateSession(updatedSession)
      setIsBuyInModalOpen(false)
      setBuyInPlayerId(null)
      setFormError("")

      console.log("[v0] Buy-in completed successfully for", player.name)
    } catch (error) {
      console.error("[v0] Error processing buy-in:", error)
      setFormError("Failed to process buy-in. Please try again.")
    }
  }

  // Edit Buy-in Functions
  const openEditBuyInModal = (playerId: string, buyInLogId: string) => {
    const player = session.playersInGame.find((p) => p.playerId === playerId)
    const buyIn = player?.buyIns.find((b) => b.logId === buyInLogId)

    if (player && buyIn) {
      setEditingBuyIn({ playerId, buyInLogId, amount: buyIn.amount })
      setEditBuyInAmount(buyIn.amount)
      setIsEditBuyInModalOpen(true)
      setFormError("")
    }
  }

  const handleEditBuyIn = () => {
    if (!editingBuyIn || editBuyInAmount <= 0) {
      setFormError("Invalid buy-in amount.")
      return
    }

    const player = session.playersInGame.find((p) => p.playerId === editingBuyIn.playerId)
    const buyIn = player?.buyIns.find((b) => b.logId === editingBuyIn.buyInLogId)

    if (!player || !buyIn) {
      setFormError("Buy-in record not found.")
      return
    }

    const oldPoints = Math.floor(buyIn.amount / session.pointToCashRate)
    const newPoints = Math.floor(editBuyInAmount / session.pointToCashRate)
    const pointsDifference = newPoints - oldPoints

    const updatedSession = {
      ...session,
      playersInGame: session.playersInGame.map((p) =>
        p.playerId === editingBuyIn.playerId
          ? {
              ...p,
              pointStack: p.pointStack + pointsDifference,
              buyIns: p.buyIns.map((b) =>
                b.logId === editingBuyIn.buyInLogId
                  ? { ...b, amount: editBuyInAmount, editedAt: new Date().toISOString() }
                  : b,
              ),
            }
          : p,
      ),
      currentPhysicalPointsOnTable: session.currentPhysicalPointsOnTable + pointsDifference,
    }

    onUpdateSession(updatedSession)
    setIsEditBuyInModalOpen(false)
    setEditingBuyIn(null)
    setFormError("")
  }

  // Delete Buy-in Functions
  const openDeleteBuyInModal = (playerId: string, buyInLogId: string) => {
    const player = session.playersInGame.find((p) => p.playerId === playerId)
    const buyIn = player?.buyIns.find((b) => b.logId === buyInLogId)

    if (player && buyIn) {
      setDeletingBuyIn({ playerId, buyInLogId, amount: buyIn.amount })
      setIsDeleteBuyInModalOpen(true)
      setFormError("")
    }
  }

  const handleDeleteBuyIn = () => {
    if (!deletingBuyIn) return

    const player = session.playersInGame.find((p) => p.playerId === deletingBuyIn.playerId)
    const buyIn = player?.buyIns.find((b) => b.logId === deletingBuyIn.buyInLogId)

    if (!player || !buyIn) {
      setFormError("Buy-in record not found.")
      return
    }

    // Check if this is the last buy-in for the player
    if (player.buyIns.length === 1) {
      setFormError("Cannot delete the last buy-in. A player must have at least one buy-in.")
      return
    }

    const pointsToRemove = Math.floor(buyIn.amount / session.pointToCashRate)

    const updatedSession = {
      ...session,
      playersInGame: session.playersInGame.map((p) =>
        p.playerId === deletingBuyIn.playerId
          ? {
              ...p,
              pointStack: Math.max(0, p.pointStack - pointsToRemove),
              buyIns: p.buyIns.filter((b) => b.logId !== deletingBuyIn.buyInLogId),
            }
          : p,
      ),
      currentPhysicalPointsOnTable: Math.max(0, session.currentPhysicalPointsOnTable - pointsToRemove),
    }

    onUpdateSession(updatedSession)
    setIsDeleteBuyInModalOpen(false)
    setDeletingBuyIn(null)
    setFormError("")
  }

  const openCashOutModal = (playerId: string) => {
    setCashOutPlayerId(playerId)
    setCashOutPointAmount("") // Reset the point amount
    setIsCashOutModalOpen(true)
    setFormError("")
  }

  const handleCashOutOld = () => {
    const cashOutPoints = cashOutPointAmount === "" ? 0 : Number.parseInt(cashOutPointAmount, 10)

    if (isNaN(cashOutPoints) || cashOutPoints < 0) {
      setFormError("Invalid point amount to cash out. Must be 0 or greater.")
      return
    }

    const player = session.playersInGame.find((p) => p.playerId === cashOutPlayerId)
    if (!player || player.status === "cashed_out_early") {
      setFormError("Player not found or has already cashed out.")
      return
    }

    // Allow cash out up to total physical points on table
    if (cashOutPoints > session.currentPhysicalPointsOnTable) {
      setFormError(`Cannot cash out more than ${session.currentPhysicalPointsOnTable} points (total points on table).`)
      return
    }

    const cashValue = cashOutPoints * session.pointToCashRate
    const newCashOutLogEntry: CashOutLogRecord = {
      logId: generateLogId(),
      pointsCashedOut: cashOutPoints,
      cashValue: cashValue,
      time: new Date().toISOString(),
      editedAt: `Game Settlement @ ${formatTime(new Date().toISOString())}`,
    }

    // Points that remain on the table = player's stack minus what they cash out
    const pointsRemainingOnTable = player.pointStack - cashOutPoints

    const updatedSession = {
      ...session,
      playersInGame: session.playersInGame.map((p) =>
        p.playerId === cashOutPlayerId
          ? {
              ...p,
              pointStack: 0, // Player leaves the game when they cash out
              cashOutAmount: p.cashOutAmount + cashValue,
              cashOutLog: [...p.cashOutLog, newCashOutLogEntry],
              status: "cashed_out_early" as const,
              // Store the points left on table for persistence and finalization
              pointsLeftOnTable: pointsRemainingOnTable,
            }
          : p,
      ),
      // Only subtract the points the player actually took, not their full stack
      currentPhysicalPointsOnTable: session.currentPhysicalPointsOnTable - cashOutPoints,
    }

    console.log("Cash out completed:", {
      playerName: player.name,
      cashOutPoints,
      pointsRemainingOnTable,
      newPhysicalPoints: updatedSession.currentPhysicalPointsOnTable,
    })

    onUpdateSession(updatedSession)
    setIsCashOutModalOpen(false)
    setCashOutPlayerId(null)
    setCashOutPointAmount("")
    setFormError("")
  }

  const handleInitiateCloseGame = () => {
    // Close any open modals first
    setIsAddPlayerModalOpen(false)
    setIsBuyInModalOpen(false)
    setIsCashOutModalOpen(false)
    setIsEditBuyInModalOpen(false)
    setIsDeleteBuyInModalOpen(false)
    setFormError("")
    setIsCloseGameConfirmModalOpen(true)
  }

  const handleConfirmCloseGameActionOld = () => {
    const updatedSession = {
      ...session,
      status: "pending_close" as const,
    }
    onUpdateSession(updatedSession)
    setIsCloseGameConfirmModalOpen(false)
  }

  const handleFinalPointInputChangeOld = (playerId: string, value: string) => {
    setFinalPointInputsOld((prev) =>
      prev.map((input) => (input.playerId === playerId ? { ...input, points: value } : input)),
    )
  }

  const handleExecuteFinalizeGameOld = () => {
    // Validate that all points add up correctly
    const enteredSum = finalPointInputsOld.reduce((sum, item) => sum + (Number.parseInt(item.points, 10) || 0), 0)

    if (enteredSum !== physicalPointsForFinalize) {
      setFinalizeFormError(
        `Points entered (${enteredSum}) must equal physical points on table (${physicalPointsForFinalize})`,
      )
      return
    }

    // Create final cash-out records for all active players
    const updatedPlayersInGame = session.playersInGame.map((player) => {
      const finalInput = finalPointInputsOld.find((input) => input.playerId === player.playerId)

      if (finalInput && player.status === "active") {
        const finalPoints = Number.parseInt(finalInput.points, 10) || 0
        const finalCashValue = finalPoints * session.pointToCashRate

        const finalCashOutRecord: CashOutLogRecord = {
          logId: generateLogId(),
          pointsCashedOut: finalPoints,
          cashValue: finalCashValue,
          time: new Date().toISOString(),
          editedAt: `Game Finalization @ ${formatTime(new Date().toISOString())}`,
        }

        return {
          ...player,
          pointStack: 0,
          cashOutAmount: player.cashOutAmount + finalCashValue,
          cashOutLog: [...player.cashOutLog, finalCashOutRecord],
          status: "cashed_out_early" as const,
        }
      }

      return player
    })

    const finalizedSession: GameSession = {
      ...session,
      playersInGame: updatedPlayersInGame,
      status: "completed",
      endTime: new Date().toISOString(),
      currentPhysicalPointsOnTable: 0,
    }

    onEndGame(finalizedSession)
    setIsFinalizeResultsModalOpen(false)
  }

  const openFinalizeResultsModal = () => {
    // Calculate the correct physical points on table:
    // 1. Points from active players
    // 2. Points left on table by early cashout players (stored in their records)
    const activePlayersPoints = session.playersInGame
      .filter((p) => p.status === "active")
      .reduce((sum, p) => sum + p.pointStack, 0)

    const pointsLeftByEarlyCashouts = session.playersInGame
      .filter((p) => p.status === "cashed_out_early")
      .reduce((sum, p) => sum + (p.pointsLeftOnTable || 0), 0)

    const totalPhysicalPoints = activePlayersPoints + pointsLeftByEarlyCashouts

    console.log("Finalize modal opened:", {
      activePlayersPoints,
      pointsLeftByEarlyCashouts,
      totalPhysicalPoints,
      sessionPhysicalPoints: session.currentPhysicalPointsOnTable,
    })

    setPhysicalPointsForFinalize(totalPhysicalPoints)

    const activePlayersInputs = session.playersInGame
      .filter((p) => p.status === "active")
      .map((p) => ({
        playerId: p.playerId,
        name: p.name,
        points: p.pointStack.toString(),
      }))

    setFinalPointInputsOld(activePlayersInputs)
    setFinalizeFormError("")
    setIsFinalizeResultsModalOpen(true)
  }

  const getStatusTextAndColor = () => {
    switch (session.status) {
      case "active":
        return { text: "Active", color: "text-green-400" }
      case "pending_close":
        return { text: "Pending Closure", color: "text-yellow-400" }
      case "completed":
        return { text: "Completed", color: "text-red-400" }
      default:
        return { text: "Unknown", color: "text-text-secondary" }
    }
  }
  const currentStatusStyle = getStatusTextAndColor()

  if (session.status === "completed") {
    const totalDuration = session.endTime ? calculateDuration(session.startTime, session.endTime) : 0

    return (
      <div className="container mx-auto p-4">
        <Card title={`Game Summary: ${session.name}`}>
          <p className="text-lg text-text-secondary mb-1">This game has ended.</p>
          <p className={`text-sm font-semibold mb-2 ${currentStatusStyle.color}`}>Status: {currentStatusStyle.text}</p>
          <p className="text-text-primary">
            Ended: <span className="text-white">{session.endTime ? formatDate(session.endTime) : "N/A"}</span>
          </p>
          <p className="text-text-primary">
            Total Time Played:{" "}
            <span className="font-mono text-brand-primary">{formatDurationCompact(totalDuration)}</span>
          </p>
          <p className="text-text-primary">
            Point Rate: <span className="text-white">{formatCurrency(session.pointToCashRate)} per point</span>
          </p>
          <p className="text-text-primary">
            Total Buy-in Value: <span className="text-white">{formatCurrency(totalBuyInValueOverall)}</span>
          </p>
          <h4 className="text-xl font-semibold mt-6 mb-3 text-brand-primary">Player Results:</h4>
          {session.playersInGame.length > 0 ? (
            session.playersInGame
              .map((p) => {
                const totalPlayerBuyIn = p.buyIns.reduce((s, b) => s + b.amount, 0)
                const net = p.cashOutAmount - totalPlayerBuyIn
                return { ...p, net }
              })
              .sort((a, b) => b.net - a.net)
              .map((p) => (
                <div key={p.playerId} className="mb-3 p-3 bg-slate-700 rounded-md shadow">
                  <p className="font-semibold text-lg text-white">{p.name}</p>
                  <p className="text-text-primary">
                    Total Buy-in:{" "}
                    <span className="text-white">{formatCurrency(p.buyIns.reduce((s, b) => s + b.amount, 0))}</span> (
                    {p.buyIns.length} {p.buyIns.length === 1 ? "entry" : "entries"})
                  </p>
                  <p className="text-text-primary">
                    Total Value Realized: <span className="text-white">{formatCurrency(p.cashOutAmount)}</span>
                  </p>
                  <p className="text-text-primary">
                    Net P/L:{" "}
                    <span className={`font-bold ${p.net >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {formatCurrency(p.net)}
                    </span>
                  </p>
                </div>
              ))
          ) : (
            <p className="text-text-secondary">No players participated or results are not available.</p>
          )}

          <div className="mt-6">
            <PaymentSummary session={session} />
          </div>

          <Button onClick={onNavigateToDashboard} variant="secondary" className="mt-6 w-full sm:w-auto">
            Back to Dashboard
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-3 sm:p-4">
      <Card className="mb-4 sm:mb-6">
        <div className="space-y-3 sm:space-y-4">
          <div className="flex flex-col space-y-2 sm:space-y-3">
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0 pr-3">
                <h2 className="text-xl sm:text-2xl font-bold text-brand-primary truncate">{session.name}</h2>
                <div className="space-y-1 text-xs sm:text-sm text-text-secondary">
                  <p>Started: {formatDate(session.startTime, false)}</p>
                  <p>
                    Time: <LiveTimer startTime={session.startTime} className="text-green-400" />
                  </p>
                  <p>Rate: {formatCurrency(session.pointToCashRate)}/pt</p>
                  <p>Buy-in: {formatCurrency(session.standardBuyInAmount)}</p>
                  <p className={`font-semibold ${currentStatusStyle.color}`}>Status: {currentStatusStyle.text}</p>
                  {session.isOwner === false && (
                    <p className="text-blue-400 font-semibold">You were invited to this game (Read-only)</p>
                  )}
                  {/* Debug info for game state */}
                  {process.env.NODE_ENV === "development" && (
                    <div className="text-xs text-gray-400 mt-2 p-2 bg-gray-800 rounded">
                      <p>
                        Active: {gameStateInfo.activePlayers.length} | Cashed Out:{" "}
                        {gameStateInfo.cashedOutPlayers.length}
                      </p>
                      <p>
                        Can Invite: {gameStateInfo.canInviteFriends ? "✓" : "✗"} | Can Add:{" "}
                        {gameStateInfo.canAddPlayers ? "✓" : "✗"}
                      </p>
                      <button
                        onClick={() => setShowDebugger(true)}
                        className="mt-1 px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded"
                      >
                        Debug Invitations
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {/* Only show close game button for games the user owns */}
              {session.status === "active" && isGameOwner && (
                <Button
                  onClick={handleInitiateCloseGame}
                  variant="danger"
                  size="sm"
                  className="text-xs px-2 py-1 flex-shrink-0"
                >
                  Close Game
                </Button>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-border-default space-y-2 text-sm sm:text-base">
            <p className="text-text-primary">
              Total Buy-ins: <span className="font-semibold text-white">{formatCurrency(totalBuyInValueOverall)}</span>
            </p>
            <p className="text-text-primary">
              Current Pot:{" "}
              <span className="font-semibold text-white">
                {formatCurrency(totalBuyInValueOverall - totalCashOutValueAcrossAllPlayers)}
              </span>
            </p>
            <p className="text-text-primary">
              Points in Play: <span className="font-semibold text-white">{session.currentPhysicalPointsOnTable}</span>
            </p>
            {/* Show invited users count if any */}
            {session.invitedUsers && session.invitedUsers.length > 0 && (
              <p className="text-text-primary">
                Invited Users: <span className="font-semibold text-blue-400">{session.invitedUsers.length}</span>
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Show different messages based on ownership and game status */}
      {session.status === "pending_close" && isGameOwner && (
        <>
          <Card className="mb-6 bg-yellow-800 border border-yellow-400">
            <h3 className="text-xl font-semibold text-white">Game Pending Closure</h3>
            <p className="text-yellow-100 mt-2">
              No more buy-ins are allowed. Any remaining active players must cash out their points, or their final
              stacks must be recorded to complete the game.
            </p>
          </Card>
          <Button onClick={openFinalizeResultsModal} variant="primary" className="mb-6 w-full sm:w-auto">
            Record Final Standings & Complete Game
          </Button>
        </>
      )}

      {session.status === "pending_close" && !isGameOwner && (
        <Card className="mb-6 bg-yellow-800 border border-yellow-400">
          <h3 className="text-xl font-semibold text-white">Game Pending Closure</h3>
          <p className="text-yellow-100 mt-2">
            This game is being closed by the host. No more buy-ins are allowed. Wait for the host to finalize the
            results.
          </p>
        </Card>
      )}

      {/* Enhanced action buttons - now properly check game state */}
      {gameStateInfo.canAddPlayers && (
        <div className="mb-6 flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
          <Button
            onClick={() => {
              setIsAddPlayerModalOpen(true)
              setNewPlayerNameInModal("")
              setFormError("")
            }}
            variant="primary"
            className="flex-1"
          >
            Add New Player to Game
          </Button>
          {gameStateInfo.canInviteFriends && (
            <Button
              onClick={() => {
                setIsInviteFriendsModalOpen(true)
                setSelectedFriendsToInvite([])
                setInviteError("")
                setInviteSuccess("")
                loadFriendsForInvitation()
              }}
              variant="secondary"
              className="flex-1"
            >
              Add Friend to Game
            </Button>
          )}
        </div>
      )}

      {/* Show read-only message for invited players */}
      {session.status === "active" && !isGameOwner && (
        <Card className="mb-6 bg-blue-900/20 border border-blue-600">
          <h3 className="text-lg font-semibold text-blue-200">Read-Only Access</h3>
          <p className="text-blue-100 mt-2">
            You were invited to view this game. Only the game host can add players, manage buy-ins, and control the game
            flow.
          </p>
        </Card>
      )}

      {/* Enhanced game state messaging */}
      {session.playersInGame.length === 0 && session.status === "active" && (
        <p className="text-text-secondary text-center">
          No players in this game yet.{" "}
          {isGameOwner ? "Add some players to start!" : "Wait for the host to add players."}
        </p>
      )}

      {/* Show helpful message when all players have cashed out but game is still active */}
      {gameStateInfo.hasCashedOutPlayers &&
        !gameStateInfo.hasActivePlayers &&
        session.status === "active" &&
        isGameOwner && (
          <Card className="mb-6 bg-orange-900/20 border border-orange-600">
            <h3 className="text-lg font-semibold text-orange-200">All Players Cashed Out</h3>
            <p className="text-orange-100 mt-2">
              All players have cashed out early, but you can still add new players or invite friends to continue the
              game. The points they left on the table ({session.currentPhysicalPointsOnTable} points) are still in play.
            </p>
          </Card>
        )}

      <div className="space-y-3 sm:space-y-4">
        {/* Active Players */}
        {gameStateInfo.activePlayers.map((p) => {
          const participant = participantInfo.find((info) => info.playerId === p.playerId)
          return (
            <PlayerGameCard
              key={p.playerId}
              playerInGame={p}
              pointRate={session.pointToCashRate}
              onBuyIn={() => openBuyInModal(p.playerId)}
              onCashOut={() => openCashOutModal(p.playerId)}
              onEditBuyIn={(buyInLogId) => openEditBuyInModal(p.playerId, buyInLogId)}
              onDeleteBuyIn={(buyInLogId) => openDeleteBuyInModal(p.playerId, buyInLogId)}
              gameStatus={session.status}
              currentPhysicalPointsOnTable={session.currentPhysicalPointsOnTable}
              isGameOwner={isGameOwner}
              currentUserId={user?.id}
              friendRequestState={friendRequestStates[p.name]}
              onSendFriendRequest={() => handleSendFriendRequest(p.name)}
              isLoadingFriendRequest={loadingFriendRequests[p.name]}
              hasUserProfile={participant?.isRegisteredUser || false}
              participantInfo={participant}
            />
          )
        })}

        {/* Cashed Out Players - Moved to bottom */}
        {gameStateInfo.hasCashedOutPlayers && (
          <>
            <div className="border-t border-gray-600 pt-4 mt-6">
              <h4 className="text-sm font-medium text-gray-400 mb-3">Cashed Out Players</h4>
            </div>
            {gameStateInfo.cashedOutPlayers.map((p) => {
              const participant = participantInfo.find((info) => info.playerId === p.playerId)
              return (
                <PlayerGameCard
                  key={p.playerId}
                  playerInGame={p}
                  pointRate={session.pointToCashRate}
                  onBuyIn={() => openBuyInModal(p.playerId)}
                  onCashOut={() => openCashOutModal(p.playerId)}
                  onEditBuyIn={(buyInLogId) => openEditBuyInModal(p.playerId, buyInLogId)}
                  onDeleteBuyIn={(buyInLogId) => openDeleteBuyInModal(p.playerId, buyInLogId)}
                  gameStatus={session.status}
                  currentPhysicalPointsOnTable={session.currentPhysicalPointsOnTable}
                  isGameOwner={isGameOwner}
                  currentUserId={user?.id}
                  friendRequestState={friendRequestStates[p.name]}
                  onSendFriendRequest={() => handleSendFriendRequest(p.name)}
                  isLoadingFriendRequest={loadingFriendRequests[p.name]}
                  hasUserProfile={participant?.isRegisteredUser || false}
                  participantInfo={participant}
                />
              )
            })}
          </>
        )}
      </div>

      {/* Debug Modal */}
      {showDebugger && <FriendInvitationDebugger gameSessionId={session.id} onClose={() => setShowDebugger(false)} />}

      {/* Only show modals if user is the game owner */}
      {isGameOwner && (
        <>
          {/* Buy-in Modal */}
          <Modal
            isOpen={isBuyInModalOpen}
            onClose={() => {
              setIsBuyInModalOpen(false)
              setBuyInPlayerId(null)
              setFormError("")
            }}
            title="Add Buy-in"
          >
            <div className="space-y-4">
              <Input
                label="Buy-in Amount ($)"
                id="buyInAmount"
                type="number"
                step="0.01"
                min="0.01"
                value={buyInAmountOld}
                onChange={(e) => setBuyInAmountOld(Number.parseFloat(e.target.value))}
                placeholder="25.00"
              />
              {formError && <p className="text-sm text-red-500">{formError}</p>}
              <div className="flex justify-end space-x-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setIsBuyInModalOpen(false)
                    setBuyInPlayerId(null)
                    setFormError("")
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleBuyInOld} variant="primary">
                  Add Buy-in
                </Button>
              </div>
            </div>
          </Modal>

          {/* Cash Out Modal */}
          <Modal
            isOpen={isCashOutModalOpen}
            onClose={() => {
              setIsCashOutModalOpen(false)
              setCashOutPlayerId(null)
              setCashOutPointAmount("")
              setFormError("")
            }}
            title="Cash Out Player"
          >
            <div className="space-y-4">
              <Input
                label="Points to Cash Out"
                id="cashOutPointAmount"
                type="number"
                min="0"
                value={cashOutPointAmount}
                onChange={(e) => setCashOutPointAmount(e.target.value)}
                placeholder="Enter points to cash out (leave empty for 0)"
              />
              <div className="bg-blue-900/20 border border-blue-600 rounded p-3">
                <p className="text-blue-200 text-sm">
                  <strong>Cash Value:</strong>{" "}
                  {formatCurrency(
                    (cashOutPointAmount === "" ? 0 : Number.parseInt(cashOutPointAmount, 10) || 0) *
                      session.pointToCashRate,
                  )}
                </p>
                <p className="text-blue-200 text-sm mt-1">
                  <strong>Available Points on Table:</strong> {session.currentPhysicalPointsOnTable}
                </p>
              </div>
              {formError && <p className="text-sm text-red-500">{formError}</p>}
              <div className="flex justify-end space-x-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setIsCashOutModalOpen(false)
                    setCashOutPlayerId(null)
                    setCashOutPointAmount("")
                    setFormError("")
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleCashOutOld} variant="primary">
                  Cash Out
                </Button>
              </div>
            </div>
          </Modal>

          {/* Edit Buy-in Modal */}
          <Modal
            isOpen={isEditBuyInModalOpen}
            onClose={() => {
              setIsEditBuyInModalOpen(false)
              setEditingBuyIn(null)
              setFormError("")
            }}
            title="Edit Buy-in"
          >
            <div className="space-y-4">
              <Input
                label="Buy-in Amount ($)"
                id="editBuyInAmount"
                type="number"
                step="0.01"
                min="0.01"
                value={editBuyInAmount}
                onChange={(e) => setEditBuyInAmount(Number.parseFloat(e.target.value))}
              />
              {formError && <p className="text-sm text-red-500">{formError}</p>}
              <div className="flex justify-end space-x-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setIsEditBuyInModalOpen(false)
                    setEditingBuyIn(null)
                    setFormError("")
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleEditBuyIn} variant="primary">
                  Save Changes
                </Button>
              </div>
            </div>
          </Modal>

          {/* Delete Buy-in Modal */}
          <Modal
            isOpen={isDeleteBuyInModalOpen}
            onClose={() => {
              setIsDeleteBuyInModalOpen(false)
              setDeletingBuyIn(null)
              setFormError("")
            }}
            title="Delete Buy-in"
          >
            <div className="space-y-4">
              <p className="text-text-secondary">
                Are you sure you want to delete this buy-in of{" "}
                <strong>{deletingBuyIn ? formatCurrency(deletingBuyIn.amount) : ""}</strong>? This action cannot be
                undone.
              </p>
              {formError && <p className="text-sm text-red-500">{formError}</p>}
              <div className="flex justify-end space-x-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setIsDeleteBuyInModalOpen(false)
                    setDeletingBuyIn(null)
                    setFormError("")
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleDeleteBuyIn} variant="danger">
                  Delete Buy-in
                </Button>
              </div>
            </div>
          </Modal>

          {/* Close Game Confirmation Modal */}
          <Modal
            isOpen={isCloseGameConfirmModalOpen}
            onClose={() => setIsCloseGameConfirmModalOpen(false)}
            title="Confirm Close Game"
          >
            <div className="space-y-4">
              <p className="text-text-secondary">
                Are you sure you want to close this game? No more buy-ins will be allowed. You will then need to
                finalize the game by entering each player's final point counts or having them cash out.
              </p>
              <div className="flex justify-end space-x-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setIsCloseGameConfirmModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleConfirmCloseGameActionOld} variant="danger">
                  Confirm Close Game
                </Button>
              </div>
            </div>
          </Modal>

          {/* Finalize Results Modal */}
          <Modal
            isOpen={isFinalizeResultsModalOpen}
            onClose={() => setIsFinalizeResultsModalOpen(false)}
            title="Record Final Game Standings"
          >
            <div>
              <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                <p className="text-white text-sm">
                  Enter the final point count for each <strong className="text-yellow-300">active</strong> player.
                  Players who already cashed out early are settled. The sum of these points must equal the total
                  physical points remaining on the table.
                </p>
                <p className="text-sm text-white font-semibold">
                  Total Physical Points on Table to Account For:{" "}
                  <span className="text-white">{physicalPointsForFinalize}</span>
                </p>

                {/* Show breakdown of physical points */}
                <div className="bg-slate-700 p-3 rounded-lg border text-xs">
                  <p className="font-semibold mb-2 text-white">Physical Points Breakdown:</p>
                  <div className="space-y-1">
                    <p>
                      Active Players: {gameStateInfo.activePlayers.reduce((sum, p) => sum + p.pointStack, 0)} points
                    </p>
                    <p>
                      Left by Early Cashouts:{" "}
                      {gameStateInfo.cashedOutPlayers.reduce((sum, p) => sum + (p.pointsLeftOnTable || 0), 0)} points
                    </p>
                    <p className="font-semibold border-t pt-1">Total: {physicalPointsForFinalize} points</p>
                  </div>
                </div>

                {finalPointInputsOld.length > 0 ? (
                  finalPointInputsOld.map((input) => (
                    <div key={input.playerId} className="flex items-center justify-between">
                      <label htmlFor={`final-points-${input.playerId}`} className="text-white mr-2">
                        <span className="text-white">{input.name}</span> (Active):
                      </label>
                      <Input
                        id={`final-points-${input.playerId}`}
                        type="number"
                        value={input.points}
                        onChange={(e) => handleFinalPointInputChangeOld(input.playerId, e.target.value)}
                        placeholder="Final Points"
                        className="w-32"
                        min="0"
                      />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-white">
                    No active players remaining to finalize, or all points have been cashed out.
                  </p>
                )}

                <div className="bg-slate-700 p-3 rounded-lg border">
                  <p className="text-sm text-white font-semibold mb-2">Points Entered vs. Table Total:</p>
                  <div className="flex justify-between items-center">
                    <span className="text-white text-sm">
                      Points Entered:{" "}
                      <span className="text-white">
                        {finalPointInputsOld.reduce((sum, item) => sum + (Number.parseInt(item.points, 10) || 0), 0)}
                      </span>
                    </span>
                    <span className="text-white text-sm">
                      Table Total: <span className="text-white">{physicalPointsForFinalize}</span>
                    </span>
                  </div>
                  <div className="mt-2 text-center">
                    {(() => {
                      const enteredSum = finalPointInputsOld.reduce(
                        (sum, item) => sum + (Number.parseInt(item.points, 10) || 0),
                        0,
                      )
                      const difference = enteredSum - physicalPointsForFinalize

                      if (difference === 0) {
                        return <span className="text-green-400 font-bold text-lg">✓ Perfect Match (0)</span>
                      } else if (difference > 0) {
                        return <span className="text-red-400 font-bold text-lg">⚠️ Over by +{difference} points</span>
                      } else {
                        return <span className="text-yellow-400 font-bold text-lg">⚠️ Short by {difference} points</span>
                      }
                    })()}
                  </div>
                </div>

                {finalizeFormError && <p className="text-sm text-red-500">{finalizeFormError}</p>}
              </div>
              <div className="flex justify-end space-x-2 pt-4 mt-4 border-t border-border-default">
                <Button type="button" variant="ghost" onClick={() => setIsFinalizeResultsModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleExecuteFinalizeGameOld}
                  variant="primary"
                  disabled={
                    (finalPointInputsOld.length === 0 && physicalPointsForFinalize !== 0) ||
                    (finalPointInputsOld.length > 0 &&
                      finalPointInputsOld.reduce((sum, item) => sum + (Number.parseInt(item.points, 10) || 0), 0) !==
                        physicalPointsForFinalize)
                  }
                >
                  Confirm & Complete Game
                </Button>
              </div>
            </div>
          </Modal>

          {/* Add Player Modal */}
          <Modal
            isOpen={isAddPlayerModalOpen}
            onClose={() => {
              setIsAddPlayerModalOpen(false)
              setNewPlayerNameInModal("")
              setFormError("")
            }}
            title="Add New Player to Game"
          >
            <div className="space-y-4">
              <Input
                label="Player Full Name"
                id="newPlayerNameInModal"
                type="text"
                value={newPlayerNameInModal}
                onChange={(e) => setNewPlayerNameInModal(e.target.value)}
                placeholder="e.g., Alex Johnson"
              />
              <div className="bg-blue-900/20 border border-blue-600 rounded p-3">
                <p className="text-blue-200 text-sm">
                  <strong>Auto Buy-in:</strong> This player will automatically receive a{" "}
                  <span className="text-white font-semibold">{formatCurrency(session.standardBuyInAmount)}</span> buy-in
                  (
                  <span className="text-white font-semibold">
                    {Math.floor(session.standardBuyInAmount / session.pointToCashRate)} points
                  </span>
                  ) when added to the game.
                </p>
              </div>

              {formError && <p className="text-sm text-red-500">{formError}</p>}

              <div className="flex justify-end space-x-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setIsAddPlayerModalOpen(false)
                    setNewPlayerNameInModal("")
                    setFormError("")
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddPlayerToGame}
                  variant="primary"
                  disabled={!newPlayerNameInModal.trim() || session.status === "pending_close"}
                >
                  Add Player with Buy-in
                </Button>
              </div>
            </div>
          </Modal>

          {/* Invite Friends to Game Modal */}
          <Modal
            isOpen={isInviteFriendsModalOpen}
            onClose={() => {
              setIsInviteFriendsModalOpen(false)
              setSelectedFriendsToInvite([])
              setInviteError("")
              setInviteSuccess("")
            }}
            title="Invite Friends to Game"
          >
            <div className="space-y-4">
              <p className="text-text-secondary text-sm">
                Select friends to invite to this active game. They will receive an invitation notification and can join
                the game.
              </p>

              {loadingFriendsOld ? (
                <p className="text-sm text-text-secondary">Loading friends...</p>
              ) : getUninvitedFriends().length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-sm text-text-secondary mb-2">
                    {friendsOld.length === 0
                      ? "No friends available to invite. Add friends first!"
                      : "All your friends have already been invited to this game."}
                  </p>
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-2 border border-border-default rounded p-2">
                  {getUninvitedFriends().map((friendship) => (
                    <label
                      key={friendship.friend_id}
                      className="flex items-center space-x-2 cursor-pointer p-2 hover:bg-surface-input rounded"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFriendsToInvite.includes(friendship.friend_id)}
                        onChange={() => handleFriendInviteToggle(friendship.friend_id)}
                        className="rounded border-border-default"
                      />
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-brand-primary rounded-full flex items-center justify-center text-white text-xs font-bold">
                          {friendship.friend_profile?.full_name?.charAt(0) ||
                            friendship.friend_profile?.email?.charAt(0).toUpperCase() ||
                            "?"}
                        </div>
                        <div>
                          <span className="text-sm text-text-primary font-medium">
                            {friendship.friend_profile?.full_name || "Unknown User"}
                          </span>
                          <p className="text-xs text-text-secondary">{friendship.friend_profile?.email}</p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {selectedFriendsToInvite.length > 0 && (
                <p className="text-sm text-blue-400">
                  {selectedFriendsToInvite.length} friend{selectedFriendsToInvite.length > 1 ? "s" : ""} selected to
                  invite
                </p>
              )}

              {inviteError && <p className="text-sm text-red-500">{inviteError}</p>}
              {inviteSuccess && <p className="text-sm text-green-400">{inviteSuccess}</p>}

              <div className="flex justify-end space-x-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setIsInviteFriendsModalOpen(false)
                    setSelectedFriendsToInvite([])
                    setInviteError("")
                    setInviteSuccess("")
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleInviteFriendsToGameOld}
                  variant="primary"
                  disabled={inviteLoading || selectedFriendsToInvite.length === 0}
                >
                  {inviteLoading ? "Sending..." : `Send Invitation${selectedFriendsToInvite.length > 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          </Modal>
        </>
      )}
    </div>
  )
}
