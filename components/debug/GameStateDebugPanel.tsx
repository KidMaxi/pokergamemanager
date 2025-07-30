"use client"

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

export default function GameStateDebugPanel({ sessions, onSessionsUpdate }: GameStateDebugPanelProps) {
  const [diagnostics, setDiagnostics] = useState<any>(null)
  const [validationResults, setValidationResults] = useState<any[]>([])
  const [refreshTracking, setRefreshTracking] = useState<any>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    updateDiagnostics()
    loadRefreshTracking()
  }, [sessions])

  const updateDiagnostics = () => {
    setDiagnostics(GameStateManager.getDiagnostics())

    // Validate all sessions
    const results = sessions.map((session) => ({
      sessionId: session.id,
      sessionName: session.name,
      validation: GameStateValidator.validateSession(session),
    }))
    setValidationResults(results)
  }

  const loadRefreshTracking = () => {
    try {
      const tracking = localStorage.getItem("poker-refresh-tracking")
      if (tracking) {
        setRefreshTracking(JSON.parse(tracking))
      }
    } catch (error) {
      console.error("Failed to load refresh tracking:", error)
    }
  }

  const handleRepairSessions = () => {
    const repairedSessions = sessions.map((session) => {
      const validation = GameStateValidator.validateSession(session)
      return validation.repairedSession || session
    })

    onSessionsUpdate(repairedSessions)
    GameStateManager.saveGameState(repairedSessions)
    updateDiagnostics()
  }

  const handleClearAllData = () => {
    if (window.confirm("Are you sure you want to clear all game data? This cannot be undone.")) {
      GameStateManager.clearAllData()
      localStorage.removeItem("poker-refresh-tracking")
      onSessionsUpdate([])
      updateDiagnostics()
      setRefreshTracking(null)
    }
  }

  const handleForceReload = () => {
    const loadedSessions = GameStateManager.loadGameState()
    onSessionsUpdate(loadedSessions)
    updateDiagnostics()
  }

  if (!isVisible) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={() => setIsVisible(true)}
          variant="secondary"
          size="sm"
          className="bg-gray-800 text-white border border-gray-600"
        >
          Debug
        </Button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white">Game State Debug Panel</h2>
            <Button onClick={() => setIsVisible(false)} variant="ghost" size="sm">
              ✕
            </Button>
          </div>

          {/* Storage Diagnostics */}
          <Card className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Storage Diagnostics</h3>
            {diagnostics && (
              <div className="space-y-2 text-sm">
                <p className="text-gray-300">
                  Main State: {diagnostics.hasMainState ? "✅" : "❌"}({diagnostics.mainStateSize} bytes)
                </p>
                <p className="text-gray-300">
                  Backup: {diagnostics.hasBackup ? "✅" : "❌"}({diagnostics.backupStateSize} bytes)
                </p>
                <p className="text-gray-300">Last Save: {diagnostics.mainStateTimestamp || "Never"}</p>
                <p className="text-gray-300">Backup Time: {diagnostics.backupStateTimestamp || "Never"}</p>
              </div>
            )}
          </Card>

          {/* Refresh Tracking */}
          <Card className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Refresh Tracking</h3>
            {refreshTracking ? (
              <div className="space-y-2 text-sm">
                <p className="text-gray-300">Refresh Count: {refreshTracking.count}</p>
                <p className="text-gray-300">Last Refresh: {refreshTracking.timestamp}</p>
                <p className="text-gray-300">Sessions at Last Refresh: {refreshTracking.sessionsCount}</p>
                {refreshTracking.count > 5 && <p className="text-yellow-400">⚠️ High refresh frequency detected</p>}
              </div>
            ) : (
              <p className="text-gray-400">No refresh tracking data</p>
            )}
          </Card>

          {/* Session Validation */}
          <Card className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-4">Session Validation</h3>
            {validationResults.length > 0 ? (
              <div className="space-y-4">
                {validationResults.map((result, index) => (
                  <div key={index} className="border border-gray-600 rounded p-3">
                    <h4 className="font-medium text-white mb-2">
                      {result.sessionName} ({result.sessionId})
                    </h4>
                    <p className={`text-sm mb-2 ${result.validation.isValid ? "text-green-400" : "text-red-400"}`}>
                      Status: {result.validation.isValid ? "✅ Valid" : "❌ Invalid"}
                    </p>

                    {result.validation.errors.length > 0 && (
                      <div className="mb-2">
                        <p className="text-red-400 text-sm font-medium">Errors:</p>
                        <ul className="text-red-300 text-xs ml-4">
                          {result.validation.errors.map((error, i) => (
                            <li key={i}>• {error}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {result.validation.warnings.length > 0 && (
                      <div>
                        <p className="text-yellow-400 text-sm font-medium">Warnings:</p>
                        <ul className="text-yellow-300 text-xs ml-4">
                          {result.validation.warnings.map((warning, i) => (
                            <li key={i}>• {warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">No sessions to validate</p>
            )}
          </Card>

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <Button onClick={updateDiagnostics} variant="secondary">
              Refresh Diagnostics
            </Button>
            <Button onClick={handleRepairSessions} variant="primary">
              Repair Sessions
            </Button>
            <Button onClick={handleForceReload} variant="secondary">
              Force Reload from Storage
            </Button>
            <Button onClick={handleClearAllData} variant="danger">
              Clear All Data
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
