export type PlayerNet = {
  id: string
  name: string
  net: number // dollars with one decimal
}

export type Transfer = {
  fromId: string
  toId: string
  amount: number
}

const r1 = (n: number) => Math.round(n * 10) / 10

export function computeSettlements(players: PlayerNet[]): Transfer[] {
  const creditors = players
    .filter((p) => p.net > 0)
    .map((p) => ({ ...p, net: r1(p.net) }))
    .sort((a, b) => b.net - a.net)

  const debtors = players
    .filter((p) => p.net < 0)
    .map((p) => ({ ...p, net: r1(p.net) }))
    .sort((a, b) => a.net - b.net)

  const transfers: Transfer[] = []

  let i = 0,
    j = 0
  while (i < creditors.length && j < debtors.length) {
    const take = Math.min(creditors[i].net, -debtors[j].net)
    const amt = r1(take)

    if (amt > 0) {
      transfers.push({
        fromId: debtors[j].id,
        toId: creditors[i].id,
        amount: amt,
      })
    }

    creditors[i].net = r1(creditors[i].net - amt)
    debtors[j].net = r1(debtors[j].net + amt)

    if (creditors[i].net === 0) i++
    if (debtors[j].net === 0) j++
  }

  return transfers
}
