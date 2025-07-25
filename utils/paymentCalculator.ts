export interface PaymentTransaction {
  from: string // Player name who pays
  to: string // Player name who receives
  amount: number // Amount to pay
}

export interface PlayerResult {
  name: string
  netAmount: number // Positive = won, Negative = lost
}

export function calculatePayments(playerResults: PlayerResult[]): PaymentTransaction[] {
  // Separate winners and losers
  const winners = playerResults.filter((p) => p.netAmount > 0).sort((a, b) => b.netAmount - a.netAmount) // Sort winners by amount won (descending)

  const losers = playerResults
    .filter((p) => p.netAmount < 0)
    .map((p) => ({ ...p, netAmount: Math.abs(p.netAmount) })) // Convert to positive amounts
    .sort((a, b) => b.netAmount - a.netAmount) // Sort losers by amount lost (descending)

  const transactions: PaymentTransaction[] = []

  // Create working copies
  const workingWinners = winners.map((w) => ({ ...w }))
  const workingLosers = losers.map((l) => ({ ...l }))

  // Match losers to winners
  for (const loser of workingLosers) {
    let remainingDebt = loser.netAmount

    for (const winner of workingWinners) {
      if (remainingDebt <= 0 || winner.netAmount <= 0) continue

      const paymentAmount = Math.min(remainingDebt, winner.netAmount)

      if (paymentAmount > 0) {
        transactions.push({
          from: loser.name,
          to: winner.name,
          amount: paymentAmount,
        })

        remainingDebt -= paymentAmount
        winner.netAmount -= paymentAmount
      }
    }
  }

  return transactions
}

export function formatPaymentSummary(transactions: PaymentTransaction[]): string {
  if (transactions.length === 0) {
    return "No payments needed - all players broke even!"
  }

  let summary = "💰 Payment Summary:\n\n"
  transactions.forEach((transaction, index) => {
    summary += `${index + 1}. ${transaction.from} pays ${transaction.to}: $${transaction.amount.toFixed(2)}\n`
  })

  return summary
}
