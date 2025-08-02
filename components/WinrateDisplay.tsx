import type React from "react"
import { formatWinRate, getWinRateColor } from "../utils/winrateUtils"

interface WinrateDisplayProps {
  winRate: number
  className?: string
  showLabel?: boolean
}

const WinrateDisplay: React.FC<WinrateDisplayProps> = ({ winRate, className = "", showLabel = true }) => {
  const colorClass = getWinRateColor(winRate)

  return (
    <span className={`font-semibold ${colorClass} ${className}`}>
      {showLabel && "Win Rate: "}
      {formatWinRate(winRate)}
    </span>
  )
}

export default WinrateDisplay
