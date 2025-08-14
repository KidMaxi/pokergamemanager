// Round to one decimal in dollars (e.g., 123.4)
export const roundDollars1 = (n: number | string) => {
  const v = Number(n)
  return Math.round(v * 10) / 10
}

// For RPC payloads, send strings to avoid float printing quirks
export const toDollarStr1 = (n: number | string) => roundDollars1(n).toFixed(1)

// For comparisons (e.g., finding winners), use integer dimes to avoid float issues
export const toDimesInt = (n: number | string) => Math.round(Number(n) * 10)
