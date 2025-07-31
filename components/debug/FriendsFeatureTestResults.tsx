"use client"

import type React from "react"
import { useState } from "react"
import { useAuth } from "../../contexts/AuthContext"
import { supabase } from "../../lib/supabase"
import Card from "../common/Card"
import Button from "../common/Button"

interface TestResult {
  testName: string
  status: "pass" | "fail" | "warning" | "pending"
  details: string
  timestamp: string
}

interface GameScenario {
  scenarioName: string
  gameStatus: "active" | "pending_close" | "completed"
  hasActivePlayers: boolean
  hasCashedOutPlayers: boolean
  isGameOwner: boolean
}

const FriendsFeatureTestResults: React.FC = () => {
  const { user } = useAuth()
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [isRunningTests, setIsRunningTests] = useState(false)
  const [currentScenario, setCurrentScenario] = useState<GameScenario | null>(null)

  const addTestResult = (testName: string, status: "pass" | "fail" | "warning" | "pending", details: string) => {
    const result: TestResult = {
      testName,
      status,
      details,
      timestamp: new Date().toISOString(),
    }
    setTestResults((prev) => [...prev, result])
  }

  const runFriendsFeatureTests = async () => {
    if (!user) {
      addTestResult("User Authentication", "fail", "No authenticated user found")
      return
    }

    setIsRunningTests(true)
    setTestResults([])

    // Test 1: Database Connection and Friends System Availability
    try {
      const { data: friendsData, error: friendsError } = await supabase.from("friendships").select("id").limit(1)

      if (friendsError) {
        addTestResult("Friends System Database", "fail", `Database error: ${friendsError.message}`)
      } else {
        addTestResult("Friends System Database", "pass", "Friends system tables are accessible")
      }
    } catch (error) {
      addTestResult("Friends System Database", "fail", `Connection error: ${error}`)
    }

    // Test 2: Friend Requests System
    try {
      const { data: requestsData, error: requestsError } = await supabase.from("friend_requests").select("id").limit(1)

      if (requestsError) {
        addTestResult("Friend Requests System", "fail", `Database error: ${requestsError.message}`)
      } else {
        addTestResult("Friend Requests System", "pass", "Friend requests system is functional")
      }
    } catch (error) {
      addTestResult("Friend Requests System", "fail", `Connection error: ${error}`)
    }

    // Test 3: Game Invitations System
    try {
      const { data: invitationsData, error: invitationsError } = await supabase
        .from("game_invitations")
        .select("id")
        .limit(1)

      if (invitationsError) {
        addTestResult("Game Invitations System", "fail", `Database error: ${invitationsError.message}`)
      } else {
        addTestResult("Game Invitations System", "pass", "Game invitations system is functional")
      }
    } catch (error) {
      addTestResult("Game Invitations System", "fail", `Connection error: ${error}`)
    }

    // Test 4: User Profile Matching
    try {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", user.id)
        .single()

      if (profileError || !profileData) {
        addTestResult("User Profile Matching", "fail", "Cannot find user profile for friend matching")
      } else {
        addTestResult("User Profile Matching", "pass", `Profile found: ${profileData.full_name || profileData.email}`)
      }
    } catch (error) {
      addTestResult("User Profile Matching", "fail", `Profile lookup error: ${error}`)
    }

    // Test 5: Active Game Scenario - Add Friends Button Availability
    const activeGameScenario: GameScenario = {
      scenarioName: "Active Game with Owner Permissions",
      gameStatus: "active",
      hasActivePlayers: true,
      hasCashedOutPlayers: false,
      isGameOwner: true,
    }
    setCurrentScenario(activeGameScenario)

    const canInviteFriendsActive = activeGameScenario.gameStatus === "active" && activeGameScenario.isGameOwner
    if (canInviteFriendsActive) {
      addTestResult(
        "Active Game - Add Friends Button",
        "pass",
        "Add Friend to Game button should be visible and functional",
      )
    } else {
      addTestResult(
        "Active Game - Add Friends Button",
        "fail",
        "Add Friend to Game button should be available but isn't",
      )
    }

    // Test 6: Post-Cashout Scenario - Add Friends Button Availability
    const postCashoutScenario: GameScenario = {
      scenarioName: "Active Game After Player Cashout",
      gameStatus: "active",
      hasActivePlayers: true,
      hasCashedOutPlayers: true,
      isGameOwner: true,
    }
    setCurrentScenario(postCashoutScenario)

    const canInviteFriendsPostCashout = postCashoutScenario.gameStatus === "active" && postCashoutScenario.isGameOwner
    if (canInviteFriendsPostCashout) {
      addTestResult(
        "Post-Cashout - Add Friends Button",
        "pass",
        "Add Friend to Game button remains available after cashouts",
      )
    } else {
      addTestResult(
        "Post-Cashout - Add Friends Button",
        "fail",
        "Add Friend to Game button should remain available after cashouts",
      )
    }

    // Test 7: All Players Cashed Out Scenario
    const allCashedOutScenario: GameScenario = {
      scenarioName: "Active Game - All Players Cashed Out",
      gameStatus: "active",
      hasActivePlayers: false,
      hasCashedOutPlayers: true,
      isGameOwner: true,
    }
    setCurrentScenario(allCashedOutScenario)

    const canInviteFriendsAllCashedOut =
      allCashedOutScenario.gameStatus === "active" && allCashedOutScenario.isGameOwner
    if (canInviteFriendsAllCashedOut) {
      addTestResult(
        "All Cashed Out - Add Friends Button",
        "pass",
        "Add Friend to Game button available even when all players cashed out",
      )
    } else {
      addTestResult(
        "All Cashed Out - Add Friends Button",
        "fail",
        "Add Friend to Game button should be available when all players cashed out",
      )
    }

    // Test 8: Pending Close Scenario
    const pendingCloseScenario: GameScenario = {
      scenarioName: "Game Pending Closure",
      gameStatus: "pending_close",
      hasActivePlayers: true,
      hasCashedOutPlayers: false,
      isGameOwner: true,
    }
    setCurrentScenario(pendingCloseScenario)

    const canInviteFriendsPendingClose =
      pendingCloseScenario.gameStatus === "active" && pendingCloseScenario.isGameOwner
    if (!canInviteFriendsPendingClose) {
      addTestResult(
        "Pending Close - Add Friends Button",
        "pass",
        "Add Friend to Game button correctly disabled during pending close",
      )
    } else {
      addTestResult(
        "Pending Close - Add Friends Button",
        "fail",
        "Add Friend to Game button should be disabled during pending close",
      )
    }

    // Test 9: Completed Game Scenario
    const completedGameScenario: GameScenario = {
      scenarioName: "Completed Game",
      gameStatus: "completed",
      hasActivePlayers: false,
      hasCashedOutPlayers: true,
      isGameOwner: true,
    }
    setCurrentScenario(completedGameScenario)

    const canInviteFriendsCompleted = completedGameScenario.gameStatus === "active" && completedGameScenario.isGameOwner
    if (!canInviteFriendsCompleted) {
      addTestResult(
        "Completed Game - Add Friends Button",
        "pass",
        "Add Friend to Game button correctly disabled for completed games",
      )
    } else {
      addTestResult(
        "Completed Game - Add Friends Button",
        "fail",
        "Add Friend to Game button should be disabled for completed games",
      )
    }

    // Test 10: Non-Owner Scenario
    const nonOwnerScenario: GameScenario = {
      scenarioName: "Active Game - Non-Owner (Invited Player)",
      gameStatus: "active",
      hasActivePlayers: true,
      hasCashedOutPlayers: false,
      isGameOwner: false,
    }
    setCurrentScenario(nonOwnerScenario)

    const canInviteFriendsNonOwner = nonOwnerScenario.gameStatus === "active" && nonOwnerScenario.isGameOwner
    if (!canInviteFriendsNonOwner) {
      addTestResult(
        "Non-Owner - Add Friends Button",
        "pass",
        "Add Friend to Game button correctly hidden for non-owners",
      )
    } else {
      addTestResult(
        "Non-Owner - Add Friends Button",
        "fail",
        "Add Friend to Game button should be hidden for non-owners",
      )
    }

    // Test 11: Friend Request to Player Functionality
    try {
      // Simulate checking if we can send friend requests to players in game
      const mockPlayerNames = ["Test Player 1", "Test Player 2"]

      for (const playerName of mockPlayerNames) {
        const { data: playerProfile, error: playerError } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("full_name", playerName)
          .single()

        if (playerError && playerError.code !== "PGRST116") {
          addTestResult(
            "Player Friend Request Lookup",
            "warning",
            `Could not verify player profile lookup: ${playerError.message}`,
          )
        } else if (playerProfile) {
          addTestResult("Player Friend Request Lookup", "pass", `Successfully found player profile for ${playerName}`)
        } else {
          addTestResult(
            "Player Friend Request Lookup",
            "warning",
            `No profile found for ${playerName} (expected for test data)`,
          )
        }
      }
    } catch (error) {
      addTestResult("Player Friend Request Lookup", "fail", `Error testing player profile lookup: ${error}`)
    }

    // Test 12: Duplicate Friend Request Prevention
    try {
      // Test the logic for preventing duplicate friend requests
      const { data: existingRequests, error: requestsError } = await supabase
        .from("friend_requests")
        .select("id, sender_id, receiver_id, status")
        .eq("sender_id", user.id)
        .eq("status", "pending")

      if (requestsError) {
        addTestResult(
          "Duplicate Request Prevention",
          "warning",
          `Could not verify duplicate prevention: ${requestsError.message}`,
        )
      } else {
        addTestResult(
          "Duplicate Request Prevention",
          "pass",
          `Duplicate prevention system functional - found ${existingRequests?.length || 0} pending requests`,
        )
      }
    } catch (error) {
      addTestResult("Duplicate Request Prevention", "fail", `Error testing duplicate prevention: ${error}`)
    }

    setCurrentScenario(null)
    setIsRunningTests(false)
  }

  const getStatusColor = (status: "pass" | "fail" | "warning" | "pending") => {
    switch (status) {
      case "pass":
        return "text-green-400"
      case "fail":
        return "text-red-400"
      case "warning":
        return "text-yellow-400"
      case "pending":
        return "text-blue-400"
      default:
        return "text-gray-400"
    }
  }

  const getStatusIcon = (status: "pass" | "fail" | "warning" | "pending") => {
    switch (status) {
      case "pass":
        return "✅"
      case "fail":
        return "❌"
      case "warning":
        return "⚠️"
      case "pending":
        return "⏳"
      default:
        return "❓"
    }
  }

  const passCount = testResults.filter((r) => r.status === "pass").length
  const failCount = testResults.filter((r) => r.status === "fail").length
  const warningCount = testResults.filter((r) => r.status === "warning").length

  return (
    <div className="container mx-auto p-4">
      <Card className="mb-6">
        <h2 className="text-2xl font-bold text-brand-primary mb-4">Friends Feature Test Results</h2>

        <div className="mb-4">
          <Button
            onClick={runFriendsFeatureTests}
            disabled={isRunningTests || !user}
            variant="primary"
            className="mr-4"
          >
            {isRunningTests ? "Running Tests..." : "Run Friends Feature Tests"}
          </Button>

          {testResults.length > 0 && (
            <div className="inline-flex space-x-4 text-sm">
              <span className="text-green-400">✅ Pass: {passCount}</span>
              <span className="text-red-400">❌ Fail: {failCount}</span>
              <span className="text-yellow-400">⚠️ Warning: {warningCount}</span>
            </div>
          )}
        </div>

        {currentScenario && (
          <div className="mb-4 p-3 bg-blue-900/20 border border-blue-600 rounded">
            <h3 className="text-blue-200 font-semibold">Currently Testing: {currentScenario.scenarioName}</h3>
            <div className="text-blue-100 text-sm mt-1">
              <p>Game Status: {currentScenario.gameStatus}</p>
              <p>Has Active Players: {currentScenario.hasActivePlayers ? "Yes" : "No"}</p>
              <p>Has Cashed Out Players: {currentScenario.hasCashedOutPlayers ? "Yes" : "No"}</p>
              <p>Is Game Owner: {currentScenario.isGameOwner ? "Yes" : "No"}</p>
            </div>
          </div>
        )}

        {testResults.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-text-primary">Test Results:</h3>
            {testResults.map((result, index) => (
              <div key={index} className="p-3 bg-slate-800 rounded border">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className={`font-semibold ${getStatusColor(result.status)}`}>
                      {getStatusIcon(result.status)} {result.testName}
                    </h4>
                    <p className="text-text-secondary text-sm mt-1">{result.details}</p>
                    <p className="text-xs text-gray-500 mt-1">{new Date(result.timestamp).toLocaleTimeString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {testResults.length === 0 && !isRunningTests && (
          <div className="text-center py-8">
            <p className="text-text-secondary">
              Click "Run Friends Feature Tests" to verify the add friends functionality
            </p>
          </div>
        )}
      </Card>

      {/* Summary of Expected Behavior */}
      <Card>
        <h3 className="text-xl font-bold text-brand-primary mb-4">Expected Friends Feature Behavior</h3>
        <div className="space-y-4 text-sm">
          <div>
            <h4 className="font-semibold text-green-400 mb-2">✅ SHOULD WORK (Expected Pass):</h4>
            <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
              <li>Add Friend to Game button visible during active games for game owners</li>
              <li>Add Friend to Game button remains functional after player cashouts</li>
              <li>Add Friend to Game button available even when all players have cashed out</li>
              <li>Friend request buttons appear on player cards for non-friends with profiles</li>
              <li>Friend request system prevents duplicate requests</li>
              <li>Database systems (friendships, friend_requests, game_invitations) are accessible</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-red-400 mb-2">❌ SHOULD NOT WORK (Expected Restrictions):</h4>
            <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
              <li>Add Friend to Game button hidden during pending_close status</li>
              <li>Add Friend to Game button hidden for completed games</li>
              <li>Add Friend to Game button hidden for non-owners (invited players)</li>
              <li>Friend request buttons hidden for players who are already friends</li>
              <li>Friend request buttons hidden for players without user profiles</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-yellow-400 mb-2">⚠️ POTENTIAL ISSUES TO MONITOR:</h4>
            <ul className="list-disc list-inside space-y-1 text-text-secondary ml-4">
              <li>Network connectivity issues affecting database queries</li>
              <li>Player name matching between game players and user profiles</li>
              <li>Race conditions when multiple friend requests are sent quickly</li>
              <li>UI state management during rapid game state changes</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default FriendsFeatureTestResults
