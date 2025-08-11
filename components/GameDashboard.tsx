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
          {/* Show delete button for games the user owns OR for completed invited games */}
          {(session.isOwner !== false || (session.isOwner === false && session.status === "completed")) && (
            <Button
              onClick={() => onConfirmDelete(session.id, session.name, session.status)}
              variant="danger"
              size="sm"
              className="text-xs px-2 py-1 flex-shrink-0"
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
    // Refresh invitations after handling one
    fetchPendingInvitations()
  }

  const loadFriends = async () => {
    if (!user) return

    setLoadingFriends(true)
    try {
      // Get bidirectional friendships - where user is either user_id or friend_id
      const { data: friendsData, error } = await supabase
        .from("friendships")
        .select(`
          id, 
          user_id, 
          friend_id, 
          created_at,
          user_profile:profiles!friendships_user_id_fkey (
            id,
            full_name,
            email,
            all_time_profit_loss,
            games_played,
            total_wins
          ),
          friend_profile:profiles!friendships_friend_id_fkey (
            id,
            full_name,
            email,
            all_time_profit_loss,
            games_played,
            total_wins
          )
        `)
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)

      if (error) {
        console.error("Error loading friendships:", error)
        setFriends([])
        return
      }

      if (!friendsData || friendsData.length === 0) {
        setFriends([])
        return
      }

      // Transform the data to get the friend's profile (not the current user's)
      const friendsWithProfiles = friendsData
        .map((friendship) => {
          // Determine which profile is the friend's profile
          const isUserInitiator = friendship.user_id === user.id
          const friendProfile = isUserInitiator ? friendship.friend_profile : friendship.user_profile
          const friendId = isUserInitiator ? friendship.friend_id : friendship.user_id

          // Filter out self-friendships
          if (friendId === user.id) {
            return null
          }

          return {
            id: friendship.id,
            user_id: friendship.user_id,
            friend_id: friendId,
            created_at: friendship.created_at,
            friend_profile: friendProfile,
          }
        })
        .filter(Boolean) // Remove null entries

      // Deduplicate friends based on friend_id
      const uniqueFriends = new Map()
      friendsWithProfiles.forEach((friend) => {
        if (friend && !uniqueFriends.has(friend.friend_id)) {
          uniqueFriends.set(friend.friend_id, friend)
        }
      })

      setFriends(Array.from(uniqueFriends.values()))
      console.log(`✅ Loaded ${uniqueFriends.size} friends for game invitations`)
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
          <h3 className="text-2xl font-semibold text-blue-400 mb-4">
            🎮 Game Invitations ({pendingInvitations.length})
          </h3>
          <div className="bg-blue-900/10 border border-blue-600 rounded-lg p-3 mb-4">
            <p className="text-blue-200 text-sm">
              💡 <strong>You have pending game invitations!</strong> Accept to join active games and start playing with
              your friends.
            </p>
          </div>
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
          <div className="space-y-3">
            <label className="block text-sm font-medium text-white">Invite Friends (Optional)</label>
            {loadingFriends ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-400"></div>
                <span className="ml-2 text-sm text-gray-400">Loading friends...</span>
              </div>
            ) : friends.length === 0 ? (
              <div className="text-center py-4 bg-slate-800/50 rounded-lg border border-slate-600">
                <p className="text-sm text-gray-400 mb-2">No friends to invite yet</p>
                <p className="text-xs text-gray-500">Add friends from the Friends tab to invite them to games!</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="max-h-40 overflow-y-auto bg-slate-800/50 rounded-lg border border-slate-600 p-3">
                  <div className="space-y-2">
                    {friends.map((friendship) => (
                      <label
                        key={friendship.friend_id}
                        className="flex items-center space-x-3 cursor-pointer hover:bg-slate-700/50 p-2 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={selectedFriends.includes(friendship.friend_id)}
                          onChange={() => handleFriendToggle(friendship.friend_id)}
                          className="rounded border-slate-500 bg-slate-700 text-green-500 focus:ring-green-500 focus:ring-offset-slate-800"
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium text-white">
                            {friendship.friend_profile?.full_name || friendship.friend_profile?.email || "Unknown"}
                          </span>
                          {friendship.friend_profile?.email && friendship.friend_profile?.full_name && (
                            <p className="text-xs text-gray-400">{friendship.friend_profile.email}</p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                {selectedFriends.length > 0 && (
                  <div className="bg-green-900/20 border border-green-600 rounded-lg p-2">
                    <p className="text-sm text-green-400 font-medium">
                      ✓ {selectedFriends.length} friend{selectedFriends.length > 1 ? "s" : ""} will be invited to join
                      this game
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {formError && (
            <div className="bg-red-900/20 border border-red-600 rounded-lg p-3">
              <p className="text-sm text-red-400">{formError}</p>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="ghost" onClick={() => setIsNewGameModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="px-6">
              Create Game & Send Invites
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
        <p className="text-text-secondary mb-4">
          {gameToDelete?.status === "completed" &&
          gameSessions.find((g) => g.id === gameToDelete.id)?.isOwner === false ? (
            <>
              Are you sure you want to remove the game "{gameToDelete?.name || "this game"}" from your dashboard?
              <span className="text-blue-400 block mt-2 text-sm">
                ℹ️ This will only remove it from your view. The original game and your stats will be preserved.
              </span>
            </>
          ) : (
            <>
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
            </>
          )}
        </p>
        <div className="flex justify-end space-x-2">
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
      </Modal>
    </div>
  )
}

export default GameDashboard
