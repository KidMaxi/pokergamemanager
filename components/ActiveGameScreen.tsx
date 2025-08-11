"use client"

import type React from "react"
import { useState, useEffect } from "react"
import type { GameSession, PlayerInGame, ActiveGameScreenProps } from "../types"
import { generateLogId, formatCurrency, formatDate } from "../utils"
import Button from "./common/Button"
import Card from "./common/Card"
import Input from "./common/Input"
import Modal from "./common/Modal"
import LiveTimer from "./common/LiveTimer"
import PaymentSummary from "./PaymentSummary"

const ActiveGameScreen: React.FC<ActiveGameScreenProps> = ({
  session,
  players,
  onUpdateSession,
  onEndGame,
  onNavigateToDashboard,
  onAddNewPlayerGlobally,
}) => {
  const [localSession, setLocalSession] = useState<GameSession>(session)
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false)
  const [showBuyInModal, setShowBuyInModal] = useState(false)
  const [showCashOutModal, setShowCashOutModal] = useState(false)
  const [showEndGameModal, setShowEndGameModal] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerInGame | null>(null)
  const [newPlayerName, setNewPlayerName] = useState("")
  const [buyInAmount, setBuyInAmount] = useState("")
  const [cashOutAmount, setCashOutAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Sync local session with prop changes
  useEffect(() => {
    setLocalSession(session)
  }, [session])

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-green-900 to-slate-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-6 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-green-400 mb-2">{localSession.name}</h1>
              <div className="flex flex-wrap gap-4 text-sm text-gray-300">
                <span>Started: {formatDate(localSession.startTime)}</span>
                <span>Rate: {formatCurrency(localSession.pointToCashRate)}/point</span>
                <span>Players: {localSession.playersInGame.length}</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <LiveTimer startTime={localSession.startTime} />
              <Button onClick={onNavigateToDashboard} variant="ghost" size="sm">
                Back to Dashboard
              </Button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-600 rounded p-3 mb-4">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Game Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-400">{localSession.currentPhysicalPointsOnTable}</p>
              <p className="text-gray-400">Points on Table</p>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-400">{activePlayers.length}</p>
              <p className="text-gray-400">Active Players</p>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-400">{cashedOutPlayers.length}</p>
              <p className="text-gray-400">Cashed Out</p>
            </div>
          </Card>
        </div>

        {/* Active Players */}
        <Card className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">Active Players</h2>
            <Button onClick={() => setShowAddPlayerModal(true)} variant="primary" size="sm">
              Add Player
            </Button>
          </div>

          {activePlayers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400">No active players</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-600">
                    <th className="text-left py-2 text-gray-300">Player</th>
                    <th className="text-right py-2 text-gray-300">Points</th>
                    <th className="text-right py-2 text-gray-300">Total Buy-in</th>
                    <th className="text-right py-2 text-gray-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activePlayers.map((player) => (
                    <tr key={player.playerId} className="border-b border-slate-700">
                      <td className="py-3 text-white font-medium">{player.name}</td>
                      <td className="py-3 text-right text-green-400 font-bold">{player.pointStack}</td>
                      <td className="py-3 text-right text-gray-300">{formatCurrency(getPlayerTotalBuyIn(player))}</td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            onClick={() => {
                              setSelectedPlayer(player)
                              setBuyInAmount(localSession.standardBuyInAmount.toString())
                              setShowBuyInModal(true)
                            }}
                            variant="ghost"
                            size="sm"
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
                            size="sm"
                          >
                            Cash Out
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Cashed Out Players */}
        {cashedOutPlayers.length > 0 && (
          <Card className="mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">Cashed Out Players</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-600">
                    <th className="text-left py-2 text-gray-300">Player</th>
                    <th className="text-right py-2 text-gray-300">Cash Out</th>
                    <th className="text-right py-2 text-gray-300">Total Buy-in</th>
                    <th className="text-right py-2 text-gray-300">P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {cashedOutPlayers.map((player) => {
                    const profitLoss = getPlayerProfitLoss(player)
                    return (
                      <tr key={player.playerId} className="border-b border-slate-700">
                        <td className="py-3 text-white font-medium">{player.name}</td>
                        <td className="py-3 text-right text-gray-300">{formatCurrency(player.cashOutAmount)}</td>
                        <td className="py-3 text-right text-gray-300">{formatCurrency(getPlayerTotalBuyIn(player))}</td>
                        <td
                          className={`py-3 text-right font-bold ${profitLoss >= 0 ? "text-green-400" : "text-red-400"}`}
                        >
                          {formatCurrency(profitLoss)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Payment Summary */}
        <PaymentSummary session={localSession} />

        {/* End Game Button */}
        <div className="text-center mt-6">
          <Button onClick={() => setShowEndGameModal(true)} variant="primary" size="lg">
            End Game
          </Button>
        </div>

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
      </div>
    </div>
  )
}

export default ActiveGameScreen
