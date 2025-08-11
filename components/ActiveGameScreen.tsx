"use client"

import type React from "react"
import { useState, useEffect } from "react"
import type { GameSession, PlayerInGame, ActiveGameScreenProps } from "../types"
import { generateLogId, formatCurrency, formatDate } from "../utils"
import Button from "./common/Button"
import Input from "./common/Input"
import Modal from "./common/Modal"
import LiveTimer from "./common/LiveTimer"
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
          pointStack: 0,
          pointsLeftOnTable: player.pointStack,
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-900 to-slate-900 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-2xl font-bold text-green-400 mb-2">{localSession.name}</h1>
              <div className="space-y-1 text-sm text-gray-300">
                <div>Started: {formatDate(localSession.startTime)}</div>
                <div className="flex items-center gap-4">
                  <span>
                    Time: <LiveTimer startTime={localSession.startTime} />
                  </span>
                </div>
                <div>Rate: {formatCurrency(localSession.pointToCashRate)}/pt</div>
                <div>Buy-in: {formatCurrency(localSession.standardBuyInAmount)}</div>
                <div className="text-green-400 font-semibold">Status: Active</div>
              </div>
            </div>
            <Button onClick={() => setShowEndGameModal(true)} variant="destructive" size="sm">
              Close Game
            </Button>
          </div>

          <div className="border-t border-slate-600 pt-4 space-y-2 text-white">
            <div>
              Total Buy-ins:{" "}
              <span className="font-semibold">
                {formatCurrency(localSession.playersInGame.reduce((sum, p) => sum + getPlayerTotalBuyIn(p), 0))}
              </span>
            </div>
            <div>
              Current Pot:{" "}
              <span className="font-semibold">
                {formatCurrency(localSession.playersInGame.reduce((sum, p) => sum + getPlayerTotalBuyIn(p), 0))}
              </span>
            </div>
            <div>
              Points in Play: <span className="font-semibold">{localSession.currentPhysicalPointsOnTable}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-600 rounded p-3 mb-4">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Button
            onClick={() => setShowAddPlayerModal(true)}
            className="bg-green-600 hover:bg-green-700 text-white py-3"
            size="lg"
          >
            Add New Player to Game
          </Button>
          <Button
            onClick={() => setShowAddFriendModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white py-3"
            size="lg"
          >
            Add Friend to Game
          </Button>
        </div>

        <div className="space-y-4">
          {localSession.playersInGame.map((player) => {
            const totalBuyIn = getPlayerTotalBuyIn(player)
            const profitLoss = getPlayerProfitLoss(player)
            const isActive = player.pointStack > 0
            const isFriend = isFriendWithPlayer(player.playerId)

            return (
              <div key={player.playerId} className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-semibold text-green-400">{player.name}</h3>
                    {/* Added friendship status indicators - green checkmark for friends, blue head icon for non-friends */}
                    {isFriend ? (
                      <div className="w-6 h-6 bg-green-500 rounded flex items-center justify-center">
                        <span className="text-white text-sm">✓</span>
                      </div>
                    ) : (
                      <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center">
                        <span className="text-white text-sm">👤</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                  <div>
                    <span className="text-gray-400">Points:</span>
                    <div className="text-white font-semibold">{player.pointStack}</div>
                  </div>
                  <div>
                    <span className="text-gray-400">Buy-ins:</span>
                    <div className="text-white font-semibold">
                      {formatCurrency(totalBuyIn)} ({player.buyIns.length})
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400">Cash-outs:</span>
                    <div className="text-white font-semibold">{formatCurrency(player.cashOutAmount)}</div>
                  </div>
                  <div>
                    <span className="text-gray-400">P/L:</span>
                    <div className={`font-semibold ${profitLoss >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {formatCurrency(profitLoss)}
                    </div>
                  </div>
                </div>

                {player.buyIns.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-gray-400 text-sm mb-2">Buy-ins:</h4>
                    <div className="space-y-2">
                      {player.buyIns.map((buyIn, index) => (
                        <div key={index} className="flex items-center justify-between bg-slate-700/50 rounded p-2">
                          <span className="text-white text-sm">
                            {formatCurrency(buyIn.amount)} at{" "}
                            {new Date(buyIn.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <div className="flex gap-2">
                            <button className="text-orange-400 hover:text-orange-300 text-sm">✏️</button>
                            <button className="text-red-400 hover:text-red-300 text-sm">🗑️</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isActive && (
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={() => {
                        setSelectedPlayer(player)
                        setBuyInAmount(localSession.standardBuyInAmount.toString())
                        setShowBuyInModal(true)
                      }}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Buy-in
                    </Button>
                    <Button
                      onClick={() => {
                        setSelectedPlayer(player)
                        setCashOutAmount("")
                        setShowCashOutModal(true)
                      }}
                      variant="ghost"
                      className="border border-gray-600 hover:bg-slate-700"
                    >
                      Cash Out
                    </Button>
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
            setSelectedPlayer(null)
            setCashOutAmount("")
            setError("")
          }}
          title={`Cash Out ${selectedPlayer?.name}`}
        >
          <div className="space-y-4">
            <Input
              label="Cash Out Amount"
              id="cashOutAmount"
              type="number"
              value={cashOutAmount}
              onChange={(e) => setCashOutAmount(e.target.value)}
              placeholder="Enter amount..."
            />
            <p className="text-sm text-gray-400">
              Current points: {selectedPlayer?.pointStack || 0} (≈{" "}
              {formatCurrency((selectedPlayer?.pointStack || 0) * localSession.pointToCashRate)})
            </p>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setShowCashOutModal(false)
                  setSelectedPlayer(null)
                  setCashOutAmount("")
                  setError("")
                }}
                variant="ghost"
              >
                Cancel
              </Button>
              <Button onClick={handleCashOut} variant="primary">
                Confirm Cash Out
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
