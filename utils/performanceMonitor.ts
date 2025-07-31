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

  private constructor() {
    this.startMonitoring()
    this.setupMemoryWarnings()
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor()
    }
    return PerformanceMonitor.instance
  }

  private startMonitoring(): void {
    // Monitor performance every 30 seconds
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics()
    }, 30000)

    // Initial collection
    setTimeout(() => this.collectMetrics(), 1000)
  }

  private collectMetrics(): void {
    const metrics: PerformanceMetrics = {
      memoryUsage: this.getMemoryUsage(),
      renderTime: this.getAverageRenderTime(),
      componentCount: this.componentRenderCount,
      eventListeners: this.getEventListenerCount(),
      localStorageSize: this.getStorageSize("localStorage"),
      sessionStorageSize: this.getStorageSize("sessionStorage"),
      timestamp: Date.now(),
    }

    this.metrics.push(metrics)

    // Keep only last 20 metrics (10 minutes of data)
    if (this.metrics.length > 20) {
      this.metrics = this.metrics.slice(-20)
    }

    this.notifyObservers(metrics)
    this.checkForIssues(metrics)
  }

  private getMemoryUsage(): number {
    if ("memory" in performance) {
      const memory = (performance as any).memory
      return memory.usedJSHeapSize / 1024 / 1024 // MB
    }
    return 0
  }

  private getAverageRenderTime(): number {
    if (typeof performance !== "undefined" && performance.getEntriesByType) {
      const measures = performance.getEntriesByType("measure")
      const renderMeasures = measures.filter((m) => m.name.includes("render"))

      if (renderMeasures.length > 0) {
        const total = renderMeasures.reduce((sum, measure) => sum + measure.duration, 0)
        return total / renderMeasures.length
      }
    }
    return 0
  }

  private getEventListenerCount(): number {
    // This is an approximation - actual count is hard to get
    const elements = document.querySelectorAll("*")
    let count = 0

    elements.forEach((element) => {
      // Check for common event attributes
      const events = ["onclick", "onchange", "onsubmit", "onload", "onerror"]
      events.forEach((event) => {
        if (element.getAttribute(event)) count++
      })
    })

    return count
  }

  private getStorageSize(storageType: "localStorage" | "sessionStorage"): number {
    try {
      const storage = storageType === "localStorage" ? localStorage : sessionStorage
      let total = 0

      for (const key in storage) {
        if (storage.hasOwnProperty(key)) {
          total += storage[key].length + key.length
        }
      }

      return total / 1024 // KB
    } catch {
      return 0
    }
  }

  private setupMemoryWarnings(): void {
    if ("memory" in performance) {
      setInterval(() => {
        const memory = (performance as any).memory
        const usedMB = memory.usedJSHeapSize / 1024 / 1024
        const limitMB = memory.jsHeapSizeLimit / 1024 / 1024

        if (usedMB > limitMB * 0.8) {
          console.warn(`High memory usage: ${usedMB.toFixed(2)}MB / ${limitMB.toFixed(2)}MB`)
          this.triggerGarbageCollection()
        }
      }, 60000) // Check every minute
    }
  }

  private triggerGarbageCollection(): void {
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
  }

  private checkForIssues(metrics: PerformanceMetrics): void {
    const issues: string[] = []

    // Check memory usage
    if (metrics.memoryUsage > 100) {
      issues.push(`High memory usage: ${metrics.memoryUsage.toFixed(2)}MB`)
    }

    // Check render time
    if (metrics.renderTime > 16) {
      // 60fps = 16.67ms per frame
      issues.push(`Slow rendering: ${metrics.renderTime.toFixed(2)}ms`)
    }

    // Check storage size
    if (metrics.localStorageSize > 5000) {
      // 5MB
      issues.push(`Large localStorage: ${(metrics.localStorageSize / 1024).toFixed(2)}MB`)
    }

    // Check for memory leaks (increasing memory over time)
    if (this.metrics.length >= 5) {
      const recent = this.metrics.slice(-5)
      const memoryTrend = recent[recent.length - 1].memoryUsage - recent[0].memoryUsage

      if (memoryTrend > 20) {
        // 20MB increase
        issues.push(`Potential memory leak: +${memoryTrend.toFixed(2)}MB over 5 samples`)
      }
    }

    if (issues.length > 0) {
      console.warn("Performance issues detected:", issues)
    }
  }

  private notifyObservers(metrics: PerformanceMetrics): void {
    this.observers.forEach((observer) => {
      try {
        observer(metrics)
      } catch (error) {
        console.error("Error notifying performance observer:", error)
      }
    })
  }

  // Public methods
  markRenderStart(): void {
    this.renderStartTime = performance.now()
    performance.mark("render-start")
  }

  markRenderEnd(): void {
    if (this.renderStartTime > 0) {
      performance.mark("render-end")
      performance.measure("render-time", "render-start", "render-end")
      this.componentRenderCount++
    }
  }

  subscribe(observer: (metrics: PerformanceMetrics) => void): () => void {
    this.observers.add(observer)

    // Send latest metrics immediately
    if (this.metrics.length > 0) {
      observer(this.metrics[this.metrics.length - 1])
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
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
    }
    this.observers.clear()
    this.metrics = []
  }
}
