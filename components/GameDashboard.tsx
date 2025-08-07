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
import GameInvitationCard from "./GameInvitationCard"

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
        <div className="flex items-center space-x-2 text-sm text-text-secondary">
          <span>Total Time:</span>
          <span className="font-mono text-brand-primary">{formatDurationCompact(totalDuration)}</span>
        </div>
      )
    } else if (session.status === "active" || session.status === "pending_close") {
      return (
        <div className="flex items-center space-x-2 text-sm text-text-secondary">
          <span>Time Played:</span>
          <LiveTimer startTime={session.startTime} className="text-green-400 font-mono" />
        </div>
      )
    }
    return null
  }

  return (
    <Card className="mb-4 hover:shadow-lg transition-all duration-200">
      <div className="space-y-4">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center space-x-3 mb-2">
              <h4 className="text-lg sm:text-xl font-semibold text-brand-primary truncate">{session.name}</h4>
              {session.isOwner === false && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                  Invited
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="space-y-1">
                <p className="text-text-secondary">
                  <span className="font-medium">Started:</span> {formatDate(session.startTime, false)}
                </p>
                <p className="text-text-secondary">
                  <span className="font-medium">Status:</span>{" "}
                  <span className={`font-semibold ${getStatusColor(session.status)}`}>
                    {getStatusText(session.status)}
                  </span>
                </p>
                {renderTimePlayed()}
              </div>
              <div className="space-y-1">
                <p className="text-text-secondary">
                  <span className="font-medium">Rate:</span> {formatCurrency(session.pointToCashRate)}/pt
                </p>
                <p className="text-text-secondary">
                  <span className="font-medium">Players:</span> {session.playersInGame.length}
                </p>
                <p className="text-text-secondary">
                  <span className="font-medium">Buy-ins:</span> {formatCurrency(totalBuyInsCash)} ({totalBuyInEntries})
                </p>
                {session.invitedUsers && session.invitedUsers.length > 0 && (
                  <p className="text-blue-400">
                    <span className="font-medium">Invited:</span> {session.invitedUsers.length}
                  </p>
                )}
              </div>
            </div>
          </div>
          {(session.isOwner !== false || (session.isOwner === false && session.status === "completed")) && (
            <Button
              onClick={() => onConfirmDelete(session.id, session.name, session.status)}
              variant="danger"
              size="sm"
              className="flex-shrink-0"
              title={
                session.isOwner === false && session.status === "completed"
                  ? "Remove this completed game from your dashboard"
                  : "Delete this game"
              }
            >
              {session.isOwner === false && session.status === "completed" ? "Remove" : "Delete"}
            </Button>
          )}
        </div>
        <Button
          onClick={() => onSelectGame(session.id)}
          size="md"
          className="w-full"
          variant={getButtonVariant(session.status)}
        >
          {getButtonText(session.status)}
        </Button>
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
      console.log("Fetching pending invitations for user:", user.id)

      const { data, error } = await supabase
        .from("game_invitations")
        .select(`
          *,
          game_session:game_sessions(name, start_time, status),
          inviter_profile:profiles!game_invitations_inviter_id_fkey(full_name, email)
        `)
        .eq("invitee_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })

      if (error) {
        console.error("Error fetching pending invitations:", error)
        setPendingInvitations([])
      } else {
        console.log("Fetched pending invitations:", data?.length || 0)
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
    fetchPendingInvitations()
  }

  const loadFriends = async () => {
    if (!user) return

    setLoadingFriends(true)
    try {
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
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <div className="mb-8">
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
          className="w-full text-lg font-semibold"
        >
          🎮 Start New Game
        </Button>
      </div>

      {!loadingInvitations && pendingInvitations.length > 0 && (
        <section className="mb-8">
          <div className="mb-4">
            <h3 className="text-2xl font-bold text-blue-400 mb-2">
              🎮 Game Invitations ({pendingInvitations.length})
            </h3>
            <Card className="bg-blue-900/10 border border-blue-600">
              <div className="flex items-start space-x-3">
                <div className="text-blue-400 text-xl">💡</div>
                <div>
                  <p className="text-blue-200 font-medium">You have pending game invitations!</p>
                  <p className="text-blue-300 text-sm mt-1">
                    Accept to join active games and start playing with your friends.
                  </p>
                </div>
              </div>
            </Card>
          </div>
          <div className="space-y-4">
            {pendingInvitations.map((invitation) => (
              <GameInvitationCard
                key={invitation.id}
                invitation={invitation}
                onInvitationHandled={handleInvitationHandled}
              />
            ))}
          </div>
        </section>
      )}

      {activeGames.length > 0 && (
        <section className="mb-8">
          <h3 className="text-2xl font-bold text-green-400 mb-4">🟢 Active Games</h3>
          <div className="space-y-4">
            {activeGames.map((session) => (
              <GameSessionCard
                key={session.id}
                session={session}
                onSelectGame={onSelectGame}
                onConfirmDelete={openDeleteConfirmModal}
              />
            ))}
          </div>
        </section>
      )}

      {pendingClosureGames.length > 0 && (
        <section className="mb-8">
          <h3 className="text-2xl font-bold text-yellow-400 mb-4">🟡 Games Pending Closure</h3>
          <div className="space-y-4">
            {pendingClosureGames.map((session) => (
              <GameSessionCard
                key={session.id}
                session={session}
                onSelectGame={onSelectGame}
                onConfirmDelete={openDeleteConfirmModal}
              />
            ))}
          </div>
        </section>
      )}

      {completedGames.length > 0 && (
        <section className="mb-8">
          <h3 className="text-2xl font-bold text-red-400 mb-4">🔴 Completed Games</h3>
          <div className="space-y-4">
            {completedGames.map((session) => (
              <GameSessionCard
                key={session.id}
                session={session}
                onSelectGame={onSelectGame}
                onConfirmDelete={openDeleteConfirmModal}
              />
            ))}
          </div>
        </section>
      )}

      {gameSessions.length === 0 && (
        <Card className="text-center py-12">
          <div className="space-y-4">
            <div className="text-6xl">🎲</div>
            <h3 className="text-xl font-semibold text-text-primary">No games yet</h3>
            <p className="text-text-secondary">Click "Start New Game" to begin your first poker session!</p>
          </div>
        </Card>
      )}

      {/* New Game Modal */}
      <Modal isOpen={isNewGameModalOpen} onClose={() => setIsNewGameModalOpen(false)} title="Start New Poker Game">
        <form onSubmit={handleStartNewGameSubmit} className="space-y-6">
          <Input
            label="Game Name"
            id="gameName"
            type="text"
            value={newGameName}
            onChange={(e) => setNewGameName(e.target.value)}
            placeholder="e.g., Friday Night Poker"
          />
          <Input
            label="Point to Cash Rate"
            id="pointRate"
            type="number"
            step="0.01"
            min="0.01"
            value={pointRate}
            onChange={(e) => setPointRate(Number.parseFloat(e.target.value))}
            placeholder="0.10"
          />
          <Input
            label="Standard Buy-in Amount ($)"
            id="standardBuyInAmount"
            type="number"
            step="0.01"
            min="0.01"
            value={standardBuyInAmount}
            onChange={(e) => setStandardBuyInAmount(Number.parseFloat(e.target.value))}
            placeholder="25.00"
          />

          <div className="space-y-3">
            <label className="block text-sm font-medium text-text-primary">Invite Friends (Optional)</label>
            {loadingFriends ? (
              <div className="flex items-center space-x-2 text-text-secondary">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-primary"></div>
                <span>Loading friends...</span>
              </div>
            ) : friends.length === 0 ? (
              <Card className="bg-surface-input">
                <p className="text-text-secondary text-center">No friends to invite. Add friends first!</p>
              </Card>
            ) : (
              <Card className="max-h-40 overflow-y-auto">
                <div className="space-y-3">
                  {friends.map((friendship) => (
                    <label key={friendship.friend_id} className="flex items-center space-x-3 cursor-pointer p-2 rounded-lg hover:bg-surface-input transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedFriends.includes(friendship.friend_id)}
                        onChange={() => handleFriendToggle(friendship.friend_id)}
                        className="rounded border-border-default text-brand-primary focus:ring-brand-primary"
                      />
                      <span className="text-text-primary font-medium">
                        {friendship.friend_profile?.full_name || friendship.friend_profile?.email}
                      </span>
                    </label>
                  ))}
                </div>
              </Card>
            )}
            {selectedFriends.length > 0 && (
              <Card className="bg-blue-900/10 border border-blue-600">
                <p className="text-blue-200 text-sm">
                  <span className="font-medium">{selectedFriends.length}</span> friend{selectedFriends.length > 1 ? "s" : ""} will be invited
                </p>
              </Card>
            )}
          </div>

          {formError && (
            <Card className="bg-red-900/10 border border-red-600">
              <p className="text-red-400 text-sm">{formError}</p>
            </Card>
          )}

          <div className="flex justify-end space-x-3 pt-4">
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
        title={
          gameToDelete?.status === "completed" && gameSessions.find((g) => g.id === gameToDelete.id)?.isOwner === false
            ? `Remove Game: ${gameToDelete?.name || ""}`
            : `Confirm Delete Game: ${gameToDelete?.name || ""}`
        }
      >
        <div className="space-y-4">
          <Card className="bg-yellow-900/10 border border-yellow-600">
            <div className="flex items-start space-x-3">
              <div className="text-yellow-400 text-xl">⚠️</div>
              <div>
                {gameToDelete?.status === "completed" &&
                gameSessions.find((g) => g.id === gameToDelete.id)?.isOwner === false ? (
                  <>
                    <p className="text-text-primary font-medium">
                      Are you sure you want to remove "{gameToDelete?.name}" from your dashboard?
                    </p>
                    <p className="text-blue-400 text-sm mt-2">
                      ℹ️ This will only remove it from your view. The original game and your stats will be preserved.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-text-primary font-medium">
                      Are you sure you want to delete "{gameToDelete?.name}"?
                    </p>
                    {(gameToDelete?.status === "active" || gameToDelete?.status === "pending_close") && (
                      <p className="text-red-400 font-medium mt-2">
                        This game is not yet completed. Deleting it will discard its current progress.
                      </p>
                    )}
                    {gameToDelete?.status === "completed" && (
                      <p className="text-green-400 text-sm mt-2">
                        ✓ Your personal stats from this game will be preserved in your profile.
                      </p>
                    )}
                    <p className="text-text-secondary text-sm mt-2">This action cannot be undone.</p>
                  </>
                )}
              </div>
            </div>
          </Card>

          <div className="flex justify-end space-x-3">
            <Button type="button" variant="ghost" onClick={() => setGameToDelete(null)}>
              Cancel
            </Button>
            <Button onClick={confirmDeleteGame} variant="danger">
              {gameToDelete?.status === "completed" &&
              gameSessions.find((g) => g.id === gameToDelete.id)?.isOwner === false
                ? "Remove from Dashboard"
                : "Delete Game"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default GameDashboard
