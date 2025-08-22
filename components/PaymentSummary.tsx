"use client"

import type React from "react"
import { useMemo, useState, useEffect } from "react"
import type { GameSession } from "../types"
import { formatCurrency } from "../utils"
import { calculatePayments, formatPaymentSummary, type PlayerResult } from "../utils/paymentCalculator"
import { getGameResults } from "../lib/finalize"
import Card from "./common/Card"

interface PaymentSummaryProps {
  session: GameSession
  className?: string
}

const PaymentSummary: React.FC<PaymentSummaryProps> = ({ session, className = "" }) => {
  const [copySuccess, setCopySuccess] = useState(false)
  const [persistedResults, setPersistedResults] = useState<any[]>([])
  const [loadingResults, setLoadingResults] = useState(false)

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

    return {
      totalPlayers: session.playersInGame.length,
      totalBuyIns,
      totalCashOuts,
      totalPot: totalBuyIns,
      gameDuration: `${hours}h ${minutes}m`,
      pointValue: session.pointValue || 0.1,
      gameDate: new Date(session.startTime).toLocaleDateString(),
      gameTime: new Date(session.startTime).toLocaleTimeString(),
    }
  }, [session])

  useEffect(() => {
    if (session.status === "completed" && session.dbId) {
      setLoadingResults(true)
      getGameResults(session.dbId)
        .then((results) => {
          console.log("[v0] Fetched persisted game results:", results)
          setPersistedResults(results)
        })
        .catch((error) => {
          console.error("[v0] Failed to fetch persisted results:", error)
          setPersistedResults([])
        })
        .finally(() => {
          setLoadingResults(false)
        })
    }
  }, [session.status, session.dbId])

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
      className={`min-h-screen text-white ${className}`}
      style={{
        backgroundImage: "url('/images/poker-table-background.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
        backgroundColor: "#0a0f1a",
      }}
    >
      <div className="container mx-auto p-4 max-w-6xl space-y-6">
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-6 border-2 border-green-500">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            <div>
              <h1 className="text-4xl font-bold text-green-400 mb-2 flex items-center">
                <span className="mr-3">🏆</span>
                Game Complete!
              </h1>
              <p className="text-xl text-slate-300 mb-1">{session.name || "Poker Game"}</p>
              <p className="text-slate-400">
                {gameStats?.gameDate} at {gameStats?.gameTime} • Duration: {gameStats?.gameDuration}
              </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full lg:w-auto">
              <div className="bg-slate-700/80 backdrop-blur-sm rounded-lg p-3 text-center border border-slate-600">
                <div className="text-2xl font-bold text-blue-400">{gameStats?.totalPlayers}</div>
                <div className="text-xs text-slate-400">Players</div>
              </div>
              <div className="bg-slate-700/80 backdrop-blur-sm rounded-lg p-3 text-center border border-slate-600">
                <div className="text-2xl font-bold text-green-400">{formatCurrency(gameStats?.totalPot || 0)}</div>
                <div className="text-xs text-slate-400">Total Pot</div>
              </div>
              <div className="bg-slate-700/80 backdrop-blur-sm rounded-lg p-3 text-center border border-slate-600">
                <div className="text-2xl font-bold text-purple-400">${gameStats?.pointValue}</div>
                <div className="text-xs text-slate-400">Point Value</div>
              </div>
              <div className="bg-slate-700/80 backdrop-blur-sm rounded-lg p-3 text-center border border-slate-600">
                <div className="text-2xl font-bold text-yellow-400">{gameStats?.gameDuration}</div>
                <div className="text-xs text-slate-400">Duration</div>
              </div>
            </div>
          </div>
        </div>

        <Card className="bg-slate-800/90 backdrop-blur-sm border-2 border-slate-600">
          <div className="p-6">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
              <span className="mr-3">🎯</span>
              Player Results
            </h2>

            <div className="space-y-6">
              {/* Winners Section */}
              {playerResults.filter((p) => p.netAmount > 0).length > 0 && (
                <div>
                  <h3 className="text-xl font-bold text-green-400 mb-4 flex items-center">
                    <span className="mr-2">🏆</span>
                    Winners ({playerResults.filter((p) => p.netAmount > 0).length})
                  </h3>
                  <div className="grid gap-3">
                    {playerResults
                      .filter((p) => p.netAmount > 0)
                      .sort((a, b) => b.netAmount - a.netAmount)
                      .map((player, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-4 bg-gradient-to-r from-green-900/50 to-green-800/30 rounded-lg border border-green-500/50 backdrop-blur-sm hover:border-green-400/70 transition-all"
                        >
                          <div className="flex items-center space-x-4">
                            <div className="relative">
                              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg">
                                {player.name.charAt(0).toUpperCase()}
                              </div>
                              {index === 0 && (
                                <div className="absolute -top-1 -right-1 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center text-xs">
                                  👑
                                </div>
                              )}
                            </div>
                            <div>
                              <span className="font-bold text-white text-lg">{player.name}</span>
                              {player.hasCashedOut && (
                                <div className="flex items-center mt-1">
                                  <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                                    Early Cashout
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-green-400 text-2xl">+{formatCurrency(player.netAmount)}</div>
                            <div className="text-green-300 text-sm">Profit</div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Losers Section */}
              {playerResults.filter((p) => p.netAmount < 0).length > 0 && (
                <div>
                  <h3 className="text-xl font-bold text-red-400 mb-4 flex items-center">
                    <span className="mr-2">📉</span>
                    Losers ({playerResults.filter((p) => p.netAmount < 0).length})
                  </h3>
                  <div className="grid gap-3">
                    {playerResults
                      .filter((p) => p.netAmount < 0)
                      .sort((a, b) => a.netAmount - b.netAmount)
                      .map((player, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-4 bg-gradient-to-r from-red-900/50 to-red-800/30 rounded-lg border border-red-500/50 backdrop-blur-sm hover:border-red-400/70 transition-all"
                        >
                          <div className="flex items-center space-x-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg">
                              {player.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-bold text-white text-lg">{player.name}</span>
                              {player.hasCashedOut && (
                                <div className="flex items-center mt-1">
                                  <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                                    Early Cashout
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-red-400 text-2xl">{formatCurrency(player.netAmount)}</div>
                            <div className="text-red-300 text-sm">Loss</div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Break-even Section */}
              {playerResults.filter((p) => p.netAmount === 0).length > 0 && (
                <div>
                  <h3 className="text-xl font-bold text-yellow-400 mb-4 flex items-center">
                    <span className="mr-2">⚖️</span>
                    Break-even ({playerResults.filter((p) => p.netAmount === 0).length})
                  </h3>
                  <div className="grid gap-3">
                    {playerResults
                      .filter((p) => p.netAmount === 0)
                      .map((player, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-4 bg-gradient-to-r from-yellow-900/50 to-yellow-800/30 rounded-lg border border-yellow-500/50 backdrop-blur-sm hover:border-yellow-400/70 transition-all"
                        >
                          <div className="flex items-center space-x-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg">
                              {player.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-bold text-white text-lg">{player.name}</span>
                              {player.hasCashedOut && (
                                <div className="flex items-center mt-1">
                                  <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                                    Early Cashout
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-yellow-400 text-2xl">{formatCurrency(0)}</div>
                            <div className="text-yellow-300 text-sm">Even</div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-green-900/80 to-blue-900/80 backdrop-blur-sm border-2 border-green-500">
          <div className="p-6">
            <h2 className="text-2xl font-bold text-green-400 mb-6 flex items-center">
              <span className="mr-3">💰</span>
              Payment Settlement
            </h2>

            <div className="space-y-6">
              {transactions.length === 0 ? (
                <div className="text-center p-8 bg-gradient-to-r from-green-800/50 to-emerald-800/50 rounded-lg border border-green-500/50 backdrop-blur-sm">
                  <div className="text-8xl mb-4">🎉</div>
                  <p className="text-green-200 text-2xl font-bold mb-2">Perfect Balance!</p>
                  <p className="text-green-300 text-lg">No payments needed - everyone broke even!</p>
                </div>
              ) : (
                <div>
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center">
                    <span className="mr-2">💸</span>
                    Who Pays Whom:
                  </h3>
                  <div className="space-y-4">
                    {transactions.map((transaction, index) => (
                      <div
                        key={index}
                        className="group relative overflow-hidden bg-slate-800/80 backdrop-blur-sm rounded-lg border border-slate-600 hover:border-green-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/20"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-green-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        <div className="relative flex items-center justify-between p-5">
                          <div className="flex items-center space-x-4 flex-1 min-w-0">
                            <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-full w-12 h-12 flex items-center justify-center text-lg font-bold flex-shrink-0 shadow-lg">
                              {index + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center space-x-3 mb-1">
                                <span className="font-bold text-red-300 text-lg">{transaction.from}</span>
                                <div className="flex items-center space-x-1">
                                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                </div>
                                <span className="font-bold text-green-300 text-lg">{transaction.to}</span>
                              </div>
                              <div className="text-slate-400 text-sm">Payment required</div>
                            </div>
                          </div>
                          <div className="bg-gradient-to-r from-green-600 to-green-500 text-white px-6 py-3 rounded-lg font-bold text-2xl shadow-lg flex-shrink-0 ml-4">
                            {formatCurrency(transaction.amount)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-slate-800/60 backdrop-blur-sm rounded-lg p-5 border border-slate-600">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-lg font-bold text-white flex items-center">
                    <span className="mr-2">📋</span>
                    Quick Copy Summary
                  </h4>
                  <button
                    onClick={handleCopyToClipboard}
                    className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all duration-300 transform hover:scale-105 ${
                      copySuccess
                        ? "bg-green-600 text-white shadow-lg shadow-green-500/30"
                        : "bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white shadow-lg hover:shadow-green-500/30"
                    }`}
                  >
                    {copySuccess ? (
                      <>
                        <span className="text-lg">✓</span>
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <span className="text-lg">📋</span>
                        <span>Copy to Clipboard</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-slate-900/80 rounded-lg border border-slate-700 overflow-hidden">
                  <pre className="text-sm text-slate-300 whitespace-pre-wrap font-mono p-4 overflow-x-auto max-h-48 overflow-y-auto">
                    {summary}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-4 border border-slate-600 text-center">
          <p className="text-slate-400 text-sm">
            Game completed on {gameStats?.gameDate} • Total duration: {gameStats?.gameDuration} •
            {playerResults.filter((p) => p.netAmount > 0).length} winners,{" "}
            {playerResults.filter((p) => p.netAmount < 0).length} losers
          </p>
          <p className="text-slate-500 text-xs mt-1">Thanks for playing! 🎲 Share this summary with your friends.</p>
        </div>
      </div>
    </div>
  )
}

export default PaymentSummary
