"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useAuth } from "../../contexts/AuthContext"
import {
  runDatabaseDiagnostics,
  type DatabaseHealthReport,
  type DiagnosticResult,
  type PerformanceMetric,
} from "../../utils/databaseDiagnostics"
import Button from "../common/Button"
import Card from "../common/Card"
import { formatDate } from "../../utils"

interface DiagnosticResultCardProps {
  result: DiagnosticResult
}

const DiagnosticResultCard: React.FC<DiagnosticResultCardProps> = ({ result }) => {
  const getStatusColor = (status: DiagnosticResult["status"]) => {
    switch (status) {
      case "PASS":
        return "text-green-400"
      case "WARNING":
        return "text-yellow-400"
      case "ERROR":
        return "text-red-400"
      case "INFO":
        return "text-blue-400"
      default:
        return "text-text-secondary"
    }
  }

  const getSeverityBadge = (severity: DiagnosticResult["severity"]) => {
    const baseClasses = "px-2 py-1 rounded text-xs font-semibold"
    switch (severity) {
      case "ERROR":
        return `${baseClasses} bg-red-900/20 text-red-400 border border-red-800`
      case "WARNING":
        return `${baseClasses} bg-yellow-900/20 text-yellow-400 border border-yellow-800`
      case "INFO":
        return `${baseClasses} bg-blue-900/20 text-blue-400 border border-blue-800`
      default:
        return `${baseClasses} bg-gray-900/20 text-gray-400 border border-gray-800`
    }
  }

  return (
    <div className="border border-border-default rounded-lg p-4 mb-3">
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-semibold text-text-primary">{result.testName}</h4>
        <div className="flex items-center space-x-2">
          <span className={getSeverityBadge(result.severity)}>{result.severity}</span>
          <span className={`font-semibold ${getStatusColor(result.status)}`}>{result.status}</span>
        </div>
      </div>
      {result.details && <p className="text-text-secondary text-sm mb-2">{result.details}</p>}
      <p className="text-xs text-text-secondary">{formatDate(result.timestamp)}</p>
    </div>
  )
}

interface PerformanceMetricCardProps {
  metric: PerformanceMetric
}

const PerformanceMetricCard: React.FC<PerformanceMetricCardProps> = ({ metric }) => {
  const getPerformanceColor = (timeMs: number) => {
    if (timeMs < 100) return "text-green-400"
    if (timeMs < 500) return "text-yellow-400"
    return "text-red-400"
  }

  return (
    <div className="border border-border-default rounded-lg p-4 mb-3">
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-semibold text-text-primary">{metric.testName}</h4>
        <span className={`font-bold ${getPerformanceColor(metric.executionTimeMs)}`}>
          {metric.executionTimeMs.toFixed(2)}ms
        </span>
      </div>
      {metric.rowsAffected && (
        <p className="text-text-secondary text-sm mb-2">Rows processed: {metric.rowsAffected.toLocaleString()}</p>
      )}
      <p className="text-xs text-text-secondary">{formatDate(metric.timestamp)}</p>
    </div>
  )
}

