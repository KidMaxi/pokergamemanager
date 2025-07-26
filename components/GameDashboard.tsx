"use client"

import type React from "react"
import { useState, useEffect } from "react"
import type { GameSession, Player, GameInvitation, Friendship } from "../types"
import { generateId, formatDate, formatCurrency, calculateDuration, formatDurationCompact } from "../utils"
import Button from "./common/Button"
import Input from "./common/Input"
import Modal from "./common/Modal"
import Card from "./common/Card"
import LiveTimer from "./common/LiveTimer"
import { useAuth } from "../contexts/AuthContext"
import { supabase } from "../lib/supabase"

interface GameDashboardProps {
  players: Player[]
  gameSessions: GameSession[]
  onStartNewGame: (gameSession: GameSession) => void
  onSelectGame: (gameId: string) => void
  onDeleteGame: (gameId: string) => void
}

interface GameSessionCardProps {
  session: GameSession
  onSelectGame: (gameId: string) => void
  onConfirmDelete: (gameId: string, gameName: string, gameStatus: GameSession["status"]) => void
}

const GameSessionCard: React.FC<GameSessionCardProps> = ({ session, onSelectGame, onConfirmDelete }) => {
  const totalBuyInsCash = session.playersInGame.reduce((sum, p) => sum + p.buyIns.reduce((s, b) => s + b.amount, 0), 0)
  const totalBuyInEntries = session.playersInGame.reduce((count, p) => count + p.buyIns.length, 0)

  const getStatusColor = (status: GameSession["status"]) => {
    if (status === "active") return "text-green-400"
    if (status === "completed") return "text-red-400"
    if (status === "pending_close") return "text-yellow-400"
    return "text-text-secondary"
  }

  const getStatusText = (status: GameSession["status"]) => {
    if (status === "pending_close") return "Pending Closure"
    return status.charAt(0).toUpperCase() + status.slice(1)
  }

  const getButtonVariant = (status: GameSession["status"]): "primary" | "secondary" => {
    if (status === "active" || status === "pending_close") return "primary"
    return "secondary"
  }

  const getButtonText = (status: GameSession["status"]) => {
    if (status === "active") return "Open Game"
    if (status === "completed") return "View Summary"
    if (status === "pending_close") return "Manage Closure"
    return "View"
  }

  const renderTimePlayed = () => {
    if (session.status === "completed" && session.endTime) {
      const totalDuration = calculateDuration(session.startTime, session.endTime)
      return (
        <p className="text-sm text-text-secondary">
          Total Time Played: <span className="font-mono">{formatDurationCompact(totalDuration)}</span>
        </p>
      )
    } else if (session.status === "active" || session.status === "pending_close") {
      return (
        <p className="text-sm text-text-secondary">
          Time Played: <LiveTimer startTime={session.startTime} className="text-green-400" />
        </p>
      )
    }
    return null
  }

  return (
    <Card className="mb-3 sm:mb-4 hover:shadow-xl transition-shadow">
      <div className="space-y-3">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center space-x-2">
              <h4 className="text-base sm:text-lg font-semibold text-brand-primary truncate">{session.name}</h4>
              {session.isOwner === false && (
                <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">Invited</span>
              )}
            </div>
            <div className="space-y-1 text-xs sm:text-sm text-text-secondary">
              <p>Started: {formatDate(session.startTime, false)}</p>
              <p>
                Status:{" "}
                <span className={`font-semibold ${getStatusColor(session.status)}`}>
                  {getStatusText(session.status)}
                </span>
              </p>
              {renderTimePlayed()}
              <p>Rate: {formatCurrency(session.pointToCashRate)}/pt</p>
              <p>Players: {session.playersInGame.length}</p>
              <p>
                Buy-ins: {formatCurrency(totalBuyInsCash)} ({totalBuyInEntries})
              </p>
              {session.invitedUsers && session.invitedUsers.length > 0 && (
                <p className="text-blue-400">Invited Users: {session.invitedUsers.length}</p>
              )}
            </div>
          </div>
          {/* Only show delete button for games the user owns */}
          {session.isOwner !== false && (
            <Button
              onClick={() => onConfirmDelete(session.id, session.name, session.status)}
              variant="danger"
              size="sm"
              className="text-xs px-2 py-1 flex-shrink-0"
            >
              Delete
            </Button>
          )}
        </div>
        <Button
          onClick={() => onSelectGame(session.id)}
          size="sm"
          className="w-full text-sm py-2"
          variant={getButtonVariant(session.status)}
        >
          {getButtonText(session.status)}
        </Button>
      </div>
    </Card>
  )
}

interface GameInvitationCardProps {
  invitation: GameInvitation
  onInvitationHandled: () => void
}

