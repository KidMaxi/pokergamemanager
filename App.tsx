"use client"

import type React from "react"
import { useState, useEffect, useCallback, useMemo } from "react"
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
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastDataFetch, setLastDataFetch] = useState<number>(0)

  const viewState = useMemo(
    () => ({
      currentView,
      activeGameId,
      loading: loading || dataLoading,
    }),
    [currentView, activeGameId, loading, dataLoading],
  )

  const checkUser = useCallback(async () => {
    try {
      console.log("[v0] Starting user authentication check")
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Authentication timeout")), 10000),
      )

      const authPromise = supabase.auth.getUser()

      const {
        data: { user },
      } = (await Promise.race([authPromise, timeoutPromise])) as any

      console.log("[v0] User authentication result:", user ? "authenticated" : "not authenticated")
      setUser(user)
      setError(null)
    } catch (error) {
      console.error("[v0] Error checking user:", error)
      setError("Authentication failed. Please refresh the page.")
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadPlayersFromDatabase = useCallback(
    async (forceRefresh = false) => {
      const now = Date.now()
      const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

      if (!forceRefresh && now - lastDataFetch < CACHE_DURATION) {
        console.log("[v0] Using cached player data")
        return
      }

      try {
        setDataLoading(true)
        setError(null)
        console.log("[v0] Loading players from database")

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Database timeout")), 15000),
        )

        const queryPromise = supabase.from("profiles").select("id, full_name").order("full_name")

        const { data, error } = (await Promise.race([queryPromise, timeoutPromise])) as any

        if (error) {
          console.error("[v0] Database error loading players:", error)
          setError("Failed to load player data. Please try refreshing.")
          return
        }

        const dbPlayers: Player[] = data.map((profile) => ({
          id: profile.id,
          name: profile.full_name || "Unknown User",
        }))

        console.log("[v0] Successfully loaded players:", dbPlayers.length)
        setPlayers(dbPlayers)
        setLastDataFetch(now)
        setError(null)
      } catch (error) {
        console.error("[v0] Error loading players from database:", error)
        setError("Failed to load player data. Please check your connection and try refreshing.")
      } finally {
        setDataLoading(false)
      }
    },
    [lastDataFetch],
  )

  useEffect(() => {
    const initializeApp = async () => {
      console.log("[v0] Initializing application")

      const savedView = localStorage.getItem("poker-current-view") as View
      if (savedView && ["dashboard", "friends", "activeGame"].includes(savedView)) {
        setCurrentView(savedView)
      }

      await checkUser()
      await loadPlayersFromDatabase()

      console.log("[v0] Application initialization complete")
    }

    initializeApp()
  }, [checkUser, loadPlayersFromDatabase])

  const handleAddNewPlayerGlobally = useCallback(
    (name: string): Player | null => {
      if (!name.trim()) {
        setError("Player name cannot be empty.")
        return null
      }

      const trimmedName = name.trim()
      if (players.find((p) => p.name.toLowerCase() === trimmedName.toLowerCase())) {
        setError("A player with this name already exists.")
        return null
      }

      const newPlayer: Player = { id: generateId(), name: trimmedName }
      setPlayers((prevPlayers) => [...prevPlayers, newPlayer])
      setError(null)
      console.log("[v0] Added new player:", trimmedName)
      return newPlayer
    },
    [players],
  )

  const handleStartNewGame = useCallback((session: GameSession) => {
    try {
      console.log("[v0] Starting new game:", session.name)
      const newSessionWithDefaults = {
        ...session,
        currentPhysicalPointsOnTable: 0,
      }
      setGameSessions((prevSessions) => [...prevSessions, newSessionWithDefaults])
      setActiveGameId(newSessionWithDefaults.id)
      setCurrentView("activeGame")

      localStorage.setItem("poker-current-view", "activeGame")
      setError(null)
    } catch (error) {
      console.error("[v0] Error starting new game:", error)
      setError("Failed to start new game. Please try again.")
    }
  }, [])

  const handleSelectGame = useCallback((gameId: string) => {
    console.log("[v0] Selecting game:", gameId)
    setActiveGameId(gameId)
    setCurrentView("activeGame")
    localStorage.setItem("poker-current-view", "activeGame")
  }, [])

  const handleUpdateSession = useCallback((updatedSession: GameSession) => {
    console.log("[v0] Updating session:", updatedSession.id)
    setGameSessions((prevSessions) => prevSessions.map((s) => (s.id === updatedSession.id ? { ...updatedSession } : s)))
  }, [])

  const handleEndGame = useCallback(async (finalizedSession: GameSession) => {
    try {
      console.log("[v0] Ending game:", finalizedSession.name)
      setDataLoading(true)

      const completedSession = {
        ...finalizedSession,
        status: "completed" as const,
        endTime: finalizedSession.endTime || new Date().toISOString(),
        currentPhysicalPointsOnTable: 0,
      }

      setGameSessions((prevSessions) => {
        return prevSessions.map((s) => (s.id === completedSession.id ? completedSession : s))
      })

      await saveGameResults(completedSession)
      setError(null)
    } catch (error) {
      console.error("[v0] Error ending game:", error)
      setError("Game ended but there was an issue saving results. Your local data is preserved.")
    } finally {
      setDataLoading(false)
    }
  }, [])

  const saveGameResults = useCallback(
    async (session: GameSession) => {
      if (!user) return

      try {
        console.log("[v0] Saving game results to database")
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

        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Save timeout")), 30000))

        const savePromise = supabase.from("game_results").insert({
          id: gameResult.gameId,
          user_id: user.id,
          game_name: gameResult.gameName,
          start_time: gameResult.startTime,
          end_time: gameResult.endTime,
          point_to_cash_rate: gameResult.pointToCashRate,
          player_results: gameResult.playerResults,
        })

        const { error } = (await Promise.race([savePromise, timeoutPromise])) as any

        if (error) {
          console.error("[v0] Database error saving game results:", error)
          throw error
        } else {
          console.log("[v0] Game results saved successfully")
        }
      } catch (error) {
        console.error("[v0] Error saving game results:", error)
        throw error
      }
    },
    [user],
  )

  const handleDeleteGame = useCallback(
    (sessionId: string) => {
      console.log("[v0] Deleting game:", sessionId)
      setGameSessions((prevSessions) => prevSessions.filter((s) => s.id !== sessionId))
      if (activeGameId === sessionId) {
        setActiveGameId(null)
        setCurrentView("dashboard")
        localStorage.setItem("poker-current-view", "dashboard")
      }
    },
    [activeGameId],
  )

  const handleNavigateToDashboard = useCallback(() => {
    console.log("[v0] Navigating to dashboard")
    setCurrentView("dashboard")
    setActiveGameId(null)
    localStorage.setItem("poker-current-view", "dashboard")
  }, [])

  const renderView = useCallback(() => {
    if (error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface-main p-4">
          <div className="text-center max-w-md">
            <div className="text-red-400 text-6xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold text-text-primary mb-2">Something went wrong</h2>
            <p className="text-text-secondary mb-4">{error}</p>
            <button
              onClick={() => {
                setError(null)
                loadPlayersFromDatabase(true)
              }}
              className="bg-brand-primary text-white px-4 py-2 rounded-md hover:bg-brand-primary-hover transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      )
    }

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
        localStorage.setItem("poker-current-view", "dashboard")
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
  }, [
    error,
    currentView,
    gameSessions,
    activeGameId,
    players,
    handleUpdateSession,
    handleEndGame,
    handleNavigateToDashboard,
    handleAddNewPlayerGlobally,
    handleStartNewGame,
    handleSelectGame,
    handleDeleteGame,
    loadPlayersFromDatabase,
  ])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-main">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading application...</p>
          {dataLoading && <p className="text-text-secondary text-sm mt-2">Fetching data...</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface-main">
      <Navbar
        setCurrentView={(view) => {
          console.log("[v0] Navbar view change:", view)
          if (view === "dashboard") {
            setActiveGameId(null)
          }
          setCurrentView(view)
          localStorage.setItem("poker-current-view", view)
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
