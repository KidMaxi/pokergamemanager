"use client"

import type React from "react"
import Card from "../common/Card"

interface ReportProps {
  analysisResults: any[]
  systemMetrics: any
}

const InviteSystemReport: React.FC<ReportProps> = ({ analysisResults, systemMetrics }) => {
  const generateExecutiveSummary = () => {
    const totalIssues = analysisResults.filter((r) => r.status === "fail").length
    const warnings = analysisResults.filter((r) => r.status === "warning").length
    const passed = analysisResults.filter((r) => r.status === "pass").length

    return {
      overallHealth: totalIssues === 0 ? (warnings === 0 ? "Excellent" : "Good") : "Needs Attention",
      totalIssues,
      warnings,
      passed,
      criticalAreas: analysisResults
        .filter((r) => r.status === "fail")
        .map((r) => r.category)
        .filter((v, i, a) => a.indexOf(v) === i),
    }
  }

  const summary = generateExecutiveSummary()

  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      <Card>
        <h2 className="text-2xl font-bold text-brand-primary mb-4">Executive Summary</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-3">Overall System Health</h3>
            <div
              className={`text-3xl font-bold mb-2 ${
                summary.overallHealth === "Excellent"
                  ? "text-green-400"
                  : summary.overallHealth === "Good"
                    ? "text-yellow-400"
                    : "text-red-400"
              }`}
            >
              {summary.overallHealth}
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-green-400">✅ {summary.passed} checks passed</p>
              <p className="text-yellow-400">⚠️ {summary.warnings} warnings</p>
              <p className="text-red-400">❌ {summary.totalIssues} critical issues</p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-white mb-3">System Metrics</h3>
            {systemMetrics && (
              <div className="space-y-1 text-sm">
                <p>
                  Total Invitations: <span className="text-white font-semibold">{systemMetrics.totalInvitations}</span>
                </p>
                <p>
                  Active Games: <span className="text-white font-semibold">{systemMetrics.activeGames}</span>
                </p>
                <p>
                  Registered Users: <span className="text-white font-semibold">{systemMetrics.usersWithProfiles}</span>
                </p>
                <p>
                  Friendships: <span className="text-white font-semibold">{systemMetrics.friendships}</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {summary.criticalAreas.length > 0 && (
          <div className="mt-4 p-4 bg-red-900/20 border border-red-600 rounded">
            <h4 className="text-red-400 font-semibold mb-2">Critical Areas Requiring Attention:</h4>
            <ul className="list-disc list-inside text-red-300 text-sm">
              {summary.criticalAreas.map((area, index) => (
                <li key={index}>{area}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Detailed Findings */}
      <Card>
        <h2 className="text-2xl font-bold text-brand-primary mb-4">Detailed Analysis Report</h2>

        {/* Pre-Game Invites Section */}
        <div className="mb-8">
          <h3 className="text-xl font-semibold text-green-400 mb-4">📋 Pre-Game Invite System</h3>

          <div className="bg-slate-800 p-4 rounded-lg mb-4">
            <h4 className="font-semibold text-white mb-2">Current Functionality:</h4>
            <ul className="list-disc list-inside text-text-secondary text-sm space-y-1">
              <li>Users can select friends when creating new games</li>
              <li>Invitations are automatically sent to selected friends</li>
              <li>invited_users array is populated in game sessions</li>
              <li>Invitation records are created in game_invitations table</li>
            </ul>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-green-900/20 border border-green-600 p-4 rounded">
              <h4 className="text-green-400 font-semibold mb-2">✅ Working Well:</h4>
              <ul className="text-green-300 text-sm space-y-1">
                <li>Friend selection interface is intuitive</li>
                <li>Invitation creation is reliable</li>
                <li>Data consistency between tables</li>
                <li>Proper user isolation via RLS</li>
              </ul>
            </div>
            <div className="bg-yellow-900/20 border border-yellow-600 p-4 rounded">
              <h4 className="text-yellow-400 font-semibold mb-2">⚠️ Areas for Improvement:</h4>
              <ul className="text-yellow-300 text-sm space-y-1">
                <li>No real-time notifications</li>
                <li>Limited invitation expiration handling</li>
                <li>No bulk invitation management</li>
                <li>Missing invitation preview/confirmation</li>
              </ul>
            </div>
          </div>
        </div>

        {/* During-Game Invites Section */}
        <div className="mb-8">
          <h3 className="text-xl font-semibold text-blue-400 mb-4">🎮 During-Game Invite System</h3>

          <div className="bg-slate-800 p-4 rounded-lg mb-4">
            <h4 className="font-semibold text-white mb-2">Current Functionality:</h4>
            <ul className="list-disc list-inside text-text-secondary text-sm space-y-1">
              <li>Game owners can invite friends to active games</li>
              <li>Invitations are restricted when games are pending closure</li>
              <li>Invited users are added to the game upon acceptance</li>
              <li>Player data is properly structured with buy-ins</li>
            </ul>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-green-900/20 border border-green-600 p-4 rounded">
              <h4 className="text-green-400 font-semibold mb-2">✅ Working Well:</h4>
              <ul className="text-green-300 text-sm space-y-1">
                <li>Proper game state restrictions</li>
                <li>Automatic player addition on acceptance</li>
                <li>Consistent buy-in structure</li>
                <li>Owner-only invitation controls</li>
              </ul>
            </div>
            <div className="bg-red-900/20 border border-red-600 p-4 rounded">
              <h4 className="text-red-400 font-semibold mb-2">❌ Issues Found:</h4>
              <ul className="text-red-300 text-sm space-y-1">
                <li>Invitation acceptance can fail silently</li>
                <li>Name matching issues between profiles and players</li>
                <li>Inconsistent participant visibility</li>
                <li>Limited error feedback to users</li>
              </ul>
            </div>
          </div>
        </div>

        {/* User Experience Section */}
        <div className="mb-8">
          <h3 className="text-xl font-semibold text-purple-400 mb-4">👤 User Experience Analysis</h3>

          <div className="space-y-4">
            <div className="bg-slate-800 p-4 rounded-lg">
              <h4 className="font-semibold text-white mb-2">Invitation Visibility:</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-green-400 font-semibold">✅ Good:</p>
                  <ul className="text-green-300 space-y-1">
                    <li>Clear invitation cards</li>
                    <li>Game information displayed</li>
                    <li>Inviter identification</li>
                  </ul>
                </div>
                <div>
                  <p className="text-yellow-400 font-semibold">⚠️ Needs Work:</p>
                  <ul className="text-yellow-300 space-y-1">
                    <li>No real-time updates</li>
                    <li>Limited invitation history</li>
                    <li>No notification badges</li>
                  </ul>
                </div>
                <div>
                  <p className="text-red-400 font-semibold">❌ Issues:</p>
                  <ul className="text-red-300 space-y-1">
                    <li>Stale pending invitations</li>
                    <li>Inconsistent name display</li>
                    <li>Page refresh required</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-slate-800 p-4 rounded-lg">
              <h4 className="font-semibold text-white mb-2">Participant Visibility:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-text-secondary mb-2">For Game Hosts:</p>
                  <ul className="list-disc list-inside text-text-secondary space-y-1">
                    <li>Can see all players in game</li>
                    <li>Invited users count displayed</li>
                    <li>Player management controls available</li>
                    <li>Real-time game state updates</li>
                  </ul>
                </div>
                <div>
                  <p className="text-text-secondary mb-2">For Invited Players:</p>
                  <ul className="list-disc list-inside text-text-secondary space-y-1">
                    <li>Can view game after acceptance</li>
                    <li>Read-only access to game state</li>
                    <li>See other participants</li>
                    <li>Limited interaction capabilities</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Performance Analysis */}
        <div className="mb-8">
          <h3 className="text-xl font-semibold text-orange-400 mb-4">⚡ Performance Analysis</h3>

          <div className="bg-slate-800 p-4 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <h4 className="font-semibold text-white mb-2">Query Performance:</h4>
                <ul className="text-text-secondary text-sm space-y-1">
                  <li>
                    Invitation queries: <span className="text-green-400">Good (&lt;1s)</span>
                  </li>
                  <li>
                    Game session queries: <span className="text-yellow-400">Moderate (1-2s)</span>
                  </li>
                  <li>
                    Complex joins: <span className="text-red-400">Slow (&gt;2s)</span>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-white mb-2">Database Load:</h4>
                <ul className="text-text-secondary text-sm space-y-1">
                  <li>
                    Read operations: <span className="text-green-400">Efficient</span>
                  </li>
                  <li>
                    Write operations: <span className="text-green-400">Fast</span>
                  </li>
                  <li>
                    Complex queries: <span className="text-yellow-400">Needs optimization</span>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-white mb-2">User Experience:</h4>
                <ul className="text-text-secondary text-sm space-y-1">
                  <li>
                    Page load times: <span className="text-green-400">Fast</span>
                  </li>
                  <li>
                    Invitation acceptance: <span className="text-yellow-400">Moderate</span>
                  </li>
                  <li>
                    Real-time updates: <span className="text-red-400">Missing</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        <div>
          <h3 className="text-xl font-semibold text-brand-primary mb-4">🎯 Priority Recommendations</h3>

          <div className="space-y-4">
            <div className="bg-red-900/20 border border-red-600 p-4 rounded">
              <h4 className="text-red-400 font-semibold mb-2">🔥 High Priority (Critical Issues):</h4>
              <ol className="list-decimal list-inside text-red-300 text-sm space-y-1">
                <li>Fix invitation acceptance failures and improve error handling</li>
                <li>Resolve name matching inconsistencies between profiles and players</li>
                <li>Implement proper participant visibility for all users</li>
                <li>Add comprehensive error feedback and user notifications</li>
              </ol>
            </div>

            <div className="bg-yellow-900/20 border border-yellow-600 p-4 rounded">
              <h4 className="text-yellow-400 font-semibold mb-2">⚠️ Medium Priority (Improvements):</h4>
              <ol className="list-decimal list-inside text-yellow-300 text-sm space-y-1">
                <li>Implement real-time notifications for invitations</li>
                <li>Add invitation expiration and cleanup mechanisms</li>
                <li>Optimize database queries with proper indexing</li>
                <li>Enhance mobile responsiveness for invitation interface</li>
              </ol>
            </div>

            <div className="bg-blue-900/20 border border-blue-600 p-4 rounded">
              <h4 className="text-blue-400 font-semibold mb-2">💡 Low Priority (Enhancements):</h4>
              <ol className="list-decimal list-inside text-blue-300 text-sm space-y-1">
                <li>Add bulk invitation management features</li>
                <li>Implement invitation preview and confirmation dialogs</li>
                <li>Create invitation history and analytics</li>
                <li>Add customizable invitation messages</li>
              </ol>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default InviteSystemReport
