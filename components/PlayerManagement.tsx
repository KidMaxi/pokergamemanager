"use client"

import type React from "react"
import { useState, useMemo } from "react"
import type { Player, GameSession } from "../types"
import { generateId, formatCurrency } from "../utils"
import Button from "./common/Button"
import Input from "./common/Input"
import Card from "./common/Card"
import Modal from "./common/Modal"

interface PlayerManagementProps {
  players: Player[]
  gameSessions: GameSession[]
  onAddPlayer: (player: Player) => void
  onEditPlayer: (playerId: string, newName: string) => void
  onDeletePlayer: (playerId: string) => string | null
}

interface PlayerListItemProps {
  player: Player
  gameSessions: GameSession[]
  onEdit: (player: Player) => void
  onDelete: (player: Player) => void
  canDelete: boolean
}

const PlayerListItem: React.FC<PlayerListItemProps> = ({ player, gameSessions, onEdit, onDelete, canDelete }) => {
  const allTimeNetProfitLoss = useMemo(() => {
    let totalNet = 0
    gameSessions.forEach((session) => {
      if (session.status === "completed") {
        const playerInGame = session.playersInGame.find((p) => p.playerId === player.id)
        if (playerInGame) {
          const totalBuyIn = playerInGame.buyIns.reduce((sum, b) => sum + b.amount, 0)
          totalNet += playerInGame.cashOutAmount - totalBuyIn
        }
      }
    })
    return totalNet
  }, [player.id, gameSessions])

  return (
    <li className="flex justify-between items-center p-3 bg-slate-700 rounded-md mb-2">
      <div>
        <span className="text-text-primary">{player.name}</span>
        <br />
        <span className={`text-sm font-semibold ${allTimeNetProfitLoss >= 0 ? "text-green-400" : "text-red-400"}`}>
          All-time P/L: {formatCurrency(allTimeNetProfitLoss)}
        </span>
      </div>
      <div className="space-x-2">
        <Button onClick={() => onEdit(player)} variant="ghost" size="sm">
          Edit
        </Button>
        <Button
          onClick={() => onDelete(player)}
          variant="danger"
          size="sm"
          disabled={!canDelete}
          title={
            !canDelete ? "Player cannot be deleted as they are part of one or more game sessions." : "Delete player"
          }
        >
          Delete
        </Button>
      </div>
    </li>
  )
}

const PlayerManagement: React.FC<PlayerManagementProps> = ({
  players,
  gameSessions,
  onAddPlayer,
  onEditPlayer,
  onDeletePlayer,
}) => {
  const [newPlayerName, setNewPlayerName] = useState("")
  const [addPlayerError, setAddPlayerError] = useState("")

  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [editPlayerName, setEditPlayerName] = useState("")
  const [editPlayerError, setEditPlayerError] = useState("")

  const [deletingPlayer, setDeletingPlayer] = useState<Player | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const isPlayerInAnyGame = (playerId: string): boolean => {
    return gameSessions.some((session) => session.playersInGame.some((p) => p.playerId === playerId))
  }

  const handleAddPlayerSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPlayerName.trim()) {
      setAddPlayerError("Player name cannot be empty.")
      return
    }
    if (players.find((p) => p.name.toLowerCase() === newPlayerName.trim().toLowerCase())) {
      setAddPlayerError("A player with this name already exists.")
      return
    }
    setAddPlayerError("")
    onAddPlayer({ id: generateId(), name: newPlayerName.trim() })
    setNewPlayerName("")
  }

  const openEditModal = (player: Player) => {
    setEditingPlayer(player)
    setEditPlayerName(player.name)
    setEditPlayerError("")
  }

  const handleEditPlayerSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingPlayer) return
    if (!editPlayerName.trim()) {
      setEditPlayerError("Player name cannot be empty.")
      return
    }
    if (
      players.find((p) => p.id !== editingPlayer.id && p.name.toLowerCase() === editPlayerName.trim().toLowerCase())
    ) {
      setEditPlayerError("Another player with this name already exists.")
      return
    }
    setEditPlayerError("")
    onEditPlayer(editingPlayer.id, editPlayerName.trim())
    setEditingPlayer(null)
  }

  const openDeleteModal = (player: Player) => {
    if (!isPlayerInAnyGame(player.id)) {
      setDeletingPlayer(player)
      setDeleteError(null)
    } else {
      setDeleteError("This player cannot be deleted because they are part of one or more game sessions.")
      setTimeout(() => setDeleteError(null), 5000)
    }
  }

  const confirmDeletePlayer = () => {
    if (deletingPlayer) {
      const errorMsg = onDeletePlayer(deletingPlayer.id)
      if (errorMsg) {
        setDeleteError(errorMsg)
      } else {
        setDeletingPlayer(null)
        setDeleteError(null)
      }
    }
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <Card title="Add New Player">
        <form onSubmit={handleAddPlayerSubmit} className="space-y-4">
          <Input
            label="Player Full Name"
            id="playerName"
            type="text"
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            placeholder="e.g., Jane Doe"
            error={addPlayerError}
          />
          <Button type="submit" variant="primary">
            Add Player
          </Button>
        </form>
      </Card>

      <Card title="Player Roster">
        {deleteError && !deletingPlayer && (
          <p className="mb-4 text-sm text-red-400 bg-red-900 p-2 rounded">{deleteError}</p>
        )}
        {players.length === 0 ? (
          <p className="text-text-secondary">No players added yet. Add some players to get started!</p>
        ) : (
          <ul className="space-y-2">
            {players.map((player) => (
              <PlayerListItem
                key={player.id}
                player={player}
                gameSessions={gameSessions}
                onEdit={openEditModal}
                onDelete={openDeleteModal}
                canDelete={!isPlayerInAnyGame(player.id)}
              />
            ))}
          </ul>
        )}
      </Card>

      {/* Edit Player Modal */}
      <Modal isOpen={!!editingPlayer} onClose={() => setEditingPlayer(null)} title="Edit Player Name">
        <form onSubmit={handleEditPlayerSubmit} className="space-y-4">
          <Input
            label="Player Full Name"
            id="editPlayerName"
            type="text"
            value={editPlayerName}
            onChange={(e) => setEditPlayerName(e.target.value)}
            error={editPlayerError}
          />
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="ghost" onClick={() => setEditingPlayer(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Player Modal */}
      <Modal
        isOpen={!!deletingPlayer}
        onClose={() => setDeletingPlayer(null)}
        title={`Confirm Delete Player: ${deletingPlayer?.name || ""}`}
      >
        <p className="text-text-secondary mb-4">
          Are you sure you want to delete the player "{deletingPlayer?.name || "this player"}"? This action cannot be
          undone.
        </p>
        {deleteError && deletingPlayer && <p className="text-sm text-red-500 mb-2">{deleteError}</p>}
        <div className="flex justify-end space-x-2">
          <Button type="button" variant="ghost" onClick={() => setDeletingPlayer(null)}>
            Cancel
          </Button>
          <Button onClick={confirmDeletePlayer} variant="danger">
            Delete Player
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export default PlayerManagement
