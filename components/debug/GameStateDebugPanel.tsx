"use client"

import type React from "react"
import { useState, useEffect } from "react"
import type { GameSession } from "../../types"
import { GameStateManager } from "../../utils/gameStateManager"
import { GameStateValidator } from "../../utils/gameStateValidator"
import Button from "../common/Button"
import Card from "../common/Card"

interface GameStateDebugPanelProps {
  sessions: GameSession[]
  onSessionsUpdate: (sessions: GameSession[]) => void
}

const GameStateDebugPanel: React.FC<GameStateDebugPanelProps> = ({ sessions, onSessionsUpdate }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [diagnostics, setDiagnostics] = useState<any>(null)
  const [validationResults, setValidationResults] = useState<any[]>([])
  const [refreshCount, setRefreshCount] = useState(0)

  // Update diagnostics periodically
  useEffect(() => {
    const updateDiagnostics = () => {
      const diag = GameStateManager.getDiagnostics()
      const refreshCountStored = localStorage.getItem("poker-refresh-count")
      setDiagnostics(diag)
      setRefreshCount(Number.parseInt(refreshCountStored || "0", 10))

      // Validate all sessions
      const results = sessions.map((session) => ({
        sessionId: session.id,
        sessionName: session.name,
        validation: GameStateValidator.validateSession(session),
      }))
      setValidationResults(results)
    }

    updateDiagnostics()
    const interval = setInterval(updateDiagnostics, 5000)
    return () => clearInterval(interval)
  }, [sessions])

  const handleRepairAllSessions = () => {
    const repairedSessions = sessions.map((session) => GameStateValidator.repairSession(session))
    onSessionsUpdate(repairedSessions)
    console.log("All sessions repaired")
  }

  const handleClearAllData = () => {
    if (confirm("Are you sure you want to clear all stored game data? This cannot be undone.")) {
      GameStateManager.clearAllData()
      localStorage.removeItem("poker-refresh-count")
      setRefreshCount(0)
      console.log("All data cleared")
    }
  }

  const handleForceSync = () => {
    const loadedSessions = GameStateManager.loadGameState()
    onSessionsUpdate(loadedSessions)
    console.log("Force sync completed")
  }

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          size="sm"
          variant="ghost"
          className="bg-gray-800 text-white hover:bg-gray-700"
        >
          🔧 Debug
        </Button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-h-96 overflow-y-auto">
      <Card className="bg-gray-900 border-gray-700 text-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Game State Debug</h3>
          <Button onClick={() => setIsOpen(false)} size="sm" variant="ghost" className="text-white">
            ✕
          </Button>
        </div>

        <div className="space-y-4 text-sm">
          {/* Refresh Tracking */}
          <div>
            <h4 className="font-semibold text-yellow-400">Refresh Tracking</h4>
            <p>Page Refreshes: {refreshCount}</p>
            <p>Current Sessions: {sessions.length}</p>
          </div>

          {/* Storage Diagnostics */}
          {diagnostics && (
            <div>
              <h4 className="font-semibold text-blue-400">Storage Status</h4>
              <p>Main State: {diagnostics.hasMainState ? "✓" : "✗"}</p>
              <p>Backup: {diagnostics.hasBackup ? "✓" : "✗"}</p>
              <p>Main Size: {diagnostics.mainStateSize} bytes</p>
              {diagnostics.mainStateTimestamp && (
                <p>Last Saved: {new Date(diagnostics.mainStateTimestamp).toLocaleTimeString()}</p>
              )}
            </div>
          )}

          {/* Session Validation */}
          <div>
            <h4 className="font-semibold text-green-400">Session Validation</h4>
            {validationResults.length === 0 ? (
              <p>No sessions to validate</p>
            ) : (
              validationResults.map((result, index) => (
                <div key={index} className="mb-2 p-2 bg-gray-800 rounded">
                  <p className="font-medium">{result.sessionName}</p>
                  <p className={result.validation.isValid ? "text-green-400" : "text-red-400"}>
                    {result.validation.isValid ? "✓ Valid" : "✗ Invalid"}
                  </p>
                  {result.validation.errors.length > 0 && (
                    <div className="text-red-400 text-xs">Errors: {result.validation.errors.length}</div>
                  )}
                  {result.validation.warnings.length > 0 && (
                    <div className="text-yellow-400 text-xs">Warnings: {result.validation.warnings.length}</div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <Button onClick={handleForceSync} size="sm" variant="secondary" className="w-full">
              Force Sync from Storage
            </Button>
            <Button onClick={handleRepairAllSessions} size="sm" variant="primary" className="w-full">
              Repair All Sessions
            </Button>
            <Button onClick={handleClearAllData} size="sm" variant="danger" className="w-full">
              Clear All Data
            </Button>
          </div>

          {/* Early Cashout Debug */}
          <div>
            <h4 className="font-semibold text-purple-400">Early Cashout Status</h4>
            {sessions.map((session) => {
              const activePlayers = session.playersInGame.filter((p) => p.status === "active").length
              const cashedOutPlayers = session.playersInGame.filter((p) => p.status === "cashed_out_early").length
              const canInviteFriends = session.status === "active" && session.isOwner !== false

              return (
                <div key={session.id} className="mb-2 p-2 bg-gray-800 rounded text-xs">
                  <p className="font-medium">{session.name}</p>
                  <p>Status: {session.status}</p>
                  <p>Active Players: {activePlayers}</p>
                  <p>Cashed Out: {cashedOutPlayers}</p>
                  <p>Can Invite: {canInviteFriends ? "✓" : "✗"}</p>
                  <p>Physical Points: {session.currentPhysicalPointsOnTable}</p>
                </div>
              )
            })}
          </div>
        </div>
      </Card>
    </div>
  )
}

export default GameStateDebugPanel
