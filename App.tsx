"use client"

import type React from "react"
import { useState, useEffect } from "react"
import type { Player, GameSession, View, GameResult } from "./types"
import { generateId } from "./utils"
import { supabase } from "./lib/supabase"
import Navbar from "./components/Navbar"
import GameDashboard from "./components/GameDashboard"
import ActiveGameScreen from "./components/ActiveGameScreen"

const App: React.FC = () => {
  const [players, setPlayers] = useState<Player[]>([])
  const [gameSessions, setGameSessions] = useState<GameSession[]>([])
  const [currentView, setCurrentView] = useState<View>("dashboard")
  const [activeGameId, setActiveGameId] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Check authentication and load players from database
  useEffect(() => {
    checkUser()
    loadPlayersFromDatabase()
  }, [])

  const checkUser = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setUser(user)
    } catch (error) {
      console.error("Error checking user:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadPlayersFromDatabase = async () => {
    try {
      const { data, error } = await supabase.from("profiles").select("id, full_name").order("full_name")

      if (error) {
        console.error("Error loading players:", error)
        return
      }

      const dbPlayers: Player[] = data.map((profile) => ({
        id: profile.id,
        name: profile.full_name || "Unknown User",
      }))

      setPlayers(dbPlayers)
    } catch (error) {
      console.error("Error loading players from database:", error)
    }
  }

  const handleAddNewPlayerGlobally = (name: string): Player | null => {
    if (!name.trim()) {
      alert("Player name cannot be empty.")
      return null
    }
    if (players.find((p) => p.name.toLowerCase() === name.trim().toLowerCase())) {
      alert("A player with this name already exists.")
      return null
    }

    // Create temporary player for the game session
    const newPlayer: Player = { id: generateId(), name: name.trim() }
    setPlayers((prevPlayers) => [...prevPlayers, newPlayer])
    return newPlayer
  }

  const handleStartNewGame = (session: GameSession) => {
    const newSessionWithDefaults = {
      ...session,
      currentPhysicalPointsOnTable: 0,
    }
    setGameSessions((prevSessions) => [...prevSessions, newSessionWithDefaults])
    setActiveGameId(newSessionWithDefaults.id)
    setCurrentView("activeGame")
  }

  const handleSelectGame = (gameId: string) => {
    setActiveGameId(gameId)
    setCurrentView("activeGame")
  }

  const handleUpdateSession = (updatedSession: GameSession) => {
    setGameSessions((prevSessions) => prevSessions.map((s) => (s.id === updatedSession.id ? { ...updatedSession } : s)))
  }

  const handleEndGame = async (finalizedSession: GameSession) => {
    const completedSession = {
      ...finalizedSession,
      status: "completed" as const,
      endTime: finalizedSession.endTime || new Date().toISOString(),
      currentPhysicalPointsOnTable: 0,
    }

    // Update local state
    setGameSessions((prevSessions) => {
      return prevSessions.map((s) => (s.id === completedSession.id ? completedSession : s))
    })

    // Save game results to database for users with profiles
    await saveGameResults(completedSession)
  }

  const saveGameResults = async (session: GameSession) => {
    if (!user) return

    try {
      const gameResult: GameResult = {
        gameId: session.id,
        gameName: session.name,
        startTime: session.startTime,
        endTime: session.endTime || new Date().toISOString(),
        pointToCashRate: session.pointToCashRate,
        playerResults: session.playersInGame.map((player) => {
          const totalBuyIn = player.buyIns.reduce((sum, buyIn) => sum + buyIn.amount, 0)
          const netProfitLoss = player.cashOutAmount - totalBuyIn

          return {
            playerId: player.playerId,
            playerName: player.name,
            totalBuyIn,
            totalCashOut: player.cashOutAmount,
            netProfitLoss,
          }
        }),
      }

      // Save to game_results table
      const { error } = await supabase.from("game_results").insert({
        id: gameResult.gameId,
        user_id: user.id,
        game_name: gameResult.gameName,
        start_time: gameResult.startTime,
        end_time: gameResult.endTime,
        point_to_cash_rate: gameResult.pointToCashRate,
        player_results: gameResult.playerResults,
      })

      if (error) {
        console.error("Error saving game results:", error)
        alert("Game completed but results could not be saved to database.")
      } else {
        console.log("Game results saved successfully")
      }
    } catch (error) {
      console.error("Error saving game results:", error)
      alert("Game completed but results could not be saved to database.")
    }
  }

  const handleDeleteGame = (sessionId: string) => {
    setGameSessions((prevSessions) => prevSessions.filter((s) => s.id !== sessionId))
    if (activeGameId === sessionId) {
      setActiveGameId(null)
      setCurrentView("dashboard")
    }
  }

  const handleNavigateToDashboard = () => {
    setCurrentView("dashboard")
    setActiveGameId(null)
  }

  const renderView = () => {
    switch (currentView) {
      case "activeGame":
        const activeSession = gameSessions.find((gs) => gs.id === activeGameId)
        if (activeSession) {
          return (
            <ActiveGameScreen
              session={activeSession}
              players={players}
              onUpdateSession={handleUpdateSession}
              onEndGame={handleEndGame}
              onNavigateToDashboard={handleNavigateToDashboard}
              onAddNewPlayerGlobally={handleAddNewPlayerGlobally}
            />
          )
        }
        setCurrentView("dashboard")
        setActiveGameId(null)
        return (
          <GameDashboard
            players={players}
            gameSessions={gameSessions}
            onStartNewGame={handleStartNewGame}
            onSelectGame={handleSelectGame}
            onDeleteGame={handleDeleteGame}
          />
        )
      case "dashboard":
      default:
        return (
          <GameDashboard
            players={players}
            gameSessions={gameSessions}
            onStartNewGame={handleStartNewGame}
            onSelectGame={handleSelectGame}
            onDeleteGame={handleDeleteGame}
          />
        )
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-main">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface-main">
      <Navbar
        setCurrentView={(view) => {
          if (view === "dashboard") {
            setActiveGameId(null)
          }
          setCurrentView(view)
        }}
        activeView={currentView}
        user={user}
      />
      <main className="flex-grow">{renderView()}</main>
      <footer className="bg-slate-900 text-center p-4 text-sm text-slate-500 border-t border-slate-700">
        Poker Home Game Manager &copy; {new Date().getFullYear()}
      </footer>
    </div>
  )
}

export default App