const GameInvitationCard: React.FC<GameInvitationCardProps> = ({ invitation, onInvitationHandled }) => {
  const { user } = useAuth()
  const [acceptLoading, setAcceptLoading] = useState(false)
  const [declineLoading, setDeclineLoading] = useState(false)
  const [error, setError] = useState("")

  const handleAccept = async () => {
    if (!user) return

    setAcceptLoading(true)
    setError("")

    try {
      // First, get the user's profile to use their name
      const { data: userProfile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .single()

      if (profileError) {
        throw new Error("Could not fetch user profile")
      }

      // Get the game session details
      const { data: gameSession, error: gameError } = await supabase
        .from("game_sessions")
        .select("*")
        .eq("id", invitation.game_session_id)
        .single()

      if (gameError || !gameSession) {
        throw new Error("Could not fetch game session")
      }

      // Create a new player entry for the accepting user
      const playerName = userProfile.full_name || userProfile.email || "Unknown User"
      const standardBuyInAmount = gameSession.game_metadata?.standardBuyInAmount || 25
      const pointToCashRate = gameSession.point_to_cash_rate || 0.1

      const newPlayer = {
        playerId: `invited-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: playerName,
        pointStack: Math.floor(standardBuyInAmount / pointToCashRate),
        buyIns: [
          {
            logId: `buyin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            amount: standardBuyInAmount,
            time: new Date().toISOString(),
          },
        ],
        cashOutAmount: 0,
        cashOutLog: [],
        status: "active" as const,
      }

      // Get current players and add the new player
      const currentPlayers = gameSession.players_data || []

      // Check if user is already a player (by name matching)
      const existingPlayer = currentPlayers.find((p: any) => p.name.toLowerCase() === playerName.toLowerCase())

      let updatedPlayers = currentPlayers
      if (!existingPlayer) {
        updatedPlayers = [...currentPlayers, newPlayer]
      }

      // Update the game session with the new player
      const { error: updateGameError } = await supabase
        .from("game_sessions")
        .update({
          players_data: updatedPlayers,
        })
        .eq("id", invitation.game_session_id)

      if (updateGameError) {
        throw updateGameError
      }

      // Update the invitation status to accepted
      const { error: updateError } = await supabase
        .from("game_invitations")
        .update({
          status: "accepted",
          updated_at: new Date().toISOString(),
        })
        .eq("id", invitation.id)
        .eq("invitee_id", user.id)

      if (updateError) {
        throw updateError
      }

      // Refresh the page to show the updated game
      onInvitationHandled()
      window.location.reload()
    } catch (error: any) {
      console.error("Error accepting invitation:", error)
      setError("Failed to accept invitation. Please try again.")
    } finally {
      setAcceptLoading(false)
    }
  }

  const handleDecline = async () => {
    if (!user) return

    setDeclineLoading(true)
    setError("")

    try {
      // Update the invitation status to declined
      const { error: updateError } = await supabase
        .from("game_invitations")
        .update({
          status: "declined",
          updated_at: new Date().toISOString(),
        })
        .eq("id", invitation.id)
        .eq("invitee_id", user.id)

      if (updateError) {
        throw updateError
      }

      // Remove the invitation from the UI
      onInvitationHandled()
    } catch (error: any) {
      console.error("Error declining invitation:", error)
      setError("Failed to decline invitation. Please try again.")
    } finally {
      setDeclineLoading(false)
    }
  }

  return (
    <Card className="mb-3 sm:mb-4">
      <div className="space-y-3">
        <h4 className="text-base sm:text-lg font-semibold text-brand-primary truncate">Game Invitation</h4>
        <div className="text-xs sm:text-sm text-text-secondary">
          <p>
            <strong>{invitation.inviter_profile?.full_name || invitation.inviter_profile?.email}</strong> invited you to
            join:
          </p>
          <p className="text-white font-medium">{invitation.game_session?.name}</p>
          <p>
            Started:{" "}
            {invitation.game_session?.start_time ? formatDate(invitation.game_session.start_time, false) : "N/A"}
          </p>
          <p>Invited: {formatDate(invitation.created_at, false)}</p>
        </div>
        <div className="flex space-x-2">
          <Button onClick={handleAccept} variant="primary" size="sm" disabled={acceptLoading}>
            {acceptLoading ? "Accepting..." : "Accept"}
          </Button>
          <Button onClick={handleDecline} variant="ghost" size="sm" disabled={declineLoading}>
            {declineLoading ? "Declining..." : "Decline"}
          </Button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </Card>
  )
}