const DatabaseDiagnosticsPanel: React.FC = () => {
  const { user, profile } = useAuth()
  const [report, setReport] = useState<DatabaseHealthReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [lastRunTime, setLastRunTime] = useState<string | null>(null)

  // Check if user is admin
  const isAdmin = profile?.is_admin === true

  useEffect(() => {
    // Load last run time from localStorage
    const savedTime = localStorage.getItem("last-diagnostic-run")
    if (savedTime) {
      setLastRunTime(savedTime)
    }
  }, [])

  const runDiagnostics = async () => {
    if (!isAdmin) {
      setError("Admin access required to run diagnostics")
      return
    }

    setLoading(true)
    setError("")

    try {
      console.log("Starting database diagnostics...")
      const diagnosticReport = await runDatabaseDiagnostics()
      setReport(diagnosticReport)

      const currentTime = new Date().toISOString()
      setLastRunTime(currentTime)
      localStorage.setItem("last-diagnostic-run", currentTime)

      console.log("Database diagnostics completed:", diagnosticReport)
    } catch (err: any) {
      console.error("Diagnostic error:", err)
      setError(`Failed to run diagnostics: ${err.message || err}`)
    } finally {
      setLoading(false)
    }
  }

  const getOverallStatusColor = (status: DatabaseHealthReport["overallStatus"]) => {
    switch (status) {
      case "HEALTHY":
        return "text-green-400"
      case "WARNING":
        return "text-yellow-400"
      case "CRITICAL":
        return "text-red-400"
      default:
        return "text-text-secondary"
    }
  }

  const getOverallStatusBadge = (status: DatabaseHealthReport["overallStatus"]) => {
    const baseClasses = "px-3 py-1 rounded-full text-sm font-semibold"
    switch (status) {
      case "HEALTHY":
        return `${baseClasses} bg-green-900/20 text-green-400 border border-green-800`
      case "WARNING":
        return `${baseClasses} bg-yellow-900/20 text-yellow-400 border border-yellow-800`
      case "CRITICAL":
        return `${baseClasses} bg-red-900/20 text-red-400 border border-red-800`
      default:
        return `${baseClasses} bg-gray-900/20 text-gray-400 border border-gray-800`
    }
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="text-center py-8">
          <h2 className="text-2xl font-bold text-text-primary mb-4">Access Denied</h2>
          <p className="text-text-secondary">Administrator privileges are required to access database diagnostics.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">Database Diagnostics</h1>
            <p className="text-text-secondary mt-2">
              Comprehensive analysis of database health, performance, and integrity
            </p>
            {lastRunTime && <p className="text-xs text-text-secondary mt-1">Last run: {formatDate(lastRunTime)}</p>}
          </div>
          <Button onClick={runDiagnostics} disabled={loading} variant="primary" className="flex items-center space-x-2">
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Running...</span>
              </>
            ) : (
              <>
                <span>🔍</span>
                <span>Run Diagnostics</span>
              </>
            )}
          </Button>
        </div>

        {/* Error Display */}
        {error && (
          <Card className="mb-6 bg-red-900/20 border border-red-800">
            <div className="flex items-center space-x-2">
              <span className="text-red-400">⚠️</span>
              <p className="text-red-400">{error}</p>
            </div>
          </Card>
        )}

        {/* Loading State */}
        {loading && (
          <Card className="mb-6">
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary mx-auto mb-4"></div>
              <p className="text-text-secondary">Running comprehensive database diagnostics...</p>
              <p className="text-xs text-text-secondary mt-2">This may take a few moments to complete</p>
            </div>
          </Card>
        )}

        {/* Report Display */}
        {report && !loading && (
          <>
            {/* Overall Status */}
            <Card className="mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-text-primary">Overall Database Health</h2>
                <span className={getOverallStatusBadge(report.overallStatus)}>{report.overallStatus}</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-text-primary">{report.summary.totalTests}</div>
                  <div className="text-sm text-text-secondary">Total Tests</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">{report.summary.passedTests}</div>
                  <div className="text-sm text-text-secondary">Passed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-400">{report.summary.warningTests}</div>
                  <div className="text-sm text-text-secondary">Warnings</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-400">{report.summary.errorTests}</div>
                  <div className="text-sm text-text-secondary">Errors</div>
                </div>
              </div>

              {/* Recommendations */}
              {report.recommendations.length > 0 && (
                <div className="border-t border-border-default pt-4">
                  <h3 className="font-semibold text-text-primary mb-2">Recommendations</h3>
                  <ul className="space-y-1">
                    {report.recommendations.map((rec, index) => (
                      <li key={index} className="text-sm text-text-secondary flex items-start space-x-2">
                        <span className="text-brand-primary mt-1">•</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            {/* Diagnostic Results */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card>
                <h2 className="text-xl font-bold text-text-primary mb-4">Diagnostic Results</h2>
                <div className="max-h-96 overflow-y-auto">
                  {report.diagnosticResults
                    .sort((a, b) => {
                      const severityOrder = { ERROR: 0, WARNING: 1, INFO: 2, PASS: 3 }
                      return severityOrder[a.severity] - severityOrder[b.severity]
                    })
                    .map((result, index) => (
                      <DiagnosticResultCard key={index} result={result} />
                    ))}
                </div>
              </Card>

              <Card>
                <h2 className="text-xl font-bold text-text-primary mb-4">Performance Metrics</h2>
                <div className="max-h-96 overflow-y-auto">
                  {report.performanceMetrics
                    .sort((a, b) => b.executionTimeMs - a.executionTimeMs)
                    .map((metric, index) => (
                      <PerformanceMetricCard key={index} metric={metric} />
                    ))}
                </div>
              </Card>
            </div>

            {/* Performance Summary */}
            <Card>
              <h2 className="text-xl font-bold text-text-primary mb-4">Performance Summary</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 border border-border-default rounded-lg">
                  <div className="text-lg font-bold text-green-400">
                    {report.performanceMetrics.filter((m) => m.executionTimeMs < 100).length}
                  </div>
                  <div className="text-sm text-text-secondary">Fast Queries (&lt;100ms)</div>
                </div>
                <div className="text-center p-4 border border-border-default rounded-lg">
                  <div className="text-lg font-bold text-yellow-400">
                    {
                      report.performanceMetrics.filter((m) => m.executionTimeMs >= 100 && m.executionTimeMs < 500)
                        .length
                    }
                  </div>
                  <div className="text-sm text-text-secondary">Moderate Queries (100-500ms)</div>
                </div>
                <div className="text-center p-4 border border-border-default rounded-lg">
                  <div className="text-lg font-bold text-red-400">
                    {report.performanceMetrics.filter((m) => m.executionTimeMs >= 500).length}
                  </div>
                  <div className="text-sm text-text-secondary">Slow Queries (&gt;500ms)</div>
                </div>
              </div>

              {report.performanceMetrics.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border-default">
                  <div className="flex justify-between text-sm">
                    <span className="text-text-secondary">Average Query Time:</span>
                    <span className="text-text-primary font-semibold">
                      {(
                        report.performanceMetrics.reduce((sum, m) => sum + m.executionTimeMs, 0) /
                        report.performanceMetrics.length
                      ).toFixed(2)}
                      ms
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-text-secondary">Slowest Query:</span>
                    <span className="text-text-primary font-semibold">
                      {Math.max(...report.performanceMetrics.map((m) => m.executionTimeMs)).toFixed(2)}ms
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-text-secondary">Fastest Query:</span>
                    <span className="text-text-primary font-semibold">
                      {Math.min(...report.performanceMetrics.map((m) => m.executionTimeMs)).toFixed(2)}ms
                    </span>
                  </div>
                </div>
              )}
            </Card>
          </>
        )}

        {/* Instructions */}
        {!report && !loading && (
          <Card>
            <h2 className="text-xl font-bold text-text-primary mb-4">Database Diagnostic Instructions</h2>
            <div className="space-y-4 text-text-secondary">
              <p>
                The database diagnostic tool performs a comprehensive analysis of your poker game database to ensure
                optimal performance and data integrity.
              </p>

              <div>
                <h3 className="font-semibold text-text-primary mb-2">What it checks:</h3>
                <ul className="space-y-1 ml-4">
                  <li>• Data integrity across all tables</li>
                  <li>• Database performance and query execution times</li>
                  <li>• Relationship validation between tables</li>
                  <li>• Concurrent access capabilities</li>
                  <li>• Index effectiveness and usage</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-text-primary mb-2">Status meanings:</h3>
                <ul className="space-y-1 ml-4">
                  <li>
                    • <span className="text-green-400 font-semibold">HEALTHY</span>: Database is operating optimally
                  </li>
                  <li>
                    • <span className="text-yellow-400 font-semibold">WARNING</span>: Minor issues that should be
                    monitored
                  </li>
                  <li>
                    • <span className="text-red-400 font-semibold">CRITICAL</span>: Issues requiring immediate attention
                  </li>
                </ul>
              </div>

              <p className="text-sm">
                Click "Run Diagnostics" to start the analysis. The process typically takes 10-30 seconds to complete.
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

export default DatabaseDiagnosticsPanel
