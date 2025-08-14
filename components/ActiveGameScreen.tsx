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
  const [showFinalSummary, setShowFinalSummary] = useState(false)
  const [showCompletedGameSummary, setShowCompletedGameSummary] = useState(false)

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

  useEffect(() => {
    if (localSession.status === "completed" && !showCompletedGameSummary) {
      setShowCompletedGameSummary(true)
    }
  }, [localSession.status])

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
    if (!playersInGame || !Array.isArray(playersInGame)) return 0
    return playersInGame.reduce((total, player) => {
      if (player.status === "active") {
        return total + player.pointStack
      }
      return total
    }, 0)
  }

  const calculateTotalBuyIns = (playersInGame: PlayerInGame[]): number => {
    if (!playersInGame || !Array.isArray(playersInGame)) return 0
    return playersInGame.reduce((total, player) => {
      const playerBuyIns = player.buyIns || []
      return total + playerBuyIns.reduce((playerTotal, buyIn) => playerTotal + buyIn.amount, 0)
    }, 0)
  }

  const calculateCurrentPot = (playersInGame: PlayerInGame[]): number => {
    if (!playersInGame || !Array.isArray(playersInGame)) return 0
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
        hasCashedOut: false,
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
    if (isNaN(amount) || amount < 0) {
      setError("Cash-out amount must be zero or positive")
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
          hasCashedOut: true,
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

  const handleEndGame = async () => {
    const invalidAmounts = Object.entries(finalChipAmounts).filter(
      ([playerId, amount]) => amount === "" || Number.parseFloat(amount) < 0,
    )

    if (invalidAmounts.length > 0) {
      setError("All final chip amounts must be filled and ≥ 0")
      return
    }

    const updatedPlayersInGame = localSession.playersInGame.map((player) => {
      const finalAmount = Number.parseFloat(finalChipAmounts[player.playerId] || "0")
      const finalCashValue = finalAmount * (localSession.pointToCashRate || 0.1)
      const totalBuyInAmount = (player.buyIns || []).reduce((sum, buyIn) => sum + buyIn.amount, 0)

      return {
        ...player,
        pointStack: finalAmount,
        cashOutAmount: finalCashValue, // Always set based on final chip amount
        hasCashedOut: true, // Mark as cashed out for final settlement
        profitLoss: finalCashValue - totalBuyInAmount,
      }
    })

    const finalSession = {
      ...localSession,
      playersInGame: updatedPlayersInGame,
      status: "completed" as const,
      endTime: new Date().toISOString(),
      currentPhysicalPointsOnTable: 0, // All chips are now settled
    }

    await finalizeGameStats(finalSession)

    onEndGame(finalSession)
    setShowEndGameModal(false)
    setShowFinalSummary(true)
  }

  const finalizeGameStats = async (session: GameSession) => {
    try {
      // Prepare player results for the RPC function
      const playerResults = session.playersInGame
        .filter((player) => player.profileId) // Only include players with profiles
        .map((player) => {
          const totalBuyInAmount = (player.buyIns || []).reduce((sum, buyIn) => sum + buyIn.amount, 0)
          const profitLoss = (player.cashOutAmount || 0) - totalBuyInAmount
          const isWinner = profitLoss > 0

          return {
            profileId: player.profileId,
            profitLoss: profitLoss,
            isWinner: isWinner,
            playerName: player.name,
          }
        })

      console.log("Finalizing game stats for players:", playerResults)

      // Call the idempotent finalization function
      const { data, error } = await supabase.rpc("finalize_game_stats", {
        p_game_id: session.dbId || session.id,
        p_owner_id: session.userId,
        p_player_results: playerResults,
      })

      if (error) {
        console.error("Error finalizing game stats:", error)
        setError("Failed to update player statistics")
        return
      }

      if (data && !data.success) {
        console.warn("Game finalization warning:", data.message)
        if (data.message !== "Game already finalized") {
          setError(`Stats update issue: ${data.message}`)
        }
        return
      }

      console.log("Game stats finalized successfully:", data)
    } catch (error) {
      console.error("Error in finalizeGameStats:", error)
      setError("Failed to update player statistics")
    }
  }

  const calculatePhysicalPointsForActivePlayers = (playersInGame: PlayerInGame[]): number => {
    return playersInGame.reduce((total, player) => {
      if (player.status === "active" && !player.hasCashedOut) {
        return total + player.pointStack
      }
      return total
    }, 0)
  }

  const calculateTotalBuyInsForActivePlayers = (playersInGame: PlayerInGame[]): number => {
    if (!playersInGame || !Array.isArray(playersInGame)) return 0
    return playersInGame.reduce((total, player) => {
      if (!player.hasCashedOut) {
        const playerBuyIns = player.buyIns || []
        return total + playerBuyIns.reduce((playerTotal, buyIn) => playerTotal + buyIn.amount, 0)
      }
      return total
    }, 0)
  }

  const calculateCurrentPotForActivePlayers = (playersInGame: PlayerInGame[]): number => {
    const totalBuyIns = calculateTotalBuyInsForActivePlayers(playersInGame)
    const totalCashOuts = playersInGame.reduce((total, player) => {
      return total + (player.cashOutAmount || 0)
    }, 0)
    return totalBuyIns - totalCashOuts
  }

  const getPlayerTotalBuyIn = (player: PlayerInGame): number => {
    const playerBuyIns = player.buyIns || []
    return playerBuyIns.reduce((total, buyIn) => total + buyIn.amount, 0)
  }

  const getPlayerProfitLoss = (player: PlayerInGame): number => {
    const totalBuyIn = getPlayerTotalBuyIn(player)
    return (player.cashOutAmount || 0) - totalBuyIn
  }

  const activePlayers = localSession.playersInGame.filter((p) => p.status === "active" && !p.hasCashedOut)
  const cashedOutPlayers = localSession.playersInGame.filter((p) => p.hasCashedOut)

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

  const getTotalChipsInFinalStandings = (): number => {
    const activePlayersOnly = localSession.playersInGame.filter((player) => !player.hasCashedOut)
    return activePlayersOnly.reduce((total, player) => {
      const finalAmount = Number.parseFloat(finalChipAmounts[player.playerId] || "0")
      return total + finalAmount
    }, 0)
  }

  const handleEditBuyIn = async (playerId: string, buyInIndex: number, newAmount: number) => {
    if (!user || !localSession) return

    try {
      const updatedPlayers = localSession.playersInGame.map((player) => {
        if (player.id === playerId) {
          const updatedBuyIns = [...player.buyIns]
          const oldAmount = updatedBuyIns[buyInIndex].amount
          updatedBuyIns[buyInIndex] = {
            ...updatedBuyIns[buyInIndex],
            amount: newAmount,
          }

          // Update point stack based on difference
          const pointDifference = (newAmount - oldAmount) / (localSession.pointToCashRate || 0.1)

          return {
            ...player,
            buyIns: updatedBuyIns,
            pointStack: player.pointStack + pointDifference,
          }
        }
        return player
      })

      setLocalSession({ ...localSession, playersInGame: updatedPlayers })
      await updateSession({ ...localSession, playersInGame: updatedPlayers })
    } catch (error) {
      console.error("Error editing buy-in:", error)
    }
  }

  const handleDeleteBuyIn = async (playerId: string, buyInIndex: number) => {
    if (!user || !localSession) return

    try {
      const updatedPlayers = localSession.playersInGame.map((player) => {
        if (player.id === playerId) {
          const updatedBuyIns = [...player.buyIns]
          const deletedAmount = updatedBuyIns[buyInIndex].amount
          updatedBuyIns.splice(buyInIndex, 1)

          // Update point stack by removing deleted buy-in points
          const pointsToRemove = deletedAmount / (localSession.pointToCashRate || 0.1)

          return {
            ...player,
            buyIns: updatedBuyIns,
            pointStack: Math.max(0, player.pointStack - pointsToRemove),
          }
        }
        return player
      })

      setLocalSession({ ...localSession, playersInGame: updatedPlayers })
      await updateSession({ ...localSession, playersInGame: updatedPlayers })
    } catch (error) {
      console.error("Error deleting buy-in:", error)
    }
  }

  const isGameCompleted = localSession.status === "completed"

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
          {!isGameCompleted && (
            <button
              onClick={() => setShowEndGameModal(true)}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-semibold shadow-lg"
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

        {!isGameCompleted && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Button
              onClick={() => setShowAddPlayerModal(true)}
              className="bg-green-600 hover:bg-green-700 text-white py-3 px-6 rounded-lg font-semibold"
            >
              Add New Player to Game
            </Button>
            <Button
              onClick={() => setShowAddFriendModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-semibold"
            >
              Add Friend to Game
            </Button>
          </div>
        )}

        {/* Players */}
        <div className="grid gap-4 md:gap-6">
          {localSession.playersInGame.map((player) => {
            const totalBuyIn = (player.buyIns || []).reduce((sum, buyIn) => sum + buyIn.amount, 0)
            const profitLoss = getPlayerProfitLoss(player)
            const isHost = player.id === user?.id

            return (
              <div
                key={player.id}
                className={`bg-slate-800/60 backdrop-blur-sm rounded-lg p-4 md:p-6 border border-slate-700/50 ${
                  player.hasCashedOut ? "opacity-60 blur-[2px]" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-white font-semibold">
                      {getInitials(player.name)}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        {player.name}
                        {player.hasCashedOut && (
                          <span className="text-xs bg-red-600 px-2 py-1 rounded">CASHED OUT</span>
                        )}
                      </h3>

                      <div className="flex items-center gap-2">
                        {userFriends?.some((friend) => friend === player.playerId) ? (
                          <CheckIcon className="w-4 h-4 text-green-400" />
                        ) : (
                          <button
                            onClick={() => handleSendFriendRequest(player.playerId)}
                            className="hover:bg-slate-700 p-1 rounded"
                          >
                            <UserIcon className="w-4 h-4 text-blue-400" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-slate-800/50 rounded px-2 py-1">
                    <p className="text-xs text-gray-400">Points</p>
                    <p className="text-lg font-bold text-white">{player.pointStack}</p>
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

                {player.buyIns.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-300 mb-2">Buy-ins:</h4>
                    <div className="space-y-2">
                      {player.buyIns.map((buyIn, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between bg-slate-700/30 rounded px-3 py-2"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-white">${buyIn.amount.toFixed(2)}</span>
                            <span className="text-xs text-gray-400">
                              {new Date(buyIn.time).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          {isHost && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  const newAmount = prompt("Enter new buy-in amount:", buyIn.amount.toString())
                                  if (newAmount && !isNaN(Number.parseFloat(newAmount))) {
                                    handleEditBuyIn(player.id, index, Number.parseFloat(newAmount))
                                  }
                                }}
                                className="text-blue-400 hover:text-blue-300 p-1"
                                title="Edit buy-in"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm("Are you sure you want to delete this buy-in?")) {
                                    handleDeleteBuyIn(player.id, index)
                                  }
                                }}
                                className="text-red-400 hover:text-red-300 p-1"
                                title="Delete buy-in"
                              >
                                🗑️
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!isGameCompleted && !player.hasCashedOut && (
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <Button
                      onClick={() => {
                        setSelectedPlayer(player)
                        setShowBuyInModal(true)
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg text-sm font-semibold"
                    >
                      Buy-in
                    </Button>
                    <Button
                      onClick={() => {
                        setSelectedPlayer(player)
                        setShowCashOutModal(true)
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg text-sm font-semibold"
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
        {isGameCompleted && <PaymentSummary session={localSession} />}

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
            setBuyInAmount("")
            setSelectedPlayer(null)
            setError("")
          }}
          title={`Buy-in for ${selectedPlayer?.name}`}
        >
          <div className="space-y-4">
            {selectedPlayer?.hasCashedOut ? (
              <div className="text-center py-8">
                <p className="text-red-400 text-lg font-semibold">Player has cashed out</p>
                <p className="text-gray-400 mt-2">Cashed out players cannot make additional buy-ins</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <button
                    onClick={() => setBuyInAmount("25")}
                    className="bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg"
                  >
                    $25
                  </button>
                  <button
                    onClick={() => setBuyInAmount("50")}
                    className="bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg"
                  >
                    $50
                  </button>
                  <button
                    onClick={() => setBuyInAmount("100")}
                    className="bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg"
                  >
                    $100
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Buy-in Amount ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={buyInAmount}
                    onChange={(e) => setBuyInAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg"
                    placeholder="Enter amount"
                  />
                </div>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <div className="flex space-x-4">
                  <Button
                    onClick={() => {
                      setShowBuyInModal(false)
                      setBuyInAmount("")
                      setSelectedPlayer(null)
                      setError("")
                    }}
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleBuyIn} disabled={loading}>
                    {loading ? "Processing..." : "Buy-in"}
                  </Button>
                </div>
              </>
            )}
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
          title={`Cash Out for ${selectedPlayer?.name}`}
        >
          <div className="space-y-4">
            {selectedPlayer?.hasCashedOut ? (
              <div className="text-center py-8">
                <p className="text-red-400 text-lg font-semibold">Player has already cashed out</p>
                <p className="text-gray-400 mt-2">This player cannot cash out again</p>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-sm text-gray-400 mb-2">Current Points: {selectedPlayer?.pointStack || 0}</p>
                  <p className="text-sm text-gray-400 mb-4">
                    Max Cash Out: {localSession.currentPhysicalPointsOnTable} points ($
                    {(localSession.currentPhysicalPointsOnTable * (localSession.pointValue || 0.1)).toFixed(2)})
                  </p>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Cash Out Amount (Points)</label>
                  <input
                    type="number"
                    min="0"
                    max={localSession.currentPhysicalPointsOnTable}
                    step="1"
                    value={cashOutAmount}
                    onChange={(e) => setCashOutAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg"
                    placeholder="Enter points to cash out"
                  />
                </div>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <div className="flex space-x-4">
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
              </>
            )}
          </div>
        </Modal>

        {/* Close Game Modal */}
        {showEndGameModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <h2 className="text-2xl font-bold mb-4 text-green-400">Payment Settlement</h2>
              <p className="text-gray-300 mb-4">Enter the final chip amount for each player (must be ≥ 0):</p>

              <div className="bg-gray-700 p-4 rounded-lg mb-6">
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">Total Chips in Play:</span>
                  <span className="text-white font-bold">
                    {calculatePhysicalPointsForActivePlayers(localSession.playersInGame)}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-gray-300">Total Entered:</span>
                  <span
                    className={`font-bold ${getTotalChipsInFinalStandings() === calculatePhysicalPointsForActivePlayers(localSession.playersInGame) ? "text-green-400" : "text-red-400"}`}
                  >
                    {getTotalChipsInFinalStandings()}
                  </span>
                </div>
                {getTotalChipsInFinalStandings() !==
                  calculatePhysicalPointsForActivePlayers(localSession.playersInGame) && (
                  <p className="text-red-400 text-sm mt-2">⚠️ Total entered doesn't match chips in play</p>
                )}
              </div>

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
                        <p className="text-sm text-gray-400">Current: {player.pointStack} chips</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="text-sm text-gray-400">Final Chips:</p>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={finalChipAmounts[player.playerId] || ""}
                          onChange={(e) =>
                            setFinalChipAmounts((prev) => ({
                              ...prev,
                              [player.playerId]: e.target.value,
                            }))
                          }
                          className="w-24 px-2 py-1 bg-gray-600 text-white rounded text-center"
                          placeholder={player.pointStack.toString()}
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
                <Button
                  onClick={() => setShowEndGameModal(false)}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleEndGame}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg"
                >
                  End Game
                </Button>
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

        {/* Final Summary Modal */}
        {showFinalSummary && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-green-400">🎉 Game Complete!</h2>
                <button onClick={() => setShowFinalSummary(false)} className="text-gray-400 hover:text-white text-2xl">
                  ×
                </button>
              </div>

              {/* Game Summary */}
              <div className="bg-gray-700 p-6 rounded-lg mb-6">
                <h3 className="text-xl font-bold text-white mb-4">Game Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-gray-400 text-sm">Duration</p>
                    <p className="text-white font-bold">{formatElapsedTime(localSession.startTime)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Total Players</p>
                    <p className="text-white font-bold">{localSession.playersInGame.length}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Total Buy-ins</p>
                    <p className="text-white font-bold">${calculateTotalBuyIns().toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">Point Rate</p>
                    <p className="text-white font-bold">${(localSession.pointToCashRate || 0.1).toFixed(2)}/pt</p>
                  </div>
                </div>
              </div>

              {/* Player Results */}
              <div className="bg-gray-700 p-6 rounded-lg mb-6">
                <h3 className="text-xl font-bold text-white mb-4">Final Results</h3>
                <div className="space-y-3">
                  {localSession.playersInGame
                    .sort((a, b) => getPlayerProfitLoss(b) - getPlayerProfitLoss(a))
                    .map((player, index) => {
                      const profitLoss = getPlayerProfitLoss(player)
                      const totalBuyIn = getPlayerTotalBuyIn(player)
                      return (
                        <div
                          key={player.playerId}
                          className="flex items-center justify-between bg-gray-600 p-4 rounded-lg"
                        >
                          <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-2">
                              <span className="text-2xl">
                                {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "🏅"}
                              </span>
                              <span className="text-lg font-bold text-white">{player.name}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-400">
                              Buy-in: ${totalBuyIn.toFixed(2)} → Cash-out: ${player.cashOutAmount.toFixed(2)}
                            </p>
                            <p className={`text-lg font-bold ${profitLoss >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {profitLoss >= 0 ? "+" : ""}${profitLoss.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>

              {/* Payment Settlement */}
              <PaymentSummary session={localSession} className="mb-6" />

              <div className="flex justify-center">
                <Button
                  onClick={() => setShowFinalSummary(false)}
                  className="bg-green-600 hover:bg-green-700 text-white py-3 px-8 rounded-lg font-semibold"
                >
                  Close Summary
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Completed Game Summary Modal */}
        {showCompletedGameSummary && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-green-400">Game Summary</h2>
                <button
                  onClick={() => setShowCompletedGameSummary(false)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>
              <PaymentSummary session={localSession} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ActiveGameScreen