const GameDashboard: React.FC<GameDashboardProps> = ({
  players,
  gameSessions,
  onStartNewGame,
  onSelectGame,
  onDeleteGame,
}) => {
  const { user } = useAuth()
  const [isNewGameModalOpen, setIsNewGameModalOpen] = useState(false)
  const [newGameName, setNewGameName] = useState(`Poker Game - ${new Date().toLocaleDateString()}`)
  const [pointRate, setPointRate] = useState(0.1)
  const [formError, setFormError] = useState("")
  const [standardBuyInAmount, setStandardBuyInAmount] = useState(25)
  const [selectedFriends, setSelectedFriends] = useState<string[]>([])
  const [friends, setFriends] = useState<Friendship[]>([])
  const [loadingFriends, setLoadingFriends] = useState(false)

  const [gameToDelete, setGameToDelete] = useState<{ id: string; name: string; status: GameSession["status"] } | null>(
    null,
  )

  const [pendingInvitations, setPendingInvitations] = useState<GameInvitation[]>([])
  const [loadingInvitations, setLoadingInvitations] = useState(true)

  const fetchPendingInvitations = async () => {
    if (!user) return

    try {
      setLoadingInvitations(true)
      const { data, error } = await supabase
        .from("game_invitations")
        .select(`
          *,
          game_session:game_sessions(name, start_time, status),
          inviter_profile:profiles!game_invitations_inviter_id_fkey(full_name, email)
        `)
        .eq("invitee_id", user.id)
        .eq("status", "pending")

      if (error) {
        console.error("Error fetching pending invitations:", error)
        setPendingInvitations([])
      } else {
        setPendingInvitations(data || [])
      }
    } catch (error) {
      console.error("Game invitations feature not available yet:", error)
      setPendingInvitations([])
    } finally {
      setLoadingInvitations(false)
    }
  }

  useEffect(() => {
    fetchPendingInvitations()
  }, [user])

  const handleInvitationHandled = () => {
    // Refresh invitations after handling one
    fetchPendingInvitations()
  }

  const loadFriends = async () => {
    if (!user) return

    setLoadingFriends(true)
    try {
      // Fixed query - use explicit join instead of nested select
      const { data: friendsData, error } = await supabase
        .from("friendships")
        .select(`
          id,
          user_id,
          friend_id,
          created_at
        `)
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

      // Get friend profiles separately
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

  const handleStartNewGameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGameName.trim()) {
      setFormError("Game name cannot be empty.")
      return
    }
    if (pointRate <= 0) {
      setFormError("Point to cash rate must be positive.")
      return
    }
    if (standardBuyInAmount <= 0) {
      setFormError("Standard buy-in amount must be positive.")
      return
    }
    setFormError("")

    const newGameSession: GameSession = {
      id: generateId(),
      name: newGameName.trim(),
      startTime: new Date().toISOString(),
      status: "active",
      pointToCashRate: pointRate,
      standardBuyInAmount: standardBuyInAmount,
      playersInGame: [],
      currentPhysicalPointsOnTable: 0,
      invitedUsers: selectedFriends,
    }

    onStartNewGame(newGameSession)
    setIsNewGameModalOpen(false)
    setNewGameName(`Poker Game - ${new Date().toLocaleDateString()}`)
    setPointRate(0.1)
    setStandardBuyInAmount(25)
    setSelectedFriends([])
  }

  const openDeleteConfirmModal = (gameId: string, gameName: string, gameStatus: GameSession["status"]) => {
    setGameToDelete({ id: gameId, name: gameName, status: gameStatus })
  }

  const confirmDeleteGame = () => {
    if (gameToDelete) {
      onDeleteGame(gameToDelete.id)
      setGameToDelete(null)
    }
  }

  const handleFriendToggle = (friendId: string) => {
    setSelectedFriends((prev) => (prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId]))
  }

  const sortGamesByDateDesc = (a: GameSession, b: GameSession) =>
    new Date(b.startTime).getTime() - new Date(a.startTime).getTime()

  const activeGames = gameSessions.filter((gs) => gs.status === "active").sort(sortGamesByDateDesc)
  const pendingClosureGames = gameSessions.filter((gs) => gs.status === "pending_close").sort(sortGamesByDateDesc)
  const completedGames = gameSessions.filter((gs) => gs.status === "completed").sort(sortGamesByDateDesc)

  return (
    <div className="container mx-auto p-3 sm:p-4">
      <Button
        onClick={() => {
          setIsNewGameModalOpen(true)
          setPointRate(0.1)
          setNewGameName(`Poker Game - ${new Date().toLocaleDateString()}`)
          setFormError("")
          setStandardBuyInAmount(25)
          setSelectedFriends([])
          loadFriends()
        }}
        variant="primary"
        size="lg"
        className="mb-4 sm:mb-6 w-full text-base sm:text-lg py-3 sm:py-4"
      >
        Start New Game
      </Button>

      {!loadingInvitations && pendingInvitations.length > 0 && (
        <section className="mb-8">
          <h3 className="text-2xl font-semibold text-blue-400 mb-4">Game Invitations</h3>
          {pendingInvitations.map((invitation) => (
            <GameInvitationCard
              key={invitation.id}
              invitation={invitation}
              onInvitationHandled={handleInvitationHandled}
            />
          ))}
        </section>
      )}

      {activeGames.length > 0 && (
        <section className="mb-8">
          <h3 className="text-2xl font-semibold text-green-400 mb-4">Active Games</h3>
          {activeGames.map((session) => (
            <GameSessionCard
              key={session.id}
              session={session}
              onSelectGame={onSelectGame}
              onConfirmDelete={openDeleteConfirmModal}
            />
          ))}
        </section>
      )}

      {pendingClosureGames.length > 0 && (
        <section className="mb-8">
          <h3 className="text-2xl font-semibold text-yellow-400 mb-4">Games Pending Closure</h3>
          {pendingClosureGames.map((session) => (
            <GameSessionCard
              key={session.id}
              session={session}
              onSelectGame={onSelectGame}
              onConfirmDelete={openDeleteConfirmModal}
            />
          ))}
        </section>
      )}

      {completedGames.length > 0 && (
        <section className="mb-8">
          <h3 className="text-2xl font-semibold text-red-400 mb-4">Completed Games</h3>
          {completedGames.map((session) => (
            <GameSessionCard
              key={session.id}
              session={session}
              onSelectGame={onSelectGame}
              onConfirmDelete={openDeleteConfirmModal}
            />
          ))}
        </section>
      )}

      {gameSessions.length === 0 && (
        <Card>
          <p className="text-text-secondary text-center">No games yet. Click "Start New Game" to begin!</p>
        </Card>
      )}

      {/* New Game Modal */}
      <Modal isOpen={isNewGameModalOpen} onClose={() => setIsNewGameModalOpen(false)} title="Start New Poker Game">
        <form onSubmit={handleStartNewGameSubmit} className="space-y-4">
          <Input
            label="Game Name"
            id="gameName"
            type="text"
            value={newGameName}
            onChange={(e) => setNewGameName(e.target.value)}
            placeholder="e.g., Friday Night Poker"
          />
          <Input
            label="Point to Cash Rate (e.g., 0.1 for $0.10 per point)"
            id="pointRate"
            type="number"
            step="0.01"
            min="0.01"
            value={pointRate}
            onChange={(e) => setPointRate(Number.parseFloat(e.target.value))}
          />
          <Input
            label="Standard Buy-in Amount ($)"
            id="standardBuyInAmount"
            type="number"
            step="0.01"
            min="0.01"
            value={standardBuyInAmount}
            onChange={(e) => setStandardBuyInAmount(Number.parseFloat(e.target.value))}
            placeholder="e.g., 25.00"
          />

          {/* Friend Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-primary">Invite Friends (Optional)</label>
            {loadingFriends ? (
              <p className="text-sm text-text-secondary">Loading friends...</p>
            ) : friends.length === 0 ? (
              <p className="text-sm text-text-secondary">No friends to invite. Add friends first!</p>
            ) : (
              <div className="max-h-32 overflow-y-auto space-y-2 border border-border-default rounded p-2">
                {friends.map((friendship) => (
                  <label key={friendship.friend_id} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedFriends.includes(friendship.friend_id)}
                      onChange={() => handleFriendToggle(friendship.friend_id)}
                      className="rounded border-border-default"
                    />
                    <span className="text-sm text-text-primary">
                      {friendship.friend_profile?.full_name || friendship.friend_profile?.email}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {selectedFriends.length > 0 && (
              <p className="text-sm text-blue-400">
                {selectedFriends.length} friend{selectedFriends.length > 1 ? "s" : ""} will be invited
              </p>
            )}
          </div>

          {formError && <p className="text-sm text-red-500">{formError}</p>}
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="ghost" onClick={() => setIsNewGameModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Game
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Game Modal */}
      <Modal
        isOpen={!!gameToDelete}
        onClose={() => setGameToDelete(null)}
        title={`Confirm Delete Game: ${gameToDelete?.name || ""}`}
      >
        <p className="text-text-secondary mb-4">
          Are you sure you want to delete the game "{gameToDelete?.name || "this game"}"?
          {(gameToDelete?.status === "active" || gameToDelete?.status === "pending_close") && (
            <strong className="text-red-400 block mt-2">
              This game is not yet completed. Deleting it will discard its current progress.
            </strong>
          )}
          {gameToDelete?.status === "completed" && (
            <span className="text-green-400 block mt-2 text-sm">
              ✓ Your personal stats from this game will be preserved in your profile.
            </span>
          )}
          This action cannot be undone.
        </p>
        <div className="flex justify-end space-x-2">
          <Button type="button" variant="ghost" onClick={() => setGameToDelete(null)}>
            Cancel
          </Button>
          <Button onClick={confirmDeleteGame} variant="danger">
            Delete Game
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export default GameDashboard
