"use client"

import type React from "react"
import { useState, useMemo } from "react"
import type { GameSession, PlayerInGame, Player, CashOutLogRecord, BuyInRecord, Friendship } from "../types"
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
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"

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
          <h5 className="text-lg sm:text-xl font-semibold text-brand-primary truncate">{playerInGame.name}</h5>
          {playerInGame.status === "cashed_out_early" && (
            <p className="text-xs sm:text-sm text-yellow-400 font-semibold">Player Cashed Out</p>
          )}
        </div>

        <div className="space-y-1 text-xs sm:text-sm">
          <p className="text-text-primary">
            Points: <span className="font-bold text-white">{playerInGame.pointStack}</span>
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

const ActiveGameScreen: React.FC<ActiveGameScreenProps> = ({
  session,
  players,
  onUpdateSession,
  onEndGame,
  onNavigateToDashboard,
  onAddNewPlayerGlobally,
}) => {
  const { user } = useAuth()
  const [isAddPlayerModalOpen, setIsAddPlayerModalOpen] = useState(false)
  const [newPlayerNameInModal, setNewPlayerNameInModal] = useState("")

  // Add Friend to Game states
  const [isInviteFriendsModalOpen, setIsInviteFriendsModalOpen] = useState(false)
  const [friends, setFriends] = useState<Friendship[]>([])
  const [loadingFriends, setLoadingFriends] = useState(false)
  const [selectedFriendsToInvite, setSelectedFriendsToInvite] = useState<string[]>([])
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState("")
  const [inviteSuccess, setInviteSuccess] = useState("")

  const [isBuyInModalOpen, setIsBuyInModalOpen] = useState(false)
  const [buyInPlayerId, setBuyInPlayerId] = useState<string | null>(null)
  const [buyInAmount, setBuyInAmount] = useState<number>(25)

  const [isCashOutModalOpen, setIsCashOutModalOpen] = useState(false)
  const [cashOutPlayerId, setCashOutPlayerId] = useState<string | null>(null)
  const [cashOutPointAmount, setCashOutPointAmount] = useState<string>("")

  // Buy-in editing states
  const [isEditBuyInModalOpen, setIsEditBuyInModalOpen] = useState(false)
  const [editingBuyIn, setEditingBuyIn] = useState<{ playerId: string; buyInLogId: string; amount: number } | null>(
    null,
  )
  const [editBuyInAmount, setEditBuyInAmount] = useState<number>(0)

  // Buy-in deletion states
  const [isDeleteBuyInModalOpen, setIsDeleteBuyInModalOpen] = useState(false)
  const [deletingBuyIn, setDeletingBuyIn] = useState<{ playerId: string; buyInLogId: string; amount: number } | null>(
    null,
  )

  const [formError, setFormError] = useState("")

  const [isCloseGameConfirmModalOpen, setIsCloseGameConfirmModalOpen] = useState(false)

  const [isFinalizeResultsModalOpen, setIsFinalizeResultsModalOpen] = useState(false)
  const [finalPointInputs, setFinalPointInputs] = useState<Array<{ playerId: string; name: string; points: string }>>(
    [],
  )
  const [physicalPointsForFinalize, setPhysicalPointsForFinalize] = useState<number>(0)
  const [finalizeFormError, setFinalizeFormError] = useState("")

  // Check if current user is the game owner
  const isGameOwner = session.isOwner !== false

  const totalBuyInValueOverall = useMemo(() => {
    return session.playersInGame.reduce((sum, p) => sum + p.buyIns.reduce((s, b) => s + b.amount, 0), 0)
  }, [session.playersInGame])

  const totalCashOutValueAcrossAllPlayers = useMemo(() => {
    return session.playersInGame.reduce((sum, p) => sum + p.cashOutAmount, 0)
  }, [session.playersInGame])

  // Load friends for invitation
  const loadFriendsForInvitation = async () => {
    if (!user) return

    setLoadingFriends(true)
    try {
      // Get friendships
      const { data: friendsData, error } = await supabase
        .from("friendships")
        .select("id, user_id, friend_id, created_at")
        .eq("user_id", user.id)

      if (error) {
        console.error("Error loading friendships:", error)
        setFriends([])
        return
      }

      if (!friendsData || friendsData.length === 0) {
        setFriends([])
        return
      }

      // Get friend profiles
      const friendIds = friendsData.map((f) => f.friend_id)
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", friendIds)

      if (profilesError) {
        console.error("Error loading friend profiles:", profilesError)
        setFriends([])
        return
      }

      // Combine the data
      const friendsWithProfiles = friendsData.map((friendship) => ({
        ...friendship,
        friend_profile: profilesData?.find((p) => p.id === friendship.friend_id),
      }))

      setFriends(friendsWithProfiles)
    } catch (error) {
      console.error("Error loading friends:", error)
      setFriends([])
    } finally {
      setLoadingFriends(false)
    }
  }

  // Filter friends who haven't been invited yet
  const getUninvitedFriends = () => {
    const alreadyInvited = session.invitedUsers || []
    return friends.filter((friend) => !alreadyInvited.includes(friend.friend_id))
  }

  const handleInviteFriendsToGame = async () => {
    if (!user || selectedFriendsToInvite.length === 0) return

    setInviteLoading(true)
    setInviteError("")
    setInviteSuccess("")

    try {
      // Send invitations to selected friends
      const invitations = selectedFriendsToInvite.map((friendId) => ({
        game_session_id: session.id,
        inviter_id: user.id,
        invitee_id: friendId,
        status: "pending" as const,
      }))

      const { error } = await supabase.from("game_invitations").insert(invitations)

      if (error) {
        throw error
      }

      // Update the session's invited users list
      const updatedSession = {
        ...session,
        invitedUsers: [...(session.invitedUsers || []), ...selectedFriendsToInvite],
      }

      onUpdateSession(updatedSession)

      setInviteSuccess(
        `Sent ${selectedFriendsToInvite.length} invitation${selectedFriendsToInvite.length > 1 ? "s" : ""}!`,
      )
      setSelectedFriendsToInvite([])

      // Close modal after a short delay
      setTimeout(() => {
        setIsInviteFriendsModalOpen(false)
        setInviteSuccess("")
      }, 2000)
    } catch (error: any) {
      console.error("Error sending invitations:", error)
      setInviteError("Failed to send invitations. Please try again.")
    } finally {
      setInviteLoading(false)
    }
  }

  const handleFriendInviteToggle = (friendId: string) => {
    setSelectedFriendsToInvite((prev) =>
      prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId],
    )
  }

  // Create a player with automatic standard buy-in
  const createPlayerWithBuyIn = (name: string): PlayerInGame => {
    const initialBuyIn: BuyInRecord = {
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
    if (!newPlayerNameInModal.trim()) {
      setFormError("Player name cannot be empty.")
      return
    }

    const existingPlayerInGame = session.playersInGame.find(
      (p) => p.name.toLowerCase() === newPlayerNameInModal.trim().toLowerCase(),
    )

    if (existingPlayerInGame) {
      setFormError("A player with this name already exists in this game.")
      return
    }

    const newPlayerInGame = createPlayerWithBuyIn(newPlayerNameInModal.trim())

    onUpdateSession({
      ...session,
      playersInGame: [...session.playersInGame, newPlayerInGame],
      currentPhysicalPointsOnTable: session.currentPhysicalPointsOnTable + newPlayerInGame.pointStack,
    })

    setIsAddPlayerModalOpen(false)
    setNewPlayerNameInModal("")
    setFormError("")
  }

  const openBuyInModal = (playerId: string) => {
    setBuyInPlayerId(playerId)
    setBuyInAmount(session.standardBuyInAmount)
    setIsBuyInModalOpen(true)
    setFormError("")
  }

  const handleBuyIn = () => {
    if (!buyInPlayerId || buyInAmount <= 0) {
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
    const pointsToAdd = Math.floor(buyInAmount / session.pointToCashRate)

    const updatedSession = {
      ...session,
      playersInGame: session.playersInGame.map((p) =>
        p.playerId === buyInPlayerId
          ? {
              ...p,
              pointStack: p.pointStack + pointsToAdd,
              buyIns: [...p.buyIns, { logId: generateLogId(), amount: buyInAmount, time: new Date().toISOString() }],
            }
          : p,
      ),
      currentPhysicalPointsOnTable: session.currentPhysicalPointsOnTable + pointsToAdd,
    }
    onUpdateSession(updatedSession)
    setIsBuyInModalOpen(false)
    setBuyInPlayerId(null)
    setFormError("")
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

  const handleCashOut = () => {
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

    // Allow cash out up to player's current point stack
    if (cashOutPoints > player.pointStack) {
      setFormError(`Cannot cash out more than ${player.pointStack} points (player's current stack).`)
      return
    }

    const cashValue = cashOutPoints * session.pointToCashRate
    const newCashOutLogEntry: CashOutLogRecord = {
      logId: generateLogId(),
      pointsCashedOut: cashOutPoints,
      cashValue: cashValue,
      time: new Date().toISOString(),
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
              // Store the points left on table in the cash out log for persistence
              pointsLeftOnTable: pointsRemainingOnTable,
            }
          : p,
      ),
      // Only subtract the points the player actually took, not their full stack
      currentPhysicalPointsOnTable: session.currentPhysicalPointsOnTable - cashOutPoints,
    }
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

    setPhysicalPointsForFinalize(totalPhysicalPoints)

    const activePlayersInputs = session.playersInGame
      .filter((p) => p.status === "active")
      .map((p) => ({
        playerId: p.playerId,
        name: p.name,
        points: p.pointStack.toString(),
      }))

    setFinalPointInputs(activePlayersInputs)
    setFinalizeFormError("")
    setIsFinalizeResultsModalOpen(true)
  }

  const handleConfirmCloseGameAction = () => {
    const newSessionState: GameSession = {
      ...session,
      status: "pending_close",
    }
    onUpdateSession(newSessionState)
    setIsCloseGameConfirmModalOpen(false)
  }

  const handleFinalPointInputChange = (playerId: string, value: string) => {
    setFinalPointInputs((prev) =>
      prev.map((input) => (input.playerId === playerId ? { ...input, points: value } : input)),
    )
  }

  const handleExecuteFinalizeGame = () => {
    let sumOfEnteredFinalPoints = 0
    const parsedInputs: Array<{ playerId: string; points: number }> = []

    for (const input of finalPointInputs) {
      const pointsNum = Number.parseInt(input.points, 10)
      if (isNaN(pointsNum) || pointsNum < 0) {
        setFinalizeFormError(`Invalid point amount for ${input.name}. Must be a non-negative number.`)
        return
      }
      parsedInputs.push({ playerId: input.playerId, points: pointsNum })
      sumOfEnteredFinalPoints += pointsNum
    }

    // Allow finalization if no active players remain OR if points match exactly
    if (finalPointInputs.length > 0 && sumOfEnteredFinalPoints !== physicalPointsForFinalize) {
      setFinalizeFormError(
        `Sum of final points entered (${sumOfEnteredFinalPoints}) does not match total physical points on table (${physicalPointsForFinalize}). Please ensure all points are accounted for.`,
      )
      return
    }

    setFinalizeFormError("")

    const finalizedSession: GameSession = {
      ...session,
      playersInGame: session.playersInGame.map((p) => {
        if (p.status === "cashed_out_early") {
          return p
        }
        const finalInput = parsedInputs.find((fi) => fi.playerId === p.playerId)
        const finalPointsForPlayer = finalInput ? finalInput.points : 0
        const valueOfFinalPoints = finalPointsForPlayer * session.pointToCashRate

        const finalCashOutLogEntry: CashOutLogRecord = {
          logId: generateLogId(),
          pointsCashedOut: finalPointsForPlayer,
          cashValue: valueOfFinalPoints,
          time: new Date().toISOString(),
          editedAt: `Game Settlement @ ${formatTime(new Date().toISOString())}`,
        }

        return {
          ...p,
          cashOutAmount: p.cashOutAmount + valueOfFinalPoints,
          pointStack: 0,
          cashOutLog: [...p.cashOutLog, finalCashOutLogEntry],
          status: "cashed_out_early",
        }
      }),
      status: "completed",
      endTime: new Date().toISOString(),
      currentPhysicalPointsOnTable: 0,
    }

    onEndGame(finalizedSession)
    setIsFinalizeResultsModalOpen(false)
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

      {/* Only show action buttons for game owners */}
      {session.status === "active" && isGameOwner && (
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

      {session.playersInGame.length === 0 && session.status === "active" && (
        <p className="text-text-secondary text-center">
          No players in this game yet.{" "}
          {isGameOwner ? "Add some players to start!" : "Wait for the host to add players."}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {session.playersInGame.map((p) => (
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
          />
        ))}
      </div>

      {/* Only show modals if user is the game owner */}
      {isGameOwner && (
        <>
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
                <Button onClick={handleConfirmCloseGameAction} variant="danger">
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
                <p className="text-text-secondary text-sm">
                  Enter the final point count for each <strong className="text-yellow-300">active</strong> player.
                  Players who already cashed out early are settled. The sum of these points must equal the total
                  physical points remaining on the table.
                </p>
                <p className="text-sm text-text-secondary font-semibold">
                  Total Physical Points on Table to Account For:{" "}
                  <span className="text-white">{physicalPointsForFinalize}</span>
                </p>

                {finalPointInputs.length > 0 ? (
                  finalPointInputs.map((input) => (
                    <div key={input.playerId} className="flex items-center justify-between">
                      <label htmlFor={`final-points-${input.playerId}`} className="text-text-primary mr-2">
                        <span className="text-white">{input.name}</span> (Active):
                      </label>
                      <Input
                        id={`final-points-${input.playerId}`}
                        type="number"
                        value={input.points}
                        onChange={(e) => handleFinalPointInputChange(input.playerId, e.target.value)}
                        placeholder="Final Points"
                        className="w-32"
                        min="0"
                      />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-yellow-300">
                    No active players remaining to finalize, or all points have been cashed out.
                  </p>
                )}

                <div className="bg-slate-700 p-3 rounded-lg border">
                  <p className="text-sm text-text-secondary font-semibold mb-2">Points Entered vs. Table Total:</p>
                  <div className="flex justify-between items-center">
                    <span className="text-text-secondary text-sm">
                      Points Entered:{" "}
                      <span className="text-white">
                        {finalPointInputs.reduce((sum, item) => sum + (Number.parseInt(item.points, 10) || 0), 0)}
                      </span>
                    </span>
                    <span className="text-text-secondary text-sm">
                      Table Total: <span className="text-white">{physicalPointsForFinalize}</span>
                    </span>
                  </div>
                  <div className="mt-2 text-center">
                    {(() => {
                      const enteredSum = finalPointInputs.reduce(
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
                  onClick={handleExecuteFinalizeGame}
                  variant="primary"
                  disabled={
                    (finalPointInputs.length === 0 && physicalPointsForFinalize !== 0) ||
                    (finalPointInputs.length > 0 &&
                      finalPointInputs.reduce((sum, item) => sum + (Number.parseInt(item.points, 10) || 0), 0) !==
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

              {loadingFriends ? (
                <p className="text-sm text-text-secondary">Loading friends...</p>
              ) : getUninvitedFriends().length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-sm text-text-secondary mb-2">
                    {friends.length === 0
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
                  onClick={handleInviteFriendsToGame}
                  variant="primary"
                  disabled={inviteLoading || selectedFriendsToInvite.length === 0}
                >
                  {inviteLoading ? "Sending..." : `Send Invitation${selectedFriendsToInvite.length > 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          </Modal>

          {/* Buy-in Modal */}
          <Modal
            isOpen={isBuyInModalOpen}
            onClose={() => setIsBuyInModalOpen(false)}
            title={`Buy-in for ${session.playersInGame.find((p) => p.playerId === buyInPlayerId)?.name || ""}`}
          >
            <div className="space-y-4">
              <Input
                label="Buy-in Amount (Cash)"
                id="buyInAmount"
                type="number"
                value={buyInAmount}
                onChange={(e) => setBuyInAmount(Number.parseFloat(e.target.value))}
                min="0.01"
                step="0.01"
                disabled={session.status === "pending_close"}
              />
              <p className="text-sm text-text-secondary">
                Player will receive{" "}
                <span className="text-white">
                  {buyInAmount > 0 && session.pointToCashRate > 0
                    ? Math.floor(buyInAmount / session.pointToCashRate)
                    : 0}
                </span>{" "}
                points.
              </p>
              {formError && <p className="text-sm text-red-500">{formError}</p>}
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="ghost" onClick={() => setIsBuyInModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleBuyIn}
                  variant="primary"
                  disabled={buyInAmount <= 0 || session.status === "pending_close"}
                >
                  Confirm Buy-in
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
                label="Buy-in Amount (Cash)"
                id="editBuyInAmount"
                type="number"
                value={editBuyInAmount}
                onChange={(e) => setEditBuyInAmount(Number.parseFloat(e.target.value))}
                min="0.01"
                step="0.01"
              />
              <p className="text-sm text-text-secondary">
                Player will have{" "}
                <span className="text-white">
                  {editBuyInAmount > 0 && session.pointToCashRate > 0
                    ? Math.floor(editBuyInAmount / session.pointToCashRate)
                    : 0}
                </span>{" "}
                points from this buy-in.
              </p>
              {formError && <p className="text-sm text-red-500">{formError}</p>}
              <div className="flex justify-end space-x-2">
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
                <Button onClick={handleEditBuyIn} variant="primary" disabled={editBuyInAmount <= 0}>
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
                <span className="text-white font-semibold">{formatCurrency(deletingBuyIn?.amount || 0)}</span>?
              </p>
              <p className="text-sm text-yellow-300">
                This will remove{" "}
                <span className="text-white font-semibold">
                  {deletingBuyIn ? Math.floor(deletingBuyIn.amount / session.pointToCashRate) : 0} points
                </span>{" "}
                from the player's stack and cannot be undone.
              </p>
              {formError && <p className="text-sm text-red-500">{formError}</p>}
              <div className="flex justify-end space-x-2">
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

          {/* Cash Out Modal */}
          <Modal
            isOpen={isCashOutModalOpen}
            onClose={() => {
              setIsCashOutModalOpen(false)
              setCashOutPointAmount("")
            }}
            title={`Cash out & Leave for ${session.playersInGame.find((p) => p.playerId === cashOutPlayerId)?.name || ""}`}
          >
            <div className="space-y-4">
              <Input
                label="Point Amount to Cash Out from Table"
                id="cashOutPointAmount"
                type="number"
                value={cashOutPointAmount}
                onChange={(e) => setCashOutPointAmount(e.target.value)}
                min="0"
                step="1"
                max={session.currentPhysicalPointsOnTable}
                placeholder="Enter points to cash out"
              />
              <div className="bg-blue-900/20 border border-blue-600 rounded p-3">
                <p className="text-blue-200 text-sm">
                  <strong>Cash Out Rules:</strong> Players can cash out any amount from 0 to{" "}
                  <span className="text-white font-semibold">{session.currentPhysicalPointsOnTable} points</span> (total
                  points on table). Enter 0 if the player is leaving with no money.
                </p>
              </div>
              <p className="text-sm text-text-secondary">
                This player will receive:{" "}
                <span className="text-white font-semibold">
                  {formatCurrency((Number.parseInt(cashOutPointAmount) || 0) * session.pointToCashRate)}
                </span>{" "}
                and will be marked as 'Cashed Out Early'.
                {cashOutPointAmount === "0" && (
                  <span className="block text-yellow-300 mt-1">
                    <strong>Note:</strong> Player is leaving with $0.00 (busted out).
                  </span>
                )}
              </p>
              {formError && <p className="text-sm text-red-500">{formError}</p>}
              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setIsCashOutModalOpen(false)
                    setCashOutPointAmount("")
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCashOut}
                  variant="primary"
                  disabled={
                    cashOutPointAmount === "" ||
                    Number.parseInt(cashOutPointAmount) < 0 ||
                    Number.parseInt(cashOutPointAmount) > session.currentPhysicalPointsOnTable
                  }
                >
                  Confirm Cash Out & Player Leaves
                </Button>
              </div>
            </div>
          </Modal>
        </>
      )}
    </div>
  )
}

export default ActiveGameScreen
