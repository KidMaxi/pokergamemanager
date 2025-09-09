"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import Button from "./common/Button"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  errorId: string
}

class ErrorBoundary extends Component<Props, State> {
  private retryCount = 0
  private maxRetries = 3

  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: "",
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    return {
      hasError: true,
      error,
      errorId,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[v0] Error Boundary caught an error:", {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorId: this.state.errorId,
      retryCount: this.retryCount,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    })

    this.setState({
      error,
      errorInfo,
    })

    try {
      const keysToCheck = ["poker-cached-friends", "poker-cached-games", "poker-refresh-count", "poker-last-refresh"]

      keysToCheck.forEach((key) => {
        const value = localStorage.getItem(key)
        if (value) {
          try {
            JSON.parse(value)
          } catch {
            console.log(`[v0] Removing corrupted localStorage key: ${key}`)
            localStorage.removeItem(key)
          }
        }
      })
    } catch (storageError) {
      console.error("[v0] Error cleaning localStorage:", storageError)
    }
  }

  handleRetry = () => {
    this.retryCount++
    console.log(`[v0] Error boundary retry attempt ${this.retryCount}/${this.maxRetries}`)

    const delay = Math.min(1000 * Math.pow(2, this.retryCount - 1), 5000)

    setTimeout(() => {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        errorId: "",
      })
    }, delay)
  }

  handleReset = () => {
    console.log("[v0] Performing full application reset")

    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch (error) {
      console.error("[v0] Error clearing storage:", error)
    }

    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      const canRetry = this.retryCount < this.maxRetries
      const isRecurringError = this.retryCount >= 2

      return (
        <div className="min-h-screen flex items-center justify-center bg-surface-main p-4">
          <div className="text-center max-w-lg">
            <div className="text-red-400 text-6xl mb-4">💥</div>
            <h2 className="text-xl font-semibold text-text-primary mb-2">
              {isRecurringError ? "Recurring Application Error" : "Something went wrong"}
            </h2>
            <p className="text-text-secondary mb-4">
              {isRecurringError
                ? "The application has encountered repeated errors. A full reset may be needed."
                : "An unexpected error occurred. We're working to fix it."}
            </p>

            <div className="bg-surface-card border border-border-default rounded-lg p-4 mb-4 text-left">
              <details className="text-sm">
                <summary className="cursor-pointer text-text-secondary hover:text-text-primary">
                  Error Details (ID: {this.state.errorId})
                </summary>
                <div className="mt-2 space-y-2">
                  <p className="text-red-400">
                    <strong>Error:</strong> {this.state.error?.message}
                  </p>
                  <p className="text-text-secondary">
                    <strong>Retry Count:</strong> {this.retryCount}/{this.maxRetries}
                  </p>
                  <p className="text-text-secondary">
                    <strong>Time:</strong> {new Date().toLocaleString()}
                  </p>
                </div>
              </details>
            </div>

            <div className="space-y-3">
              {canRetry && (
                <Button onClick={this.handleRetry} variant="primary" className="w-full">
                  Try Again ({this.maxRetries - this.retryCount} attempts left)
                </Button>
              )}

              <Button
                onClick={this.handleReset}
                variant={isRecurringError ? "primary" : "secondary"}
                className="w-full"
              >
                {isRecurringError ? "Reset Application" : "Full Reset"}
              </Button>

              <Button onClick={() => (window.location.href = "/")} variant="ghost" className="w-full">
                Go to Home
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
