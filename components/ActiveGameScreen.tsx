"use client"

import type React from "react"
import { useState, useEffect } from "react"
import type { GameSession, PlayerInGame, ActiveGameScreenProps } from "../types"
import { generateLogId, formatCurrency, formatElapsedTime, getInitials } from "../utils"
import Button from "./common/Button"
import Input from "./common/Input"
import Modal from "./common/Modal"
import PaymentSummary from "./PaymentSummary"
import { supabase } from "../lib/supabase"
import CheckIcon from "./common/CheckIcon"
import UserIcon from "./common/UserIcon"

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
  const [finalChipAmounts, setFinalChipAmounts] = useState<Record<string, string>>({})

  // Sync local session with prop changes
  useEffect(() => {
    setLocalSession(session)
  }, [session])

  useEffect(() => {
    if (user) {
      loadUserFriends()
    }
  }, [user])

  useEffect(() => {
    if (showEndGameModal) {
      const initialAmounts: Record<string, string> = {}
      localSession.playersInGame.forEach((player) => {
        initialAmounts[player.playerId] = player.pointStack.toString()
      })
      setFinalChipAmounts(initialAmounts)
    }
  }, [showEndGameModal, localSession.playersInGame])

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
        return total + player.pointStack
      }
      return total
    }, 0)
  }

  const calculateTotalBuyIns = (playersInGame: PlayerInGame[]): number => {
    return playersInGame.reduce((total, player) => {
      return total + player.buyIns.reduce((playerTotal, buyIn) => playerTotal + buyIn.amount, 0)
    }, 0)
  }

  const calculateCurrentPot = (playersInGame: PlayerInGame[]): number => {
    const totalBuyIns = calculateTotalBuyIns(playersInGame)
    const totalCashOuts = playersInGame.reduce((total, player) => {
      return total + (player.cashOutAmount || 0)
    }, 0)
    return totalBuyIns - totalCashOuts
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
        totalBuyIns: calculateTotalBuyIns(updatedPlayersInGame),
        currentPot: calculateCurrentPot(updatedPlayersInGame),
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

    const buyInLog = {
      logId: generateLogId(),
      amount: amount,
      time: new Date().toISOString(),
    }

    const pointsFromBuyIn = Math.floor(amount / (localSession.pointValue || 0.1))

    const updatedPlayersInGame = localSession.playersInGame.map((player) => {
      if (player.playerId === selectedPlayer.playerId) {
        return {
          ...player,
          buyIns: [...player.buyIns, { amount, time: new Date().toISOString() }],
          buyInLog: [...(player.buyInLog || []), buyInLog],
          totalBuyInAmount: (player.totalBuyInAmount || 0) + amount,
          pointStack: player.pointStack + pointsFromBuyIn, // Add converted points, not dollars
        }
      }
      return player
    })

    const updatedSession = {
      ...localSession,
      playersInGame: updatedPlayersInGame,
      totalBuyIns: calculateTotalBuyIns(updatedPlayersInGame),
      currentPot: calculateCurrentPot(updatedPlayersInGame),
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
    if (isNaN(amount) || amount <= 0) {
      setError("Cash-out amount must be a positive number")
      return
    }

    if (amount > localSession.currentPhysicalPointsOnTable) {
      setError("Cannot cash out more than total points in play")
      return
    }

    const cashOutLog = {
      logId: generateLogId(),
      amount: amount,
      time: new Date().toISOString(),
    }

    const dollarValue = amount * (localSession.pointValue || 0.1)

    const updatedPlayersInGame = localSession.playersInGame.map((player) => {
      if (player.playerId === selectedPlayer.playerId) {
        return {
          ...player,
          pointStack: player.pointStack - amount,
          cashOutAmount: (player.cashOutAmount || 0) + dollarValue,
          cashOutLog: [...(player.cashOutLog || []), cashOutLog],
          profitLoss:
            (player.pointStack - amount) * (localSession.pointValue || 0.1) +
            dollarValue -
            (player.totalBuyInAmount || 0),
        }
      }
      return player
    })

    const updatedSession = {
      ...localSession,
      playersInGame: updatedPlayersInGame,
      currentPot: Math.max(0, calculateCurrentPot(updatedPlayersInGame)),
      currentPhysicalPointsOnTable: calculatePhysicalPoints(updatedPlayersInGame),
    }

    updateSession(updatedSession)
    setCashOutAmount("")
    setShowCashOutModal(false)
    setSelectedPlayer(null)
    setError("")
  }

  const handleEndGame = () => {
    // Validate that all final chip amounts are filled and >= 0
    const invalidAmounts = Object.entries(finalChipAmounts).filter(([playerId, amount]) => {
      const numAmount = Number.parseFloat(amount)
      return isNaN(numAmount) || numAmount < 0
    })

    if (invalidAmounts.length > 0) {
      setError("All final chip amounts must be filled and ≥ 0")
      return
    }

    // Update players with final chip amounts
    const updatedPlayersInGame = localSession.playersInGame.map((player) => {
      const finalAmount = Number.parseFloat(finalChipAmounts[player.playerId] || "0")
      return {
        ...player,
        pointStack: finalAmount,
        profitLoss: finalAmount * (localSession.pointValue || 0.1) - (player.totalBuyInAmount || 0),
      }
    })

    const finalSession = {
      ...localSession,
      playersInGame: updatedPlayersInGame,
      status: "completed" as const,
      endTime: new Date().toISOString(),
      currentPhysicalPointsOnTable: calculatePhysicalPoints(updatedPlayersInGame),
    }

    onEndGame(finalSession)
    setShowEndGameModal(false)
  }

  const getPlayerTotalBuyIn = (player: PlayerInGame): number => {
    return player.buyIns.reduce((total, buyIn) => total + buyIn.amount, 0)
  }

  const getPlayerProfitLoss = (player: PlayerInGame): number => {
    const totalBuyIn = getPlayerTotalBuyIn(player)
    // Convert points to dollar value based on game rate
    const pointValue = player.pointStack * (localSession.pointValue || 0.1)
    return pointValue - totalBuyIn
  }

  const activePlayers = localSession.playersInGame.filter((p) => p.status === "active")
  const cashedOutPlayers = localSession.playersInGame.filter((p) => p.status === "cashed_out_early")

  const isFriendWithPlayer = (playerId: string): boolean => {
    return userFriends?.includes(playerId) || false
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
    <div
      className="min-h-screen text-white p-4"
      style={{
        backgroundImage: "url('/images/poker-table-background.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="max-w-6xl mx-auto">
        {/* Game Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold text-green-400 mb-2">{localSession.name || "Poker Game"}</h1>
            <div className="space-y-1 text-gray-300">
              <p>Started: {new Date(localSession.startTime).toLocaleDateString()}</p>
              <p>Time: {formatElapsedTime(localSession.startTime)}</p>
              <p>Rate: ${localSession.pointValue || 0.1}/pt</p>
              <p>Buy-in: ${localSession.buyInAmount || 25}</p>
              <p className="text-green-400">Status: {localSession.status}</p>
            </div>
          </div>
          {isHost && (
            <button
              onClick={() => setShowEndGameModal(true)}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-semibold"
            >
              Close Game
            </button>
          )}
        </div>

        {/* Game Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-4 text-center">
            <p className="text-gray-400 mb-1">Total Buy-ins</p>
            <p className="text-2xl font-bold">${calculateTotalBuyIns(localSession.playersInGame || [])}</p>
          </div>
          <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-4 text-center">
            <p className="text-gray-400 mb-1">Current Pot</p>
            <p className="text-2xl font-bold">${calculateCurrentPot(localSession.playersInGame || [])}</p>
          </div>
          <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg p-4 text-center">
            <p className="text-gray-400 mb-1">Points in Play</p>
            <p className="text-2xl font-bold">{localSession.currentPhysicalPointsOnTable || 0}</p>
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
            const totalBuyIn = getPlayerTotalBuyIn(player)
            const profitLoss = getPlayerProfitLoss(player)
            const isCurrentUser = user?.id === player.playerId

            return (
              <div
                key={player.playerId}
                className="bg-slate-700/50 backdrop-blur-sm rounded-lg p-4 border border-slate-600 hover:border-green-500/50 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg flex-shrink-0">
                      {getInitials(player.name, "")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-white font-medium truncate">{player.name}</h3>
                        {isCurrentUser && (
                          <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">HOST</span>
                        )}
                        {isFriend ? (
                          <CheckIcon className="w-5 h-5 text-green-400 flex-shrink-0" />
                        ) : (
                          <button
                            onClick={() => handleSendFriendRequest(player.playerId)}
                            className="w-5 h-5 text-blue-400 hover:text-blue-300 transition-colors flex-shrink-0"
                          >
                            <UserIcon className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-center">
                    <div className="bg-slate-800/50 rounded px-2 py-1">
                      <p className="text-xs text-gray-400">Points</p>
                      <p className="text-sm font-medium text-white">{player.pointStack}</p>
                    </div>
                    <div className="bg-slate-800/50 rounded px-2 py-1">
                      <p className="text-xs text-gray-400">Buy-ins</p>
                      <p className="text-sm font-medium text-white">
                        ${totalBuyIn.toFixed(2)} ({player.buyIns.length})
                      </p>
                    </div>
                    <div className="bg-slate-800/50 rounded px-2 py-1">
                      <p className="text-xs text-gray-400">Cash-outs</p>
                      <p className="text-sm font-medium text-white">${(player.cashOutAmount || 0).toFixed(2)}</p>
                    </div>
                    <div className="bg-slate-800/50 rounded px-2 py-1">
                      <p className="text-xs text-gray-400">P/L</p>
                      <p className={`text-sm font-medium ${profitLoss >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {profitLoss >= 0 ? "+" : ""}${profitLoss.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 mt-4">
                  <button
                    onClick={() => {
                      setSelectedPlayer(player)
                      setShowBuyInModal(true)
                    }}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition-colors"
                  >
                    Buy-in
                  </button>
                  <button
                    onClick={() => {
                      setSelectedPlayer(player)
                      setShowCashOutModal(true)
                    }}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded font-medium transition-colors"
                    disabled={player.pointStack <= 0}
                  >
                    Cash Out
                  </button>
                </div>
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
            <div className="mb-4">
              <p className="text-gray-400 text-sm mb-2">Quick amounts:</p>
              <div className="grid grid-cols-3 gap-2">
                {[25, 50, 100].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setBuyInAmount(preset.toString())}
                    className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded text-sm transition-colors"
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-gray-400 text-sm mb-2">Custom Amount ($)</label>
              <input
                type="number"
                value={buyInAmount}
                onChange={(e) => setBuyInAmount(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:border-green-500 focus:outline-none"
                placeholder="Enter amount"
                min="0"
                step="0.01"
              />
            </div>

            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

            <div className="flex space-x-3">
              <button
                onClick={handleBuyIn}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-medium transition-colors"
              >
                Confirm Buy-in
              </button>
              <button
                onClick={() => {
                  setShowBuyInModal(false)
                  setBuyInAmount("")
                  setSelectedPlayer(null)
                  setError("")
                }}
                className="flex-1 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded font-medium transition-colors"
              >
                Cancel
              </button>
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

        {/* Close Game Modal */}
        {showEndGameModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <h2 className="text-2xl font-bold mb-4 text-green-400">Payment Settlement</h2>
              <p className="text-gray-300 mb-6">Enter the final chip amount for each player (must be ≥ 0):</p>

              <div className="space-y-4 mb-6">
                {localSession.playersInGame.map((player) => (
                  <div key={player.playerId} className="flex items-center justify-between bg-gray-700 p-4 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-white font-bold">
                        {getInitials(player.name)}
                      </div>
                      <div>
                        <p className="font-semibold">{player.name}</p>
                        <p className="text-sm text-gray-400">Buy-in: ${getPlayerTotalBuyIn(player).toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="text-sm text-gray-400">Final Chips:</p>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={finalChipAmounts[player.playerId] || ""}
                          onChange={(e) =>
                            setFinalChipAmounts((prev) => ({
                              ...prev,
                              [player.playerId]: e.target.value,
                            }))
                          }
                          className="w-24 px-2 py-1 bg-gray-600 text-white rounded text-center"
                          placeholder="0"
                        />
                      </div>
                      <div className="text-right min-w-[80px]">
                        <p className="text-sm text-gray-400">P/L:</p>
                        <p
                          className={`font-bold ${
                            (
                              Number.parseFloat(finalChipAmounts[player.playerId] || "0") *
                                (localSession.pointValue || 0.1) -
                                getPlayerTotalBuyIn(player)
                            ) >= 0
                              ? "text-green-400"
                              : "text-red-400"
                          }`}
                        >
                          $
                          {(
                            Number.parseFloat(finalChipAmounts[player.playerId] || "0") *
                              (localSession.pointValue || 0.1) -
                            getPlayerTotalBuyIn(player)
                          ).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex space-x-4">
                <button
                  onClick={() => setShowEndGameModal(false)}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEndGame}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg"
                >
                  End Game
                </button>
              </div>
            </div>
          </div>
        )}

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
