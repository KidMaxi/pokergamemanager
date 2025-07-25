"use client"

import type React from "react"
import { useMemo, useState } from "react"
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

  const paymentData = useMemo(() => {
    if (session.status !== "completed") return null

    // Calculate net profit/loss for each player
    const playerResults: PlayerResult[] = session.playersInGame.map((player) => {
      const totalBuyIn = player.buyIns.reduce((sum, buyIn) => sum + buyIn.amount, 0)
      const netAmount = player.cashOutAmount - totalBuyIn

      return {
        name: player.name,
        netAmount: netAmount,
      }
    })

    const transactions = calculatePayments(playerResults)
    const summary = formatPaymentSummary(transactions)

    return {
      playerResults,
      transactions,
      summary,
    }
  }, [session])

  const handleCopyToClipboard = async () => {
    if (!paymentData?.summary) return

    try {
      await navigator.clipboard.writeText(paymentData.summary)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000) // Reset after 2 seconds
    } catch (err) {
      console.error("Failed to copy text: ", err)
      // Fallback for older browsers
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

  const { transactions, summary } = paymentData

  return (
    <div className={`${className}`}>
      <Card
        className="bg-gradient-to-r from-green-900 to-blue-900 border-2 border-brand-primary"
        title="💰 Payment Settlement"
      >
        <div className="space-y-3 sm:space-y-6">
          {/* Payment Instructions */}
          <div>
            <h5 className="text-base sm:text-lg font-bold text-brand-primary mb-2 sm:mb-4 flex items-center">
              <span className="mr-2">💸</span>
              Who Pays Whom:
            </h5>
            {transactions.length === 0 ? (
              <div className="text-center p-3 sm:p-6 bg-green-800 rounded-lg">
                <p className="text-green-200 text-sm sm:text-lg font-semibold">
                  🎉 No payments needed - everyone broke even!
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((transaction, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 sm:p-4 bg-slate-800 rounded-lg border-l-4 border-brand-primary shadow-lg"
                  >
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <span className="bg-brand-primary text-white rounded-full w-5 h-5 sm:w-8 sm:h-8 flex items-center justify-center text-xs sm:text-sm font-bold flex-shrink-0">
                        {index + 1}
                      </span>
                      <div className="text-text-primary text-xs sm:text-lg min-w-0 flex-1">
                        <div className="flex flex-col">
                          <span className="font-bold text-red-300 truncate">{transaction.from}</span>
                          <span className="text-xs text-text-secondary">pays</span>
                          <span className="font-bold text-green-300 truncate">{transaction.to}</span>
                        </div>
                      </div>
                    </div>
                    <span className="font-bold text-brand-primary text-sm sm:text-xl bg-slate-700 px-2 py-1 rounded flex-shrink-0 ml-2">
                      {formatCurrency(transaction.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Copy Summary */}
          <div className="bg-slate-800 rounded-lg p-3 border border-slate-600">
            <div className="flex items-center justify-between mb-2">
              <h6 className="text-xs sm:text-sm font-semibold text-text-secondary flex items-center">
                <span className="mr-1">📋</span>
                Quick Copy:
              </h6>
              <button
                onClick={handleCopyToClipboard}
                className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-all duration-200 ${
                  copySuccess ? "bg-green-600 text-white" : "bg-brand-primary hover:bg-brand-primary-hover text-white"
                }`}
              >
                {copySuccess ? (
                  <>
                    <span>✓</span>
                    <span className="hidden xs:inline">Copied!</span>
                  </>
                ) : (
                  <>
                    <span>📋</span>
                    <span className="hidden xs:inline">Copy</span>
                  </>
                )}
              </button>
            </div>
            <div className="bg-slate-900 rounded border overflow-hidden">
              <pre className="text-xs text-text-secondary whitespace-pre-wrap font-mono p-2 overflow-x-auto">
                {summary}
              </pre>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default PaymentSummary
