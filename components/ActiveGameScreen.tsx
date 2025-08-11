"use client"

import type React from "react"
import { useState, useEffect } from "react"
import type { GameSession, PlayerInGame, ActiveGameScreenProps } from "../types"
import { generateLogId, formatCurrency, formatElapsedTime } from "../utils"
import Button from "./common/Button"
import Input from "./common/Input"
import Modal from "./common/Modal"
import PaymentSummary from "./PaymentSummary"
// Fixed import path from supabaseClient to lib/supabase
import { supabase } from "../lib/supabase"

const ActiveGameScreen: React.FC<ActiveGameScreenProps> = ({
  session,
  players,
  onUpdateSession,
  onEndGame,
  onNavigateToDashboard,
  onAddNewPlayerGlobally,
  user, // Assuming user is passed as a prop
}) => {
  const [localSession, setLocalSession] = useState<GameSession>(session)
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false)
  const [showBuyInModal, setShowBuyInModal] = useState(false)
  const [showCashOutModal, setShowCashOutModal] = useState(false)
  const [showEndGameModal, setShowEndGameModal] = useState(false)
  const [showAddFriendModal, setShowAddFriendModal] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerInGame | null>(null)
  const [newPlayerName, setNewPlayerName] = useState("")
  const [buyInAmount, setBuyInAmount] = useState("")
  const [cashOutAmount, setCashOutAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [userFriends, setUserFriends] = useState<string[]>([])

  // Sync local session with prop changes
  useEffect(() => {
    setLocalSession(session)
  }, [session])

  useEffect(() => {
    if (user) {
      loadUserFriends()
    }
  }, [user])

  const loadUserFriends = async () => {
    if (!user) return

    try {
      const { data: friendships, error } = await supabase
        .from("friendships")
        .select(`
          user_id,
          friend_id,
          user_profile:profiles!friendships_user_id_fkey (
            id,
            full_name,
            email
          ),
          friend_profile:profiles!friendships_friend_id_fkey (
            id,
            full_name,
            email
          )
        `)
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)

      if (error) throw error

      const friendIds =
        friendships?.map((friendship) => {
          // Get the friend's ID (the one that's not the current user)
          return friendship.user_id === user.id ? friendship.friend_id : friendship.user_id
        }) || []

      setUserFriends(friendIds)
    } catch (error) {
      console.error("Error loading friends:", error)
    }
  }

  const updateSession = (updatedSession: GameSession) => {
    setLocalSession(updatedSession)
    onUpdateSession(updatedSession)
  }

  const calculatePhysicalPoints = (playersInGame: PlayerInGame[]): number => {
    return playersInGame.reduce((total, player) => {
      if (player.status === "active") {
        return total + (player.pointStack || 0)
      } else if (player.status === "cashed_out_early") {
        return total + (player.pointsLeftOnTable || 0)
      }
      return total
    }, 0)
  }

  const handleAddPlayer = async () => {
    if (!newPlayerName.trim()) {
      setError("Player name cannot be empty")
      return
    }

    setLoading(true)
    try {
      // Add player globally first
      const newPlayer = await onAddNewPlayerGlobally(newPlayerName.trim())
      if (!newPlayer) {
        setError("Failed to add player")
        return
      }

      // Create player with initial buy-in
      const initialBuyIn = {
        logId: generateLogId(),
        amount: localSession.standardBuyInAmount,
        time: new Date().toISOString(),
      }

      const pointsFromBuyIn = Math.floor(localSession.standardBuyInAmount / localSession.pointToCashRate)

      const newPlayerInGame: PlayerInGame = {
        playerId: newPlayer.id,
        name: newPlayerName.trim(),
        pointStack: pointsFromBuyIn,
        buyIns: [initialBuyIn],
        cashOutAmount: 0,
        cashOutLog: [],
        status: "active",
      }

      const updatedPlayersInGame = [...localSession.playersInGame, newPlayerInGame]
      const updatedSession = {
        ...localSession,
        playersInGame: updatedPlayersInGame,
        currentPhysicalPointsOnTable: calculatePhysicalPoints(updatedPlayersInGame),
      }

      updateSession(updatedSession)
      setNewPlayerName("")
      setShowAddPlayerModal(false)
      setError("")
    } catch (error) {
      setError("Failed to add player")
    } finally {
      setLoading(false)
    }
  }

  const handleBuyIn = () => {
    if (!selectedPlayer || !buyInAmount.trim()) {
      setError("Please enter a valid buy-in amount")
      return
    }

    const amount = Number.parseFloat(buyInAmount)
    if (isNaN(amount) || amount <= 0) {
      setError("Buy-in amount must be a positive number")
      return
    }

    const newBuyIn = {
      logId: generateLogId(),
      amount: amount,
      time: new Date().toISOString(),
    }

    const pointsFromBuyIn = Math.floor(amount / localSession.pointToCashRate)

    const updatedPlayersInGame = localSession.playersInGame.map((player) => {
      if (player.playerId === selectedPlayer.playerId) {
        return {
          ...player,
          pointStack: player.pointStack + pointsFromBuyIn,
          buyIns: [...player.buyIns, newBuyIn],
          status: "active" as const,
        }
      }
      return player
    })

    const updatedSession = {
      ...localSession,
      playersInGame: updatedPlayersInGame,
      currentPhysicalPointsOnTable: calculatePhysicalPoints(updatedPlayersInGame),
    }

    updateSession(updatedSession)
    setBuyInAmount("")
    setShowBuyInModal(false)
    setSelectedPlayer(null)
    setError("")
  }

  const handleCashOut = () => {
    if (!selectedPlayer || !cashOutAmount.trim()) {
      setError("Please enter a valid cash-out amount")
      return
    }

    const amount = Number.parseFloat(cashOutAmount)
    if (isNaN(amount) || amount < 0) {
      setError("Cash-out amount must be a non-negative number")
      return
    }

    if (amount > selectedPlayer.pointStack) {
      setError(`Cannot cash out more than current points (${selectedPlayer.pointStack})`)
      return
    }

    const cashOutLog = {
      logId: generateLogId(),
      amount: amount,
      time: new Date().toISOString(),
    }

    const updatedPlayersInGame = localSession.playersInGame.map((player) => {
      if (player.playerId === selectedPlayer.playerId) {
        return {
          ...player,
          cashOutAmount: amount,
          cashOutLog: [cashOutLog],
          status: "cashed_out_early" as const,
          pointStack: player.pointStack - amount, // Subtract cashed out points
          pointsLeftOnTable: amount,
        }
      }
      return player
    })

    const updatedSession = {
      ...localSession,
      playersInGame: updatedPlayersInGame,
      currentPhysicalPointsOnTable: calculatePhysicalPoints(updatedPlayersInGame),
    }

    updateSession(updatedSession)
    setCashOutAmount("")
    setShowCashOutModal(false)
    setSelectedPlayer(null)
    setError("")
  }

  const handleEndGame = () => {
    const finalSession = {
      ...localSession,
      status: "completed" as const,
      endTime: new Date().toISOString(),
    }

    onEndGame(finalSession)
    setShowEndGameModal(false)
  }

  const getPlayerTotalBuyIn = (player: PlayerInGame): number => {
    return player.buyIns.reduce((total, buyIn) => total + buyIn.amount, 0)
  }

  const getPlayerProfitLoss = (player: PlayerInGame): number => {
    const totalBuyIn = getPlayerTotalBuyIn(player)
    return player.cashOutAmount - totalBuyIn
  }

  const activePlayers = localSession.playersInGame.filter((p) => p.status === "active")
  const cashedOutPlayers = localSession.playersInGame.filter((p) => p.status === "cashed_out_early")

  const isFriendWithPlayer = (playerId: string): boolean => {
    return userFriends.includes(playerId)
  }

  const isHost = user?.id === localSession.hostId

  const handleSendFriendRequest = async (playerId: string) => {
    if (!user) return

    try {
      setLoading(true)
      const { error } = await supabase.from("friend_requests").insert({
        sender_id: user.id,
        receiver_id: playerId,
        status: "pending",
      })

      if (error) throw error

      setError("Friend request sent!")
      setTimeout(() => setError(""), 3000)
    } catch (error) {
      console.error("Error sending friend request:", error)
      setError("Failed to send friend request")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold text-green-400 mb-2">
                Poker Game - {new Date(localSession.startTime).toLocaleDateString()}
              </h1>
              <div className="text-gray-300 space-y-1">
                <p>Started: {new Date(localSession.startTime).toLocaleDateString()}</p>
                <p>Time: {formatElapsedTime(localSession.startTime)}</p>
                <p>Rate: ${localSession.pointValue}/pt</p>
                <p>Buy-in: ${localSession.buyInAmount}</p>
                <p className="text-green-400">Status: Active</p>
              </div>
            </div>
            {isHost && (
              <Button
                onClick={() => setShowEndGameModal(true)}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2"
              >
                Close Game
              </Button>
            )}
          </div>

          {/* Game Summary */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-gray-400">Total Buy-ins</p>
              <p className="text-2xl font-bold">${localSession.totalBuyIns}</p>
            </div>
            <div>
              <p className="text-gray-400">Current Pot</p>
              <p className="text-2xl font-bold">${localSession.currentPot}</p>
            </div>
            <div>
              <p className="text-gray-400">Points in Play</p>
              <p className="text-2xl font-bold">{localSession.currentPhysicalPointsOnTable}</p>
            </div>
          </div>
        </div>

        {isHost && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Button
              onClick={() => setShowAddPlayerModal(true)}
              className="bg-green-600 hover:bg-green-700 text-white py-3"
            >
              Add New Player to Game
            </Button>
            <Button
              onClick={() => setShowAddFriendModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white py-3"
            >
              Add Friend to Game
            </Button>
          </div>
        )}

        {/* Players */}
        <div className="space-y-4">
          {localSession.playersInGame.map((player) => {
            const isActive = player.pointStack > 0
            const isFriend = isFriendWithPlayer(player.playerId)

            return (
              <div key={player.playerId} className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-semibold text-green-400">{player.name}</h3>
                    {isFriend ? (
                      <div className="w-6 h-6 bg-green-500 rounded flex items-center justify-center">
                        <span className="text-white text-sm">✓</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleSendFriendRequest(player.playerId)}
                        className="w-6 h-6 bg-blue-500 hover:bg-blue-600 rounded flex items-center justify-center cursor-pointer transition-colors"
                        title="Send friend request"
                      >
                        <span className="text-white text-sm">👤</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Player Stats */}
                <div className="grid grid-cols-4 gap-4 mb-4 text-center">
                  <div>
                    <p className="text-gray-400">Points</p>
                    <p className="text-xl font-bold">{player.pointStack}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Buy-ins</p>
                    <p className="text-xl font-bold">
                      ${player.totalBuyInAmount} ({player.buyInLog.length})
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">Cash-outs</p>
                    <p className="text-xl font-bold">${player.cashOutAmount}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">P/L</p>
                    <p className={`text-xl font-bold ${player.profitLoss >= 0 ? "text-green-400" : "text-red-400"}`}>
                      ${player.profitLoss.toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Buy-ins List */}
                {player.buyInLog.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-400 mb-2">Buy-ins:</h4>
                    <div className="space-y-1">
                      {player.buyInLog.map((buyIn) => (
                        <div key={buyIn.logId} className="flex items-center justify-between text-sm">
                          <span>
                            ${buyIn.amount} at {new Date(buyIn.time).toLocaleTimeString()}
                          </span>
                          {isHost && (
                            <div className="flex gap-2">
                              <button className="text-blue-400 hover:text-blue-300">✏️</button>
                              <button className="text-red-400 hover:text-red-300">🗑️</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isHost && isActive && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => {
                        setSelectedPlayer(player)
                        setShowBuyInModal(true)
                      }}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Buy-in
                    </Button>
                    <Button
                      onClick={() => {
                        setSelectedPlayer(player)
                        setShowCashOutModal(true)
                      }}
                      variant="ghost"
                      className="border border-gray-600 hover:bg-gray-700"
                    >
                      Cash Out
                    </Button>
                  </div>
                )}

                {!isHost && (
                  <div className="text-center text-gray-400 text-sm mt-4">
                    Spectator Mode - Only the host can make changes
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Payment Summary */}
        <PaymentSummary session={localSession} />

        {/* Modals */}
        <Modal
          isOpen={showAddPlayerModal}
          onClose={() => {
            setShowAddPlayerModal(false)
            setNewPlayerName("")
            setError("")
          }}
          title="Add Player"
        >
          <div className="space-y-4">
            <Input
              label="Player Name"
              id="playerName"
              type="text"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              placeholder="Enter player name..."
            />
            <p className="text-sm text-gray-400">
              Player will automatically buy-in for {formatCurrency(localSession.standardBuyInAmount)}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setShowAddPlayerModal(false)
                  setNewPlayerName("")
                  setError("")
                }}
                variant="ghost"
              >
                Cancel
              </Button>
              <Button onClick={handleAddPlayer} variant="primary" disabled={loading}>
                {loading ? "Adding..." : "Add Player"}
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={showBuyInModal}
          onClose={() => {
            setShowBuyInModal(false)
            setSelectedPlayer(null)
            setBuyInAmount("")
            setError("")
          }}
          title={`Buy-in for ${selectedPlayer?.name}`}
        >
          <div className="space-y-4">
            <Input
              label="Buy-in Amount"
              id="buyInAmount"
              type="number"
              value={buyInAmount}
              onChange={(e) => setBuyInAmount(e.target.value)}
              placeholder="Enter amount..."
            />
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setShowBuyInModal(false)
                  setSelectedPlayer(null)
                  setBuyInAmount("")
                  setError("")
                }}
                variant="ghost"
              >
                Cancel
              </Button>
              <Button onClick={handleBuyIn} variant="primary">
                Confirm Buy-in
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={showCashOutModal}
          onClose={() => {
            setShowCashOutModal(false)
            setCashOutAmount("")
            setSelectedPlayer(null)
            setError("")
          }}
          title={`Cash Out - ${selectedPlayer?.name}`}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Cash Out Amount (Points)</label>
              <input
                type="number"
                value={cashOutAmount}
                onChange={(e) => setCashOutAmount(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
                placeholder="Enter points to cash out"
                min="0"
                max={selectedPlayer?.pointStack || 0}
              />
              <p className="text-sm text-gray-400 mt-1">Current points: {selectedPlayer?.pointStack || 0}</p>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setShowCashOutModal(false)
                  setCashOutAmount("")
                  setSelectedPlayer(null)
                  setError("")
                }}
                variant="ghost"
              >
                Cancel
              </Button>
              <Button onClick={handleCashOut} disabled={loading}>
                {loading ? "Processing..." : "Cash Out"}
              </Button>
            </div>
          </div>
        </Modal>

        <Modal isOpen={showEndGameModal} onClose={() => setShowEndGameModal(false)} title="End Game">
          <div className="space-y-4">
            <p className="text-white">Are you sure you want to end this game?</p>
            <p className="text-sm text-gray-400">This will finalize all player results and cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setShowEndGameModal(false)} variant="ghost">
                Cancel
              </Button>
              <Button onClick={handleEndGame} variant="primary">
                End Game
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={showAddFriendModal}
          onClose={() => {
            setShowAddFriendModal(false)
            setError("")
          }}
          title="Add Friend to Game"
        >
          <div className="space-y-4">
            <p className="text-gray-400">Select friends to invite to this game:</p>
            {/* Friend selection would go here - similar to GameDashboard */}
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setShowAddFriendModal(false)
                  setError("")
                }}
                variant="ghost"
              >
                Cancel
              </Button>
              <Button variant="primary">Send Invitations</Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  )
}

export default ActiveGameScreen
