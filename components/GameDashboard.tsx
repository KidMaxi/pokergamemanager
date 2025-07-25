"use client"

import type React from "react"
import { useState } from "react"
import type { GameSession, Player } from "../types"
import { generateId, formatDate, formatCurrency, calculateDuration, formatDurationCompact } from "../utils"
import Button from "./common/Button"
import Input from "./common/Input"
import Modal from "./common/Modal"
import Card from "./common/Card"
import LiveTimer from "./common/LiveTimer"

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
            <h4 className="text-base sm:text-lg font-semibold text-brand-primary truncate">{session.name}</h4>
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
            </div>
          </div>
          <Button
            onClick={() => onConfirmDelete(session.id, session.name, session.status)}
            variant="danger"
            size="sm"
            className="text-xs px-2 py-1 flex-shrink-0"
          >
            Delete
          </Button>
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
  const [isNewGameModalOpen, setIsNewGameModalOpen] = useState(false)
  const [newGameName, setNewGameName] = useState(`Poker Game - ${new Date().toLocaleDateString()}`)
  const [pointRate, setPointRate] = useState(0.1)
  const [formError, setFormError] = useState("")
  const [standardBuyInAmount, setStandardBuyInAmount] = useState(25)

  const [gameToDelete, setGameToDelete] = useState<{ id: string; name: string; status: GameSession["status"] } | null>(
    null,
  )

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
    onStartNewGame({
      id: generateId(),
      name: newGameName.trim(),
      startTime: new Date().toISOString(),
      status: "active",
      pointToCashRate: pointRate,
      standardBuyInAmount: standardBuyInAmount,
      playersInGame: [], // This will be populated by the parent component
      currentPhysicalPointsOnTable: 0,
    })
    setIsNewGameModalOpen(false)
    setNewGameName(`Poker Game - ${new Date().toLocaleDateString()}`)
    setPointRate(0.1)
    setStandardBuyInAmount(25)
  }

  const openDeleteConfirmModal = (gameId: string, gameName: string, gameStatus: GameSession["status"]) => {
    setGameToDelete({ id: gameId, name: gameName, status: gameStatus })
  }

  const confirmDeleteGame = () => {
    if (gameToDelete) {
      // Note: We don't need to do anything special here for P/L tracking
      // because the user's all-time stats are already stored in their profile
      // and are separate from the game session data
      onDeleteGame(gameToDelete.id)
      setGameToDelete(null)
    }
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
        }}
        variant="primary"
        size="lg"
        className="mb-4 sm:mb-6 w-full text-base sm:text-lg py-3 sm:py-4"
      >
        Start New Game
      </Button>

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
