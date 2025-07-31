export interface PerformanceMetrics {
  memoryUsage: number
  renderTime: number
  componentCount: number
  eventListeners: number
  localStorageSize: number
  sessionStorageSize: number
  timestamp: number
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor
  private metrics: PerformanceMetrics[] = []
  private observers: Set<(metrics: PerformanceMetrics) => void> = new Set()
  private monitoringInterval: NodeJS.Timeout | null = null
  private renderStartTime = 0
  private componentRenderCount = 0
  private isClient = typeof window !== "undefined"
  private isDestroyed = false
  private lastMetricsCollection = 0
  private metricsCollectionCooldown = 30000 // 30 seconds minimum between collections

  private constructor() {
    if (this.isClient && !this.isDestroyed) {
      this.startMonitoring()
      this.setupMemoryWarnings()
    }
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor()
    }
    return PerformanceMonitor.instance
  }

  private startMonitoring(): void {
    if (!this.isClient || this.isDestroyed) return

    // Monitor performance every 2 minutes (increased interval)
    this.monitoringInterval = setInterval(
      () => {
        if (!this.isDestroyed) {
          this.collectMetrics()
        }
      },
      2 * 60 * 1000,
    )

    // Initial collection after 5 seconds
    setTimeout(() => {
      if (!this.isDestroyed) {
        this.collectMetrics()
      }
    }, 5000)
  }

  private collectMetrics(): void {
    if (!this.isClient || this.isDestroyed) return

    // Implement cooldown to prevent excessive metrics collection
    const now = Date.now()
    if (now - this.lastMetricsCollection < this.metricsCollectionCooldown) {
      return
    }
    this.lastMetricsCollection = now

    try {
      const metrics: PerformanceMetrics = {
        memoryUsage: this.getMemoryUsage(),
        renderTime: this.getAverageRenderTime(),
        componentCount: this.componentRenderCount,
        eventListeners: this.getEventListenerCount(),
        localStorageSize: this.getStorageSize("localStorage"),
        sessionStorageSize: this.getStorageSize("sessionStorage"),
        timestamp: now,
      }

      this.metrics.push(metrics)

      // Keep only last 10 metrics (20 minutes of data)
      if (this.metrics.length > 10) {
        this.metrics = this.metrics.slice(-10)
      }

      this.notifyObservers(metrics)
      this.checkForIssues(metrics)
    } catch (error) {
      console.error("Error collecting performance metrics:", error)
    }
  }

  private getMemoryUsage(): number {
    if (!this.isClient) return 0

    try {
      if ("memory" in performance) {
        const memory = (performance as any).memory
        return memory.usedJSHeapSize / 1024 / 1024 // MB
      }
    } catch (error) {
      console.error("Error getting memory usage:", error)
    }
    return 0
  }

  private getAverageRenderTime(): number {
    if (!this.isClient) return 0

    try {
      if (typeof performance !== "undefined" && performance.getEntriesByType) {
        const measures = performance.getEntriesByType("measure")
        const renderMeasures = measures.filter((m) => m.name.includes("render"))

        if (renderMeasures.length > 0) {
          const total = renderMeasures.reduce((sum, measure) => sum + measure.duration, 0)
          return total / renderMeasures.length
        }
      }
    } catch (error) {
      console.error("Error getting render time:", error)
    }
    return 0
  }

  private getEventListenerCount(): number {
    if (!this.isClient) return 0

    try {
      // This is an approximation - actual count is hard to get
      const elements = document.querySelectorAll("*")
      let count = 0

      // Sample only a subset to avoid performance issues
      const sampleSize = Math.min(elements.length, 100)
      for (let i = 0; i < sampleSize; i++) {
        const element = elements[i]
        const events = ["onclick", "onchange", "onsubmit", "onload", "onerror"]
        events.forEach((event) => {
          if (element.getAttribute(event)) count++
        })
      }

      // Extrapolate to full document
      return Math.round((count / sampleSize) * elements.length)
    } catch (error) {
      console.error("Error counting event listeners:", error)
      return 0
    }
  }

  private getStorageSize(storageType: "localStorage" | "sessionStorage"): number {
    if (!this.isClient) return 0

    try {
      const storage = storageType === "localStorage" ? localStorage : sessionStorage
      let total = 0

      for (const key in storage) {
        if (storage.hasOwnProperty(key)) {
          total += storage[key].length + key.length
        }
      }

      return total / 1024 // KB
    } catch (error) {
      console.error(`Error getting ${storageType} size:`, error)
      return 0
    }
  }

  private setupMemoryWarnings(): void {
    if (!this.isClient || this.isDestroyed) return

    // Check memory every 5 minutes
    setInterval(
      () => {
        if (this.isDestroyed) return

        try {
          if ("memory" in performance) {
            const memory = (performance as any).memory
            const usedMB = memory.usedJSHeapSize / 1024 / 1024
            const limitMB = memory.jsHeapSizeLimit / 1024 / 1024

            if (usedMB > limitMB * 0.85) {
              console.warn(`High memory usage: ${usedMB.toFixed(2)}MB / ${limitMB.toFixed(2)}MB`)
              this.triggerGarbageCollection()
            }
          }
        } catch (error) {
          console.error("Error in memory warning check:", error)
        }
      },
      5 * 60 * 1000,
    )
  }

  private triggerGarbageCollection(): void {
    if (!this.isClient || this.isDestroyed) return

    try {
      // Force garbage collection if available (Chrome DevTools)
      if ("gc" in window) {
        ;(window as any).gc()
        console.log("Garbage collection triggered")
      }

      // Clear old performance entries
      if (performance.clearMeasures) {
        performance.clearMeasures()
      }
      if (performance.clearMarks) {
        performance.clearMarks()
      }

      // Clear old metrics
      if (this.metrics.length > 5) {
        this.metrics = this.metrics.slice(-5)
      }
    } catch (error) {
      console.error("Error triggering garbage collection:", error)
    }
  }

  private checkForIssues(metrics: PerformanceMetrics): void {
    const issues: string[] = []

    // Check memory usage
    if (metrics.memoryUsage > 150) {
      issues.push(`High memory usage: ${metrics.memoryUsage.toFixed(2)}MB`)
    }

    // Check render time
    if (metrics.renderTime > 50) {
      issues.push(`Slow rendering: ${metrics.renderTime.toFixed(2)}ms`)
    }

    // Check storage size
    if (metrics.localStorageSize > 10000) {
      // 10MB
      issues.push(`Large localStorage: ${(metrics.localStorageSize / 1024).toFixed(2)}MB`)
    }

    // Check for memory leaks (increasing memory over time)
    if (this.metrics.length >= 3) {
      const recent = this.metrics.slice(-3)
      const memoryTrend = recent[recent.length - 1].memoryUsage - recent[0].memoryUsage

      if (memoryTrend > 50) {
        // 50MB increase
        issues.push(`Potential memory leak: +${memoryTrend.toFixed(2)}MB over 3 samples`)
        this.triggerGarbageCollection()
      }
    }

    if (issues.length > 0) {
      console.warn("Performance issues detected:", issues)
    }
  }

  private notifyObservers(metrics: PerformanceMetrics): void {
    if (this.isDestroyed) return

    // Use requestAnimationFrame to batch notifications
    requestAnimationFrame(() => {
      if (this.isDestroyed) return

      this.observers.forEach((observer) => {
        try {
          observer(metrics)
        } catch (error) {
          console.error("Error notifying performance observer:", error)
        }
      })
    })
  }

  // Public methods
  markRenderStart(): void {
    if (!this.isClient || this.isDestroyed) return

    this.renderStartTime = performance.now()
    performance.mark("render-start")
  }

  markRenderEnd(): void {
    if (!this.isClient || this.isDestroyed || this.renderStartTime === 0) return

    try {
      performance.mark("render-end")
      performance.measure("render-time", "render-start", "render-end")
      this.componentRenderCount++
    } catch (error) {
      console.error("Error marking render end:", error)
    }
  }

  subscribe(observer: (metrics: PerformanceMetrics) => void): () => void {
    if (this.isDestroyed) {
      console.warn("Cannot subscribe to destroyed PerformanceMonitor")
      return () => {}
    }

    this.observers.add(observer)

    // Send latest metrics immediately if available
    if (this.metrics.length > 0) {
      try {
        observer(this.metrics[this.metrics.length - 1])
      } catch (error) {
        console.error("Error in initial observer notification:", error)
      }
    }

    return () => {
      this.observers.delete(observer)
    }
  }

  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics]
  }

  getLatestMetrics(): PerformanceMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null
  }

  clearMetrics(): void {
    this.metrics = []
  }

  destroy(): void {
    this.isDestroyed = true

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }

    this.observers.clear()
    this.metrics = []
  }
}
