"use client"

import type React from "react"
import { useMemo, useState, useEffect } from "react"
import type { GameSession } from "../types"
import { formatCurrency } from "../utils"
import { calculatePayments, formatPaymentSummary, type PlayerResult } from "../utils/paymentCalculator"
import Card from "./common/Card"

interface PaymentSummaryProps {
  session: GameSession
  className?: string
}

const PaymentSummary: React.FC<PaymentSummaryProps> = ({ session, className = "" }) => {
  const [copySuccess, setCopySuccess] = useState(false)
  const [persistedResults, setPersistedResults] = useState<any[]>([])
  const [loadingResults, setLoadingResults] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  const gameStats = useMemo(() => {
    if (session.status !== "completed") return null

    const totalBuyIns = session.playersInGame.reduce(
      (sum, player) => sum + player.buyIns.reduce((playerSum, buyIn) => playerSum + buyIn.amount, 0),
      0,
    )

    const totalCashOuts = session.playersInGame.reduce((sum, player) => {
      const cashOut = player.hasCashedOut ? player.cashOutAmount : player.cash || 0
      return sum + cashOut
    }, 0)

    const gameDuration = new Date().getTime() - new Date(session.startTime).getTime()
    const hours = Math.floor(gameDuration / (1000 * 60 * 60))
    const minutes = Math.floor((gameDuration % (1000 * 60 * 60)) / (1000 * 60))

    const winners = session.playersInGame.filter((p) => {
      const totalBuyIn = p.buyIns.reduce((sum, buyIn) => sum + buyIn.amount, 0)
      const cashOut = p.hasCashedOut ? p.cashOutAmount : p.cash || 0
      return cashOut - totalBuyIn > 0
    })

    const biggestWinner = winners.reduce((max, player) => {
      const totalBuyIn = player.buyIns.reduce((sum, buyIn) => sum + buyIn.amount, 0)
      const cashOut = player.hasCashedOut ? player.cashOutAmount : player.cash || 0
      const profit = cashOut - totalBuyIn
      const maxProfit = max ? max.cashOut - max.totalBuyIn : 0
      return profit > maxProfit ? { ...player, profit, totalBuyIn, cashOut } : max
    }, null as any)

    const earlyCheckouts = session.playersInGame.filter((p) => p.hasCashedOut).length

    return {
      totalPlayers: session.playersInGame.length,
      totalBuyIns,
      totalCashOuts,
      totalPot: totalBuyIns,
      gameDuration: `${hours}h ${minutes}m`,
      pointValue: session.pointValue || 0.1,
      gameDate: new Date(session.startTime).toLocaleDateString(),
      gameTime: new Date(session.startTime).toLocaleTimeString(),
      winnersCount: winners.length,
      biggestWinner: biggestWinner?.name,
      biggestWinAmount: biggestWinner?.profit || 0,
      earlyCheckouts,
      averageBuyIn: totalBuyIns / session.playersInGame.length,
    }
  }, [session])

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  const paymentData = useMemo(() => {
    if (session.status !== "completed") return null

    let playerResults: PlayerResult[]

    if (persistedResults.length > 0) {
      console.log("[v0] Using persisted results for payment calculation")
      playerResults = persistedResults.map((result) => ({
        name: result.name,
        netAmount: result.netDollars,
      }))
    } else {
      console.log("[v0] Using local calculation for payment summary")
      playerResults = session.playersInGame.map((player) => {
        const totalBuyIn = player.buyIns.reduce((sum, buyIn) => sum + buyIn.amount, 0)
        const cashOut = player.hasCashedOut ? player.cashOutAmount : player.cash || 0
        const netAmount = cashOut - totalBuyIn

        return {
          name: player.name,
          netAmount: netAmount,
          totalBuyIn,
          cashOut,
          hasCashedOut: player.hasCashedOut,
        }
      })
    }

    const transactions = calculatePayments(playerResults)
    const summary = formatPaymentSummary(transactions)

    return {
      playerResults,
      transactions,
      summary,
    }
  }, [session, persistedResults])

  const handleCopyToClipboard = async () => {
    if (!paymentData?.summary) return

    try {
      await navigator.clipboard.writeText(paymentData.summary)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      console.error("Failed to copy text: ", err)
      const textArea = document.createElement("textarea")
      textArea.value = paymentData.summary
      document.body.appendChild(textArea)
      textArea.select()
      try {
        document.execCommand("copy")
        setCopySuccess(true)
        setTimeout(() => setCopySuccess(false), 2000)
      } catch (fallbackErr) {
        console.error("Fallback copy failed: ", fallbackErr)
      }
      document.body.removeChild(textArea)
    }
  }

  if (!paymentData || session.status !== "completed") {
    return null
  }

  if (loadingResults) {
    return (
      <div
        className={`min-h-screen ${className}`}
        style={{
          backgroundImage: "url('/images/poker-table-background.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundAttachment: "fixed",
          backgroundColor: "#0a0f1a",
        }}
      >
        <div className="container mx-auto p-4 max-w-6xl">
          <Card className="bg-slate-800/90 backdrop-blur-sm border-2 border-green-500">
            <div className="text-center p-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
              <p className="text-slate-400 text-lg">Loading game results...</p>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  const { playerResults, transactions, summary } = paymentData

  return (
    <div
      className={`min-h-screen text-white ${className} transition-all duration-1000 ${isVisible ? "opacity-100" : "opacity-0"}`}
      style={{
        backgroundImage: "url('/images/poker-table-background.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
        backgroundColor: "#0a0f1a",
      }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-green-400/30 rounded-full animate-pulse"></div>
        <div className="absolute top-1/3 right-1/3 w-1 h-1 bg-blue-400/40 rounded-full animate-ping"></div>
        <div className="absolute bottom-1/4 left-1/3 w-3 h-3 bg-yellow-400/20 rounded-full animate-bounce"></div>
        <div className="absolute bottom-1/3 right-1/4 w-1 h-1 bg-purple-400/30 rounded-full animate-pulse"></div>
      </div>

      <div className="container mx-auto p-4 max-w-6xl space-y-6 relative z-10">
        <div className="bg-gradient-to-br from-slate-800/95 to-slate-900/95 backdrop-blur-md rounded-2xl p-8 border-2 border-green-500/50 shadow-2xl shadow-green-500/20 transform hover:scale-[1.02] transition-all duration-300">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            <div className="relative">
              <div className="absolute -top-4 -left-4 text-4xl animate-bounce">🎉</div>
              <div className="absolute -top-2 -right-2 text-2xl animate-pulse">✨</div>

              <h1 className="text-5xl font-bold bg-gradient-to-r from-green-400 via-emerald-400 to-green-500 bg-clip-text text-transparent mb-3 flex items-center">
                <span className="mr-4 text-6xl animate-pulse">🏆</span>
                Game Complete!
              </h1>
              <p className="text-2xl text-slate-200 mb-2 font-semibold">{session.name || "Poker Night"}</p>
              <div className="flex items-center space-x-4 text-slate-400">
                <span className="flex items-center">
                  <span className="mr-2">📅</span>
                  {gameStats?.gameDate}
                </span>
                <span className="flex items-center">
                  <span className="mr-2">⏰</span>
                  {gameStats?.gameTime}
                </span>
                <span className="flex items-center">
                  <span className="mr-2">⏱️</span>
                  {gameStats?.gameDuration}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full lg:w-auto">
              <div className="group bg-gradient-to-br from-blue-600/80 to-blue-700/80 backdrop-blur-sm rounded-xl p-4 text-center border border-blue-400/50 hover:border-blue-300 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/30 transform hover:scale-105">
                <div className="text-3xl font-bold text-white mb-1">{gameStats?.totalPlayers}</div>
                <div className="text-xs text-blue-200 font-medium">Players</div>
                <div className="text-2xl mt-1 group-hover:animate-bounce">👥</div>
              </div>

              <div className="group bg-gradient-to-br from-green-600/80 to-emerald-700/80 backdrop-blur-sm rounded-xl p-4 text-center border border-green-400/50 hover:border-green-300 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/30 transform hover:scale-105">
                <div className="text-3xl font-bold text-white mb-1">{formatCurrency(gameStats?.totalPot || 0)}</div>
                <div className="text-xs text-green-200 font-medium">Total Pot</div>
                <div className="text-2xl mt-1 group-hover:animate-spin">💰</div>
              </div>

              <div className="group bg-gradient-to-br from-purple-600/80 to-purple-700/80 backdrop-blur-sm rounded-xl p-4 text-center border border-purple-400/50 hover:border-purple-300 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/30 transform hover:scale-105">
                <div className="text-3xl font-bold text-white mb-1">${gameStats?.pointValue}</div>
                <div className="text-xs text-purple-200 font-medium">Point Value</div>
                <div className="text-2xl mt-1 group-hover:animate-pulse">🎯</div>
              </div>

              <div className="group bg-gradient-to-br from-yellow-600/80 to-orange-700/80 backdrop-blur-sm rounded-xl p-4 text-center border border-yellow-400/50 hover:border-yellow-300 transition-all duration-300 hover:shadow-lg hover:shadow-yellow-500/30 transform hover:scale-105">
                <div className="text-3xl font-bold text-white mb-1">{gameStats?.winnersCount}</div>
                <div className="text-xs text-yellow-200 font-medium">Winners</div>
                <div className="text-2xl mt-1 group-hover:animate-bounce">🎊</div>
              </div>
            </div>
          </div>

          {gameStats?.biggestWinner && (
            <div className="mt-6 pt-6 border-t border-slate-600/50">
              <div className="flex flex-wrap items-center justify-center gap-6 text-center">
                <div className="bg-gradient-to-r from-yellow-500/20 to-yellow-600/20 backdrop-blur-sm rounded-lg px-4 py-2 border border-yellow-400/30">
                  <div className="text-yellow-400 font-bold">🏅 Biggest Winner</div>
                  <div className="text-white font-semibold">
                    {gameStats.biggestWinner} (+{formatCurrency(gameStats.biggestWinAmount)})
                  </div>
                </div>

                <div className="bg-gradient-to-r from-blue-500/20 to-blue-600/20 backdrop-blur-sm rounded-lg px-4 py-2 border border-blue-400/30">
                  <div className="text-blue-400 font-bold">💸 Average Buy-in</div>
                  <div className="text-white font-semibold">{formatCurrency(gameStats.averageBuyIn)}</div>
                </div>

                {gameStats.earlyCheckouts > 0 && (
                  <div className="bg-gradient-to-r from-purple-500/20 to-purple-600/20 backdrop-blur-sm rounded-lg px-4 py-2 border border-purple-400/30">
                    <div className="text-purple-400 font-bold">🚪 Early Cashouts</div>
                    <div className="text-white font-semibold">{gameStats.earlyCheckouts} players</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <Card className="bg-gradient-to-br from-slate-800/95 to-slate-900/95 backdrop-blur-md border-2 border-slate-600/50 shadow-2xl">
          <div className="p-8">
            <h2 className="text-3xl font-bold text-white mb-8 flex items-center">
              <span className="mr-4 text-4xl animate-pulse">🎯</span>
              <span className="bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                Player Results
              </span>
            </h2>

            <div className="space-y-8">
              {playerResults.filter((p) => p.netAmount > 0).length > 0 && (
                <div className="transform hover:scale-[1.01] transition-all duration-300">
                  <h3 className="text-2xl font-bold text-green-400 mb-6 flex items-center">
                    <span className="mr-3 text-3xl animate-bounce">🏆</span>
                    <span className="bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                      Winners ({playerResults.filter((p) => p.netAmount > 0).length})
                    </span>
                  </h3>
                  <div className="grid gap-4">
                    {playerResults
                      .filter((p) => p.netAmount > 0)
                      .sort((a, b) => b.netAmount - a.netAmount)
                      .map((player, index) => (
                        <div
                          key={index}
                          className="group relative overflow-hidden flex items-center justify-between p-6 bg-gradient-to-r from-green-900/60 via-green-800/40 to-emerald-900/60 rounded-xl border border-green-500/50 backdrop-blur-sm hover:border-green-400/70 transition-all duration-500 hover:shadow-2xl hover:shadow-green-500/30 transform hover:scale-[1.02]"
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-green-500/10 to-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                          <div className="relative flex items-center space-x-6">
                            <div className="relative">
                              <div className="w-16 h-16 bg-gradient-to-br from-green-400 via-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-2xl shadow-green-500/50 group-hover:shadow-green-400/60 transition-all duration-300">
                                {player.name.charAt(0).toUpperCase()}
                              </div>
                              {index === 0 && (
                                <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-full flex items-center justify-center text-sm shadow-lg animate-pulse">
                                  👑
                                </div>
                              )}
                              {index === 1 && (
                                <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-br from-gray-300 to-gray-400 rounded-full flex items-center justify-center text-sm shadow-lg">
                                  🥈
                                </div>
                              )}
                              {index === 2 && (
                                <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-br from-orange-400 to-orange-500 rounded-full flex items-center justify-center text-sm shadow-lg">
                                  🥉
                                </div>
                              )}
                            </div>
                            <div>
                              <span className="font-bold text-white text-xl group-hover:text-green-200 transition-colors">
                                {player.name}
                              </span>
                              <div className="flex items-center space-x-2 mt-1">
                                {player.hasCashedOut && (
                                  <span className="px-3 py-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-xs rounded-full shadow-lg">
                                    🚪 Early Cashout
                                  </span>
                                )}
                                <span className="px-3 py-1 bg-gradient-to-r from-green-600 to-green-700 text-white text-xs rounded-full shadow-lg">
                                  #{index + 1} Winner
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="relative text-right">
                            <div className="font-bold text-green-300 text-3xl group-hover:text-green-200 transition-colors">
                              +{formatCurrency(player.netAmount)}
                            </div>
                            <div className="text-green-400 text-sm font-medium">Profit 📈</div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {playerResults.filter((p) => p.netAmount < 0).length > 0 && (
                <div className="transform hover:scale-[1.01] transition-all duration-300">
                  <h3 className="text-2xl font-bold text-red-400 mb-6 flex items-center">
                    <span className="mr-3 text-3xl">📉</span>
                    <span className="bg-gradient-to-r from-red-400 to-red-500 bg-clip-text text-transparent">
                      Losers ({playerResults.filter((p) => p.netAmount < 0).length})
                    </span>
                  </h3>
                  <div className="grid gap-4">
                    {playerResults
                      .filter((p) => p.netAmount < 0)
                      .sort((a, b) => a.netAmount - b.netAmount)
                      .map((player, index) => (
                        <div
                          key={index}
                          className="group relative overflow-hidden flex items-center justify-between p-6 bg-gradient-to-r from-red-900/60 via-red-800/40 to-red-900/60 rounded-xl border border-red-500/50 backdrop-blur-sm hover:border-red-400/70 transition-all duration-500 hover:shadow-2xl hover:shadow-red-500/30 transform hover:scale-[1.02]"
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-red-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                          <div className="relative flex items-center space-x-6">
                            <div className="w-16 h-16 bg-gradient-to-br from-red-400 via-red-500 to-red-600 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-2xl shadow-red-500/50 group-hover:shadow-red-400/60 transition-all duration-300">
                              {player.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-bold text-white text-xl group-hover:text-red-200 transition-colors">
                                {player.name}
                              </span>
                              <div className="flex items-center space-x-2 mt-1">
                                {player.hasCashedOut && (
                                  <span className="px-3 py-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-xs rounded-full shadow-lg">
                                    🚪 Early Cashout
                                  </span>
                                )}
                                <span className="px-3 py-1 bg-gradient-to-r from-red-600 to-red-700 text-white text-xs rounded-full shadow-lg">
                                  Loss 📉
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="relative text-right">
                            <div className="font-bold text-red-300 text-3xl group-hover:text-red-200 transition-colors">
                              {formatCurrency(player.netAmount)}
                            </div>
                            <div className="text-red-400 text-sm font-medium">Loss 📉</div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {playerResults.filter((p) => p.netAmount === 0).length > 0 && (
                <div className="transform hover:scale-[1.01] transition-all duration-300">
                  <h3 className="text-2xl font-bold text-yellow-400 mb-6 flex items-center">
                    <span className="mr-3 text-3xl">⚖️</span>
                    <span className="bg-gradient-to-r from-yellow-400 to-yellow-500 bg-clip-text text-transparent">
                      Break-even ({playerResults.filter((p) => p.netAmount === 0).length})
                    </span>
                  </h3>
                  <div className="grid gap-4">
                    {playerResults
                      .filter((p) => p.netAmount === 0)
                      .map((player, index) => (
                        <div
                          key={index}
                          className="group relative overflow-hidden flex items-center justify-between p-6 bg-gradient-to-r from-yellow-900/60 via-yellow-800/40 to-yellow-900/60 rounded-xl border border-yellow-500/50 backdrop-blur-sm hover:border-yellow-400/70 transition-all duration-500 hover:shadow-2xl hover:shadow-yellow-500/30 transform hover:scale-[1.02]"
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                          <div className="relative flex items-center space-x-6">
                            <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-2xl shadow-yellow-500/50 group-hover:shadow-yellow-400/60 transition-all duration-300">
                              {player.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-bold text-white text-xl group-hover:text-yellow-200 transition-colors">
                                {player.name}
                              </span>
                              <div className="flex items-center space-x-2 mt-1">
                                {player.hasCashedOut && (
                                  <span className="px-3 py-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-xs rounded-full shadow-lg">
                                    🚪 Early Cashout
                                  </span>
                                )}
                                <span className="px-3 py-1 bg-gradient-to-r from-yellow-600 to-yellow-700 text-white text-xs rounded-full shadow-lg">
                                  Break Even ⚖️
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="relative text-right">
                            <div className="font-bold text-yellow-300 text-3xl group-hover:text-yellow-200 transition-colors">
                              {formatCurrency(0)}
                            </div>
                            <div className="text-yellow-400 text-sm font-medium">Even ⚖️</div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-green-900/90 via-emerald-900/90 to-blue-900/90 backdrop-blur-md border-2 border-green-500/50 shadow-2xl shadow-green-500/20">
          <div className="p-8">
            <h2 className="text-3xl font-bold text-green-300 mb-8 flex items-center">
              <span className="mr-4 text-4xl animate-pulse">💰</span>
              <span className="bg-gradient-to-r from-green-300 to-emerald-300 bg-clip-text text-transparent">
                Payment Settlement
              </span>
            </h2>

            <div className="space-y-8">
              {transactions.length === 0 ? (
                <div className="text-center p-12 bg-gradient-to-br from-green-800/60 to-emerald-800/60 rounded-2xl border border-green-500/50 backdrop-blur-sm shadow-2xl">
                  <div className="text-9xl mb-6 animate-bounce">🎉</div>
                  <p className="text-green-200 text-3xl font-bold mb-4">Perfect Balance!</p>
                  <p className="text-green-300 text-xl">No payments needed - everyone broke even!</p>
                  <div className="mt-6 flex justify-center space-x-4">
                    <span className="text-4xl animate-pulse">✨</span>
                    <span className="text-4xl animate-bounce">🎊</span>
                    <span className="text-4xl animate-pulse">✨</span>
                  </div>
                </div>
              ) : (
                <div>
                  <h3 className="text-2xl font-bold text-white mb-6 flex items-center">
                    <span className="mr-3 text-3xl animate-pulse">💸</span>
                    <span className="bg-gradient-to-r from-white to-green-200 bg-clip-text text-transparent">
                      Who Pays Whom:
                    </span>
                  </h3>
                  <div className="space-y-6">
                    {transactions.map((transaction, index) => (
                      <div
                        key={index}
                        className="group relative overflow-hidden bg-gradient-to-r from-slate-800/90 to-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-600/50 hover:border-green-500/70 transition-all duration-500 hover:shadow-2xl hover:shadow-green-500/30 transform hover:scale-[1.02]"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        <div className="relative flex items-center justify-between p-8">
                          <div className="flex items-center space-x-6 flex-1 min-w-0">
                            <div className="bg-gradient-to-br from-green-500 via-green-600 to-emerald-600 text-white rounded-full w-16 h-16 flex items-center justify-center text-2xl font-bold flex-shrink-0 shadow-2xl shadow-green-500/50 group-hover:shadow-green-400/60 transition-all duration-300">
                              {index + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center space-x-4 mb-2">
                                <span className="font-bold text-red-300 text-2xl group-hover:text-red-200 transition-colors">
                                  {transaction.from}
                                </span>
                                <div className="flex items-center space-x-2">
                                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                                  <div
                                    className="w-3 h-3 bg-green-400 rounded-full animate-pulse"
                                    style={{ animationDelay: "0.2s" }}
                                  ></div>
                                  <div
                                    className="w-3 h-3 bg-green-400 rounded-full animate-pulse"
                                    style={{ animationDelay: "0.4s" }}
                                  ></div>
                                </div>
                                <span className="font-bold text-green-300 text-2xl group-hover:text-green-200 transition-colors">
                                  {transaction.to}
                                </span>
                              </div>
                              <div className="text-slate-400 text-base font-medium">Payment required 💳</div>
                            </div>
                          </div>
                          <div className="bg-gradient-to-r from-green-600 via-green-500 to-emerald-500 text-white px-8 py-4 rounded-xl font-bold text-3xl shadow-2xl shadow-green-500/50 flex-shrink-0 ml-6 group-hover:shadow-green-400/60 transition-all duration-300 transform group-hover:scale-105">
                            {formatCurrency(transaction.amount)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-md rounded-2xl p-8 border border-slate-600/50 shadow-xl">
                <div className="flex items-center justify-between mb-6">
                  <h4 className="text-2xl font-bold text-white flex items-center">
                    <span className="mr-3 text-3xl">📋</span>
                    <span className="bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                      Quick Copy Summary
                    </span>
                  </h4>
                  <button
                    onClick={handleCopyToClipboard}
                    className={`flex items-center space-x-3 px-8 py-4 rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-105 shadow-xl ${
                      copySuccess
                        ? "bg-gradient-to-r from-green-600 to-green-500 text-white shadow-green-500/50"
                        : "bg-gradient-to-r from-green-600 via-green-500 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white shadow-green-500/50 hover:shadow-green-400/60"
                    }`}
                  >
                    {copySuccess ? (
                      <>
                        <span className="text-2xl">✓</span>
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <span className="text-2xl">📋</span>
                        <span>Copy to Clipboard</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-slate-900/90 rounded-xl border border-slate-700/50 overflow-hidden shadow-inner">
                  <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono p-6 overflow-x-auto max-h-64 overflow-y-auto">
                    {summary}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="bg-gradient-to-r from-slate-800/95 to-slate-900/95 backdrop-blur-md rounded-2xl p-6 border border-slate-600/50 text-center shadow-xl">
          <div className="flex flex-wrap items-center justify-center gap-6 text-center mb-4">
            <div className="flex items-center space-x-2 text-slate-300">
              <span className="text-xl">📅</span>
              <span>Completed: {gameStats?.gameDate}</span>
            </div>
            <div className="flex items-center space-x-2 text-slate-300">
              <span className="text-xl">⏱️</span>
              <span>Duration: {gameStats?.gameDuration}</span>
            </div>
            <div className="flex items-center space-x-2 text-slate-300">
              <span className="text-xl">🏆</span>
              <span>{playerResults.filter((p) => p.netAmount > 0).length} winners</span>
            </div>
            <div className="flex items-center space-x-2 text-slate-300">
              <span className="text-xl">📉</span>
              <span>{playerResults.filter((p) => p.netAmount < 0).length} losers</span>
            </div>
          </div>
          <p className="text-slate-400 text-sm">
            <span className="mr-2">🎲</span>
            Thanks for playing! Share this summary with your friends and plan your next game.
            <span className="ml-2">🃏</span>
          </p>
        </div>
      </div>
    </div>
  )
}

export default PaymentSummary
