export const generateId = (): string => {
  return crypto.randomUUID()
}

export const generateLogId = (): string => {
  return `${crypto.randomUUID()}-LOG`
}

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

export const formatDate = (isoString: string, includeTime = true): string => {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
  }
  if (includeTime) {
    options.hour = "2-digit"
    options.minute = "2-digit"
  }
  return new Date(isoString).toLocaleString(undefined, options)
}

export const formatTime = (isoString: string): string => {
  return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export const calculateDuration = (startTime: string, endTime?: string): number => {
  const start = new Date(startTime).getTime()
  const end = endTime ? new Date(endTime).getTime() : Date.now()
  return Math.max(0, end - start)
}

export const formatDuration = (durationMs: number): string => {
  const totalSeconds = Math.floor(durationMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  } else {
    return `${seconds}s`
  }
}

export const formatDurationCompact = (durationMs: number): string => {
  const totalMinutes = Math.floor(durationMs / (1000 * 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  } else {
    return `${minutes}m`
  }
}

export const formatElapsedTime = (startTime: string): string => {
  const duration = calculateDuration(startTime)
  return formatDuration(duration)
}
