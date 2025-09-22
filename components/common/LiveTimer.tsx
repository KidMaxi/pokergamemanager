"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { calculateDuration, formatDuration } from "../../utils"

interface LiveTimerProps {
  startTime: string
  className?: string
}

const LiveTimer: React.FC<LiveTimerProps> = ({ startTime, className = "" }) => {
  const [duration, setDuration] = useState(calculateDuration(startTime))

  useEffect(() => {
    const interval = setInterval(() => {
      setDuration(calculateDuration(startTime))
    }, 1000)

    return () => {
      clearInterval(interval)
    }
  }, [startTime])

  return <span className={`font-mono ${className}`}>{formatDuration(duration)}</span>
}

export default LiveTimer
