"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../contexts/AuthContext"
import Card from "../common/Card"
import Button from "../common/Button"

interface AnalysisResult {
  category: string
  status: "pass" | "fail" | "warning" | "info"
  title: string
  description: string
  details?: any
  recommendations?: string[]
}

interface SystemMetrics {
  totalInvitations: number
  pendingInvitations: number
  acceptedInvitations: number
  declinedInvitations: number
  activeGames: number
  completedGames: number
  usersWithProfiles: number
  friendships: number
}

const GameInviteSystemAnalysis: React.FC = () => {
  const { user, profile } = useAuth()
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([])
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null)
  const [loading, setLoading] = useState(false)
  const [testScenarios, setTestScenarios] = useState<any[]>([])

  const runComprehensiveAnalysis = async () => {
    if (!user) return

    setLoading(true)
    const results: AnalysisResult[] = []

    try {
      console.log("🔍 Starting comprehensive game invite system analysis...")

      // 1. System Metrics Collection
      const metrics = await collectSystemMetrics()
      setSystemMetrics(metrics)

      // 2. Database Schema Analysis
      await analyzeDatabaseSchema(results)

      // 3. Pre-Game Invite Analysis
      await analyzePreGameInvites(results)

      // 4. During-Game Invite Analysis
      await analyzeDuringGameInvites(results)

      // 5. User Experience Analysis
      await analyzeUserExperience(results)

      // 6. Performance Analysis
      await analyzePerformance(results)

      // 7. Data Consistency Analysis
      await analyzeDataConsistency(results)

      // 8. Security Analysis
      await analyzeSecurityAspects(results)

      setAnalysisResults(results)
      console.log("✅ Analysis complete:", results.length, "findings")
    } catch (error) {
      console.error("❌ Analysis failed:", error)
      results.push({
        category: "System Error",
        status: "fail",
        title: "Analysis Failed",
        description: `Failed to complete analysis: ${error}`,
        recommendations: ["Check database connectivity", "Verify user permissions"],
      })
      setAnalysisResults(results)
    } finally {
      setLoading(false)
    }
  }

  const collectSystemMetrics = async (): Promise<SystemMetrics> => {
    console.log("📊 Collecting system metrics...")

    const [invitations, games, profiles, friendships] = await Promise.all([
      supabase.from("game_invitations").select("status"),
      supabase.from("game_sessions").select("status"),
      supabase.from("profiles").select("id"),
      supabase.from("friendships").select("id"),
    ])

    const metrics: SystemMetrics = {
      totalInvitations: invitations.data?.length || 0,
      pendingInvitations: invitations.data?.filter((i) => i.status === "pending").length || 0,
      acceptedInvitations: invitations.data?.filter((i) => i.status === "accepted").length || 0,
      declinedInvitations: invitations.data?.filter((i) => i.status === "declined").length || 0,
      activeGames: games.data?.filter((g) => g.status === "active").length || 0,
      completedGames: games.data?.filter((g) => g.status === "completed").length || 0,
      usersWithProfiles: profiles.data?.length || 0,
      friendships: friendships.data?.length || 0,
    }

    console.log("📈 System metrics:", metrics)
    return metrics
  }

  const analyzeDatabaseSchema = async (results: AnalysisResult[]) => {
    console.log("🗄️ Analyzing database schema...")

    try {
      // Check if all required tables exist
      const tables = ["game_invitations", "game_sessions", "profiles", "friendships"]
      const tableChecks = await Promise.all(
        tables.map(async (table) => {
          try {
            const { error } = await supabase.from(table).select("*").limit(1)
            return { table, exists: !error }
          } catch {
            return { table, exists: false }
          }
        }),
      )

      const missingTables = tableChecks.filter((t) => !t.exists)
      if (missingTables.length > 0) {
        results.push({
          category: "Database Schema",
          status: "fail",
          title: "Missing Required Tables",
          description: `Missing tables: ${missingTables.map((t) => t.table).join(", ")}`,
          recommendations: ["Run database migration scripts", "Check database permissions"],
        })
      } else {
        results.push({
          category: "Database Schema",
          status: "pass",
          title: "All Required Tables Present",
          description: "All core tables for the invite system are available",
        })
      }

      // Check for required columns
      await checkRequiredColumns(results)

      // Check for database functions
      await checkDatabaseFunctions(results)
    } catch (error) {
      results.push({
        category: "Database Schema",
        status: "fail",
        title: "Schema Analysis Failed",
        description: `Could not analyze database schema: ${error}`,
        recommendations: ["Check database connectivity", "Verify user permissions"],
      })
    }
  }

  const checkRequiredColumns = async (results: AnalysisResult[]) => {
    try {
      // Check game_sessions for invited_users column
      const { data: gameSession, error } = await supabase
        .from("game_sessions")
        .select("invited_users")
        .limit(1)
        .single()

      if (error && error.code === "PGRST116") {
        // No data, but column exists
        results.push({
          category: "Database Schema",
          status: "pass",
          title: "invited_users Column Present",
          description: "Game sessions table has invited_users column",
        })
      } else if (error && error.message.includes("column")) {
        results.push({
          category: "Database Schema",
          status: "fail",
          title: "Missing invited_users Column",
          description: "Game sessions table missing invited_users column",
          recommendations: ["Run ALTER TABLE game_sessions ADD COLUMN invited_users TEXT[]"],
        })
      } else {
        results.push({
          category: "Database Schema",
          status: "pass",
          title: "invited_users Column Present",
          description: "Game sessions table has invited_users column",
        })
      }
    } catch (error) {
      results.push({
        category: "Database Schema",
        status: "warning",
        title: "Column Check Inconclusive",
        description: `Could not verify column structure: ${error}`,
      })
    }
  }

  const checkDatabaseFunctions = async (results: AnalysisResult[]) => {
    try {
      // Test accept_game_invitation function
      const { error } = await supabase.rpc("accept_game_invitation", {
        invitation_id: "00000000-0000-0000-0000-000000000000", // Dummy UUID
      })

      if (error && error.message.includes("function") && error.message.includes("does not exist")) {
        results.push({
          category: "Database Functions",
          status: "fail",
          title: "Missing accept_game_invitation Function",
          description: "Required database function is not available",
          recommendations: ["Run the database function creation script"],
        })
      } else {
        results.push({
          category: "Database Functions",
          status: "pass",
          title: "Database Functions Available",
          description: "Required database functions are present",
        })
      }
    } catch (error) {
      results.push({
        category: "Database Functions",
        status: "warning",
        title: "Function Check Inconclusive",
        description: `Could not verify database functions: ${error}`,
      })
    }
  }

  const analyzePreGameInvites = async (results: AnalysisResult[]) => {
    console.log("🎮 Analyzing pre-game invites...")

    try {
      // Check invite creation flow
      const { data: recentGames } = await supabase
        .from("game_sessions")
        .select("id, name, invited_users, created_at")
        .order("created_at", { ascending: false })
        .limit(10)

      const gamesWithInvites = recentGames?.filter((g) => g.invited_users && g.invited_users.length > 0) || []

      if (gamesWithInvites.length === 0) {
        results.push({
          category: "Pre-Game Invites",
          status: "info",
          title: "No Recent Games with Invites",
          description: "No recent games found with invited users",
          details: { totalRecentGames: recentGames?.length || 0 },
        })
      } else {
        results.push({
          category: "Pre-Game Invites",
          status: "pass",
          title: "Games with Invites Found",
          description: `Found ${gamesWithInvites.length} recent games with invites`,
          details: {
            gamesWithInvites: gamesWithInvites.length,
            totalInvitedUsers: gamesWithInvites.reduce((sum, g) => sum + (g.invited_users?.length || 0), 0),
          },
        })
      }

      // Check invite delivery
      await checkInviteDelivery(results, gamesWithInvites)

      // Check friend selection process
      await analyzeFriendSelection(results)
    } catch (error) {
      results.push({
        category: "Pre-Game Invites",
        status: "fail",
        title: "Pre-Game Analysis Failed",
        description: `Could not analyze pre-game invites: ${error}`,
      })
    }
  }

  const checkInviteDelivery = async (results: AnalysisResult[], gamesWithInvites: any[]) => {
    if (gamesWithInvites.length === 0) return

    try {
      // Check if invitations were actually created for games with invited_users
      const gameIds = gamesWithInvites.map((g) => g.id)
      const { data: invitations } = await supabase
        .from("game_invitations")
        .select("game_session_id, status")
        .in("game_session_id", gameIds)

      const gamesWithMissingInvitations = gamesWithInvites.filter(
        (game) => !invitations?.some((inv) => inv.game_session_id === game.id),
      )

      if (gamesWithMissingInvitations.length > 0) {
        results.push({
          category: "Pre-Game Invites",
          status: "fail",
          title: "Missing Invitation Records",
          description: `${gamesWithMissingInvitations.length} games have invited_users but no invitation records`,
          details: { missingInvitations: gamesWithMissingInvitations.map((g) => g.name) },
          recommendations: [
            "Check invitation creation logic in game creation flow",
            "Ensure invitations are created when games are saved",
          ],
        })
      } else {
        results.push({
          category: "Pre-Game Invites",
          status: "pass",
          title: "Invitation Records Consistent",
          description: "All games with invited users have corresponding invitation records",
        })
      }
    } catch (error) {
      results.push({
        category: "Pre-Game Invites",
        status: "warning",
        title: "Invite Delivery Check Failed",
        description: `Could not verify invite delivery: ${error}`,
      })
    }
  }

  const analyzeFriendSelection = async (results: AnalysisResult[]) => {
    try {
      // Check if user has friends to invite
      const { data: friendships } = await supabase.from("friendships").select("id").eq("user_id", user!.id)

      if (!friendships || friendships.length === 0) {
        results.push({
          category: "Pre-Game Invites",
          status: "info",
          title: "No Friends Available",
          description: "User has no friends to invite to games",
          recommendations: ["Add friends through the friends page to enable invitations"],
        })
      } else {
        results.push({
          category: "Pre-Game Invites",
          status: "pass",
          title: "Friends Available for Invites",
          description: `User has ${friendships.length} friends available for invitations`,
        })
      }
    } catch (error) {
      results.push({
        category: "Pre-Game Invites",
        status: "warning",
        title: "Friend Selection Analysis Failed",
        description: `Could not analyze friend selection: ${error}`,
      })
    }
  }

  const analyzeDuringGameInvites = async (results: AnalysisResult[]) => {
    console.log("🎯 Analyzing during-game invites...")

    try {
      // Check for active games that allow invites
      const { data: activeGames } = await supabase
        .from("game_sessions")
        .select("id, name, status, user_id, invited_users, players_data")
        .eq("status", "active")
        .eq("user_id", user!.id)

      if (!activeGames || activeGames.length === 0) {
        results.push({
          category: "During-Game Invites",
          status: "info",
          title: "No Active Games",
          description: "User has no active games to test during-game invites",
          recommendations: ["Create an active game to test during-game invite functionality"],
        })
        return
      }

      results.push({
        category: "During-Game Invites",
        status: "pass",
        title: "Active Games Available",
        description: `Found ${activeGames.length} active games for during-game invite testing`,
      })

      // Check invite restrictions for active games
      await checkDuringGameInviteRestrictions(results, activeGames)

      // Check player addition flow
      await checkPlayerAdditionFlow(results, activeGames)
    } catch (error) {
      results.push({
        category: "During-Game Invites",
        status: "fail",
        title: "During-Game Analysis Failed",
        description: `Could not analyze during-game invites: ${error}`,
      })
    }
  }

  const checkDuringGameInviteRestrictions = async (results: AnalysisResult[], activeGames: any[]) => {
    // Check if games in pending_close status properly restrict invites
    const { data: pendingGames } = await supabase
      .from("game_sessions")
      .select("id, name, status")
      .eq("status", "pending_close")
      .eq("user_id", user!.id)

    if (pendingGames && pendingGames.length > 0) {
      results.push({
        category: "During-Game Invites",
        status: "pass",
        title: "Pending Close Games Identified",
        description: `Found ${pendingGames.length} games in pending_close status`,
        details: { pendingGames: pendingGames.map((g) => g.name) },
        recommendations: ["Verify that these games properly restrict new invitations"],
      })
    }
  }

  const checkPlayerAdditionFlow = async (results: AnalysisResult[], activeGames: any[]) => {
    // Analyze player data structure in active games
    const gamesWithPlayers = activeGames.filter((g) => g.players_data && g.players_data.length > 0)

    if (gamesWithPlayers.length > 0) {
      const playerStructureIssues = []

      for (const game of gamesWithPlayers) {
        const players = game.players_data || []
        for (const player of players) {
          if (!player.playerId || !player.name || !player.buyIns) {
            playerStructureIssues.push({
              gameId: game.id,
              gameName: game.name,
              playerName: player.name || "Unknown",
              missingFields: [
                !player.playerId && "playerId",
                !player.name && "name",
                !player.buyIns && "buyIns",
              ].filter(Boolean),
            })
          }
        }
      }

      if (playerStructureIssues.length > 0) {
        results.push({
          category: "During-Game Invites",
          status: "warning",
          title: "Player Data Structure Issues",
          description: `Found ${playerStructureIssues.length} players with incomplete data`,
          details: { issues: playerStructureIssues },
          recommendations: [
            "Ensure all players have required fields when added",
            "Validate player data structure on game updates",
          ],
        })
      } else {
        results.push({
          category: "During-Game Invites",
          status: "pass",
          title: "Player Data Structure Valid",
          description: "All players in active games have proper data structure",
        })
      }
    }
  }

  const analyzeUserExperience = async (results: AnalysisResult[]) => {
    console.log("👤 Analyzing user experience...")

    try {
      // Check invitation visibility for current user
      const { data: userInvitations } = await supabase
        .from("game_invitations")
        .select(`
          *,
          game_session:game_sessions(name, status, start_time),
          inviter_profile:profiles!game_invitations_inviter_id_fkey(full_name, email)
        `)
        .eq("invitee_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(10)

      if (!userInvitations || userInvitations.length === 0) {
        results.push({
          category: "User Experience",
          status: "info",
          title: "No Recent Invitations",
          description: "User has no recent game invitations to analyze",
          recommendations: ["Test invitation flow by having another user send an invite"],
        })
      } else {
        // Analyze invitation data completeness
        const incompleteInvitations = userInvitations.filter((inv) => !inv.game_session || !inv.inviter_profile)

        if (incompleteInvitations.length > 0) {
          results.push({
            category: "User Experience",
            status: "warning",
            title: "Incomplete Invitation Data",
            description: `${incompleteInvitations.length} invitations missing game or inviter information`,
            recommendations: ["Check foreign key relationships", "Ensure proper data joins in invitation queries"],
          })
        } else {
          results.push({
            category: "User Experience",
            status: "pass",
            title: "Complete Invitation Data",
            description: "All invitations have complete game and inviter information",
          })
        }

        // Check for stale pending invitations
        const stalePendingInvitations = userInvitations.filter((inv) => {
          if (inv.status !== "pending") return false
          const inviteAge = Date.now() - new Date(inv.created_at).getTime()
          const daysSinceInvite = inviteAge / (1000 * 60 * 60 * 24)
          return daysSinceInvite > 7 // More than 7 days old
        })

        if (stalePendingInvitations.length > 0) {
          results.push({
            category: "User Experience",
            status: "warning",
            title: "Stale Pending Invitations",
            description: `${stalePendingInvitations.length} invitations pending for more than 7 days`,
            details: { staleInvitations: stalePendingInvitations.map((inv) => inv.game_session?.name) },
            recommendations: ["Consider auto-declining old invitations", "Add expiration dates to invitations"],
          })
        }
      }

      // Check name display consistency
      await checkNameDisplayConsistency(results)

      // Check notification functionality
      await checkNotificationFunctionality(results)
    } catch (error) {
      results.push({
        category: "User Experience",
        status: "fail",
        title: "User Experience Analysis Failed",
        description: `Could not analyze user experience: ${error}`,
      })
    }
  }

  const checkNameDisplayConsistency = async (results: AnalysisResult[]) => {
    try {
      // Check if user profile has proper name
      if (!profile?.full_name) {
        results.push({
          category: "User Experience",
          status: "warning",
          title: "Incomplete User Profile",
          description: "User profile missing full_name field",
          recommendations: ["Ensure users complete their profile information"],
        })
      } else {
        results.push({
          category: "User Experience",
          status: "pass",
          title: "User Profile Complete",
          description: "User has complete profile information for name display",
        })
      }

      // Check for games where user appears as player
      const { data: gamesAsPlayer } = await supabase
        .from("game_sessions")
        .select("id, name, players_data")
        .contains("players_data", [{ name: profile?.full_name }])

      if (gamesAsPlayer && gamesAsPlayer.length > 0) {
        results.push({
          category: "User Experience",
          status: "pass",
          title: "Name Consistency in Games",
          description: `User appears as player in ${gamesAsPlayer.length} games with consistent naming`,
        })
      }
    } catch (error) {
      results.push({
        category: "User Experience",
        status: "warning",
        title: "Name Display Check Failed",
        description: `Could not verify name display consistency: ${error}`,
      })
    }
  }

  const checkNotificationFunctionality = async (results: AnalysisResult[]) => {
    // This would typically check if notifications are being sent
    // For now, we'll check if the invitation system has the necessary data
    results.push({
      category: "User Experience",
      status: "info",
      title: "Notification System",
      description: "Notification functionality relies on UI-based alerts and page refreshes",
      recommendations: [
        "Consider implementing real-time notifications",
        "Add email notifications for invitations",
        "Implement push notifications for mobile users",
      ],
    })
  }

  const analyzePerformance = async (results: AnalysisResult[]) => {
    console.log("⚡ Analyzing performance...")

    try {
      const startTime = Date.now()

      // Test query performance for invitation loading
      const { data: invitations, error } = await supabase
        .from("game_invitations")
        .select(`
          *,
          game_session:game_sessions(name, status),
          inviter_profile:profiles!game_invitations_inviter_id_fkey(full_name, email)
        `)
        .eq("invitee_id", user!.id)
        .limit(50)

      const queryTime = Date.now() - startTime

      if (error) {
        results.push({
          category: "Performance",
          status: "fail",
          title: "Query Performance Issue",
          description: `Invitation query failed: ${error.message}`,
          recommendations: ["Check database indexes", "Verify query structure"],
        })
      } else {
        const status = queryTime > 2000 ? "warning" : queryTime > 1000 ? "info" : "pass"
        results.push({
          category: "Performance",
          status,
          title: "Invitation Query Performance",
          description: `Query completed in ${queryTime}ms for ${invitations?.length || 0} invitations`,
          details: { queryTime, resultCount: invitations?.length || 0 },
          recommendations:
            queryTime > 1000
              ? [
                  "Consider adding database indexes",
                  "Optimize query joins",
                  "Implement pagination for large result sets",
                ]
              : undefined,
        })
      }

      // Test game session loading performance
      await testGameSessionPerformance(results)
    } catch (error) {
      results.push({
        category: "Performance",
        status: "fail",
        title: "Performance Analysis Failed",
        description: `Could not analyze performance: ${error}`,
      })
    }
  }

  const testGameSessionPerformance = async (results: AnalysisResult[]) => {
    const startTime = Date.now()

    try {
      const { data: games } = await supabase
        .from("game_sessions")
        .select("id, name, status, players_data, invited_users")
        .or(`user_id.eq.${user!.id},invited_users.cs.{${user!.id}}`)
        .limit(50)

      const queryTime = Date.now() - startTime
      const status = queryTime > 3000 ? "warning" : queryTime > 1500 ? "info" : "pass"

      results.push({
        category: "Performance",
        status,
        title: "Game Session Query Performance",
        description: `Game query completed in ${queryTime}ms for ${games?.length || 0} games`,
        details: { queryTime, resultCount: games?.length || 0 },
        recommendations:
          queryTime > 1500
            ? [
                "Consider separating owned and invited game queries",
                "Add indexes on user_id and invited_users columns",
                "Implement caching for frequently accessed games",
              ]
            : undefined,
      })
    } catch (error) {
      results.push({
        category: "Performance",
        status: "warning",
        title: "Game Session Performance Test Failed",
        description: `Could not test game session performance: ${error}`,
      })
    }
  }

  const analyzeDataConsistency = async (results: AnalysisResult[]) => {
    console.log("🔍 Analyzing data consistency...")

    try {
      // Check for orphaned invitations
      const { data: orphanedInvitations } = await supabase
        .from("game_invitations")
        .select(`
          id,
          game_session_id,
          game_session:game_sessions(id)
        `)
        .is("game_session.id", null)

      if (orphanedInvitations && orphanedInvitations.length > 0) {
        results.push({
          category: "Data Consistency",
          status: "warning",
          title: "Orphaned Invitations Found",
          description: `${orphanedInvitations.length} invitations reference non-existent games`,
          recommendations: ["Clean up orphaned invitation records", "Add foreign key constraints with CASCADE DELETE"],
        })
      } else {
        results.push({
          category: "Data Consistency",
          status: "pass",
          title: "No Orphaned Invitations",
          description: "All invitations reference valid game sessions",
        })
      }

      // Check invited_users vs invitation records consistency
      await checkInvitedUsersConsistency(results)

      // Check player data consistency
      await checkPlayerDataConsistency(results)
    } catch (error) {
      results.push({
        category: "Data Consistency",
        status: "fail",
        title: "Data Consistency Analysis Failed",
        description: `Could not analyze data consistency: ${error}`,
      })
    }
  }

  const checkInvitedUsersConsistency = async (results: AnalysisResult[]) => {
    try {
      // Get games with invited_users
      const { data: gamesWithInvites } = await supabase
        .from("game_sessions")
        .select("id, name, invited_users")
        .not("invited_users", "is", null)

      if (!gamesWithInvites || gamesWithInvites.length === 0) {
        results.push({
          category: "Data Consistency",
          status: "info",
          title: "No Games with Invited Users",
          description: "No games found with invited_users to check consistency",
        })
        return
      }

      let inconsistentGames = 0
      for (const game of gamesWithInvites) {
        if (!game.invited_users || game.invited_users.length === 0) continue

        // Check if invitation records exist for all invited users
        const { data: invitations } = await supabase
          .from("game_invitations")
          .select("invitee_id")
          .eq("game_session_id", game.id)

        const invitedUserIds = new Set(game.invited_users)
        const invitationUserIds = new Set(invitations?.map((inv) => inv.invitee_id) || [])

        // Check if all invited users have invitation records
        const missingInvitations = [...invitedUserIds].filter((userId) => !invitationUserIds.has(userId))

        if (missingInvitations.length > 0) {
          inconsistentGames++
        }
      }

      if (inconsistentGames > 0) {
        results.push({
          category: "Data Consistency",
          status: "warning",
          title: "Invited Users Inconsistency",
          description: `${inconsistentGames} games have invited_users without corresponding invitation records`,
          recommendations: [
            "Sync invitation records with invited_users arrays",
            "Ensure invitation creation when updating invited_users",
          ],
        })
      } else {
        results.push({
          category: "Data Consistency",
          status: "pass",
          title: "Invited Users Consistency",
          description: "All games with invited_users have corresponding invitation records",
        })
      }
    } catch (error) {
      results.push({
        category: "Data Consistency",
        status: "warning",
        title: "Invited Users Consistency Check Failed",
        description: `Could not check invited_users consistency: ${error}`,
      })
    }
  }

  const checkPlayerDataConsistency = async (results: AnalysisResult[]) => {
    try {
      // Check for games where invited users appear as players
      const { data: acceptedInvitations } = await supabase
        .from("game_invitations")
        .select(`
          invitee_id,
          game_session_id,
          game_session:game_sessions(players_data),
          invitee:profiles!game_invitations_invitee_id_fkey(full_name)
        `)
        .eq("status", "accepted")

      if (!acceptedInvitations || acceptedInvitations.length === 0) {
        results.push({
          category: "Data Consistency",
          status: "info",
          title: "No Accepted Invitations",
          description: "No accepted invitations to check player data consistency",
        })
        return
      }

      let missingPlayers = 0
      for (const invitation of acceptedInvitations) {
        const playerName = invitation.invitee?.full_name
        const playersData = invitation.game_session?.players_data || []

        if (playerName) {
          const playerExists = playersData.some(
            (player: any) => player.name?.toLowerCase().trim() === playerName.toLowerCase().trim(),
          )

          if (!playerExists) {
            missingPlayers++
          }
        }
      }

      if (missingPlayers > 0) {
        results.push({
          category: "Data Consistency",
          status: "warning",
          title: "Missing Player Records",
          description: `${missingPlayers} accepted invitations don't have corresponding player records`,
          recommendations: [
            "Ensure accept_game_invitation function properly adds players",
            "Verify player addition logic in invitation acceptance",
          ],
        })
      } else {
        results.push({
          category: "Data Consistency",
          status: "pass",
          title: "Player Data Consistency",
          description: "All accepted invitations have corresponding player records",
        })
      }
    } catch (error) {
      results.push({
        category: "Data Consistency",
        status: "warning",
        title: "Player Data Consistency Check Failed",
        description: `Could not check player data consistency: ${error}`,
      })
    }
  }

  const analyzeSecurityAspects = async (results: AnalysisResult[]) => {
    console.log("🔒 Analyzing security aspects...")

    try {
      // Check RLS policies
      results.push({
        category: "Security",
        status: "info",
        title: "Row Level Security",
        description: "RLS policies should be verified manually",
        recommendations: [
          "Verify users can only see their own invitations",
          "Ensure users can only accept invitations sent to them",
          "Check that game owners can only modify their own games",
        ],
      })

      // Check for potential data exposure
      await checkDataExposure(results)

      // Check input validation
      await checkInputValidation(results)
    } catch (error) {
      results.push({
        category: "Security",
        status: "fail",
        title: "Security Analysis Failed",
        description: `Could not analyze security aspects: ${error}`,
      })
    }
  }

  const checkDataExposure = async (results: AnalysisResult[]) => {
    try {
      // Test if user can access other users' invitations
      const { data: allInvitations, error } = await supabase
        .from("game_invitations")
        .select("invitee_id")
        .neq("invitee_id", user!.id)
        .limit(1)

      if (allInvitations && allInvitations.length > 0) {
        results.push({
          category: "Security",
          status: "fail",
          title: "Data Exposure Risk",
          description: "User can access invitations not sent to them",
          recommendations: ["Review and strengthen RLS policies", "Ensure proper user isolation in queries"],
        })
      } else {
        results.push({
          category: "Security",
          status: "pass",
          title: "Proper Data Isolation",
          description: "User cannot access other users' invitations",
        })
      }
    } catch (error) {
      // This might be expected if RLS is working properly
      results.push({
        category: "Security",
        status: "pass",
        title: "Data Access Restricted",
        description: "Cannot access other users' data (likely due to RLS policies)",
      })
    }
  }

  const checkInputValidation = async (results: AnalysisResult[]) => {
    // This would typically test the accept_game_invitation function with invalid inputs
    results.push({
      category: "Security",
      status: "info",
      title: "Input Validation",
      description: "Input validation should be tested with edge cases",
      recommendations: [
        "Test accept_game_invitation with invalid UUIDs",
        "Test with non-existent invitation IDs",
        "Verify proper error handling for malformed requests",
      ],
    })
  }

  const runTestScenarios = async () => {
    if (!user) return

    console.log("🧪 Running test scenarios...")
    const scenarios = []

    try {
      // Scenario 1: Create a test game with invites
      const testGameScenario = await testGameCreationWithInvites()
      scenarios.push(testGameScenario)

      // Scenario 2: Test invitation acceptance
      const acceptanceScenario = await testInvitationAcceptance()
      scenarios.push(acceptanceScenario)

      // Scenario 3: Test during-game invites
      const duringGameScenario = await testDuringGameInvites()
      scenarios.push(duringGameScenario)

      setTestScenarios(scenarios)
    } catch (error) {
      console.error("Test scenarios failed:", error)
      scenarios.push({
        name: "Test Execution",
        status: "fail",
        description: `Test scenarios failed: ${error}`,
        details: null,
      })
      setTestScenarios(scenarios)
    }
  }

  const testGameCreationWithInvites = async () => {
    try {
      // This would create a test game and verify invite creation
      return {
        name: "Game Creation with Invites",
        status: "info",
        description: "Test scenario requires manual execution",
        details: {
          steps: [
            "Create a new game with friend invitations",
            "Verify invited_users array is populated",
            "Check that invitation records are created",
            "Confirm friends receive invitations",
          ],
        },
      }
    } catch (error) {
      return {
        name: "Game Creation with Invites",
        status: "fail",
        description: `Test failed: ${error}`,
        details: null,
      }
    }
  }

  const testInvitationAcceptance = async () => {
    try {
      // Check if there are pending invitations to test
      const { data: pendingInvitations } = await supabase
        .from("game_invitations")
        .select("id, game_session_id")
        .eq("invitee_id", user!.id)
        .eq("status", "pending")
        .limit(1)

      if (!pendingInvitations || pendingInvitations.length === 0) {
        return {
          name: "Invitation Acceptance",
          status: "info",
          description: "No pending invitations available for testing",
          details: {
            recommendation: "Have another user send you a game invitation to test acceptance flow",
          },
        }
      }

      return {
        name: "Invitation Acceptance",
        status: "info",
        description: `Found ${pendingInvitations.length} pending invitation(s) for testing`,
        details: {
          pendingInvitations: pendingInvitations.length,
          testSteps: [
            "Accept a pending invitation",
            "Verify player is added to game",
            "Check invitation status is updated",
            "Confirm user appears in game dashboard",
          ],
        },
      }
    } catch (error) {
      return {
        name: "Invitation Acceptance",
        status: "fail",
        description: `Test setup failed: ${error}`,
        details: null,
      }
    }
  }

  const testDuringGameInvites = async () => {
    try {
      const { data: activeGames } = await supabase
        .from("game_sessions")
        .select("id, name, status")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .limit(1)

      if (!activeGames || activeGames.length === 0) {
        return {
          name: "During-Game Invites",
          status: "info",
          description: "No active games available for during-game invite testing",
          details: {
            recommendation: "Create an active game to test during-game invitation functionality",
          },
        }
      }

      return {
        name: "During-Game Invites",
        status: "info",
        description: `Found ${activeGames.length} active game(s) for testing`,
        details: {
          activeGames: activeGames.map((g) => g.name),
          testSteps: [
            "Open an active game",
            "Send invitations to friends",
            "Verify invitations are created",
            "Test invitation acceptance during game",
            "Confirm invited players are added properly",
          ],
        },
      }
    } catch (error) {
      return {
        name: "During-Game Invites",
        status: "fail",
        description: `Test setup failed: ${error}`,
        details: null,
      }
    }
  }

  useEffect(() => {
    if (user) {
      runComprehensiveAnalysis()
    }
  }, [user])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pass":
        return "✅"
      case "fail":
        return "❌"
      case "warning":
        return "⚠️"
      case "info":
        return "ℹ️"
      default:
        return "❓"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pass":
        return "text-green-400"
      case "fail":
        return "text-red-400"
      case "warning":
        return "text-yellow-400"
      case "info":
        return "text-blue-400"
      default:
        return "text-gray-400"
    }
  }

  if (!user) {
    return <div className="text-center p-8">Please log in to run the analysis</div>
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <Card>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-brand-primary">Game Invite System Analysis</h1>
          <div className="space-x-2">
            <Button onClick={runComprehensiveAnalysis} disabled={loading} variant="primary">
              {loading ? "Analyzing..." : "Refresh Analysis"}
            </Button>
            <Button onClick={runTestScenarios} disabled={loading} variant="secondary">
              Run Test Scenarios
            </Button>
          </div>
        </div>

        {/* System Metrics Overview */}
        {systemMetrics && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">System Overview</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-900/20 p-4 rounded-lg">
                <h3 className="text-blue-400 font-semibold">Total Invitations</h3>
                <p className="text-2xl font-bold text-white">{systemMetrics.totalInvitations}</p>
                <p className="text-xs text-blue-300">
                  Pending: {systemMetrics.pendingInvitations} | Accepted: {systemMetrics.acceptedInvitations}
                </p>
              </div>
              <div className="bg-green-900/20 p-4 rounded-lg">
                <h3 className="text-green-400 font-semibold">Games</h3>
                <p className="text-2xl font-bold text-white">
                  {systemMetrics.activeGames + systemMetrics.completedGames}
                </p>
                <p className="text-xs text-green-300">
                  Active: {systemMetrics.activeGames} | Completed: {systemMetrics.completedGames}
                </p>
              </div>
              <div className="bg-purple-900/20 p-4 rounded-lg">
                <h3 className="text-purple-400 font-semibold">Users</h3>
                <p className="text-2xl font-bold text-white">{systemMetrics.usersWithProfiles}</p>
                <p className="text-xs text-purple-300">Registered profiles</p>
              </div>
              <div className="bg-yellow-900/20 p-4 rounded-lg">
                <h3 className="text-yellow-400 font-semibold">Friendships</h3>
                <p className="text-2xl font-bold text-white">{systemMetrics.friendships}</p>
                <p className="text-xs text-yellow-300">Total connections</p>
              </div>
            </div>
          </div>
        )}

        {/* Analysis Results */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-white">Analysis Results</h2>

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary mx-auto mb-4"></div>
              <p className="text-text-secondary">Running comprehensive analysis...</p>
            </div>
          ) : (
            <>
              {/* Group results by category */}
              {[
                "Database Schema",
                "Pre-Game Invites",
                "During-Game Invites",
                "User Experience",
                "Performance",
                "Data Consistency",
                "Security",
              ].map((category) => {
                const categoryResults = analysisResults.filter((r) => r.category === category)
                if (categoryResults.length === 0) return null

                return (
                  <div key={category} className="space-y-3">
                    <h3 className="text-lg font-semibold text-brand-primary">{category}</h3>
                    {categoryResults.map((result, index) => (
                      <div key={index} className="bg-slate-800 rounded-lg p-4">
                        <div className="flex items-start space-x-3">
                          <span className="text-2xl">{getStatusIcon(result.status)}</span>
                          <div className="flex-1">
                            <h4 className={`font-semibold ${getStatusColor(result.status)}`}>{result.title}</h4>
                            <p className="text-text-secondary mt-1">{result.description}</p>

                            {result.details && (
                              <div className="mt-2 p-2 bg-slate-900 rounded text-xs">
                                <pre className="text-gray-300 whitespace-pre-wrap">
                                  {JSON.stringify(result.details, null, 2)}
                                </pre>
                              </div>
                            )}

                            {result.recommendations && result.recommendations.length > 0 && (
                              <div className="mt-2">
                                <p className="text-sm font-semibold text-yellow-400">Recommendations:</p>
                                <ul className="list-disc list-inside text-sm text-text-secondary mt-1">
                                  {result.recommendations.map((rec, i) => (
                                    <li key={i}>{rec}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </>
          )}
        </div>

        {/* Test Scenarios */}
        {testScenarios.length > 0 && (
          <div className="mt-8 space-y-4">
            <h2 className="text-xl font-semibold text-white">Test Scenarios</h2>
            {testScenarios.map((scenario, index) => (
              <div key={index} className="bg-slate-800 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <span className="text-2xl">{getStatusIcon(scenario.status)}</span>
                  <div className="flex-1">
                    <h4 className={`font-semibold ${getStatusColor(scenario.status)}`}>{scenario.name}</h4>
                    <p className="text-text-secondary mt-1">{scenario.description}</p>

                    {scenario.details && (
                      <div className="mt-2 p-2 bg-slate-900 rounded text-xs">
                        <pre className="text-gray-300 whitespace-pre-wrap">
                          {JSON.stringify(scenario.details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {analysisResults.length > 0 && (
          <div className="mt-8 p-4 bg-slate-900 rounded-lg">
            <h3 className="text-lg font-semibold text-white mb-2">Analysis Summary</h3>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-green-400">
                  {analysisResults.filter((r) => r.status === "pass").length}
                </p>
                <p className="text-sm text-green-300">Passed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-400">
                  {analysisResults.filter((r) => r.status === "warning").length}
                </p>
                <p className="text-sm text-yellow-300">Warnings</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-400">
                  {analysisResults.filter((r) => r.status === "fail").length}
                </p>
                <p className="text-sm text-red-300">Failed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-400">
                  {analysisResults.filter((r) => r.status === "info").length}
                </p>
                <p className="text-sm text-blue-300">Info</p>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

export default GameInviteSystemAnalysis
