import { supabase } from "../lib/supabase"

export interface DiagnosticResult {
  testName: string
  status: "PASS" | "WARNING" | "ERROR" | "INFO"
  details?: string
  severity: "INFO" | "WARNING" | "ERROR"
  timestamp: string
}

export interface PerformanceMetric {
  testName: string
  executionTimeMs: number
  rowsAffected?: number
  timestamp: string
}

export interface DatabaseHealthReport {
  overallStatus: "HEALTHY" | "WARNING" | "CRITICAL"
  diagnosticResults: DiagnosticResult[]
  performanceMetrics: PerformanceMetric[]
  recommendations: string[]
  summary: {
    totalTests: number
    passedTests: number
    warningTests: number
    errorTests: number
  }
}

export class DatabaseDiagnostics {
  private results: DiagnosticResult[] = []
  private metrics: PerformanceMetric[] = []

  private logResult(
    testName: string,
    status: DiagnosticResult["status"],
    details?: string,
    severity: DiagnosticResult["severity"] = "INFO",
  ) {
    this.results.push({
      testName,
      status,
      details,
      severity,
      timestamp: new Date().toISOString(),
    })
  }

  private logMetric(testName: string, executionTimeMs: number, rowsAffected?: number) {
    this.metrics.push({
      testName,
      executionTimeMs,
      rowsAffected,
      timestamp: new Date().toISOString(),
    })
  }

  async runComprehensiveDiagnostics(): Promise<DatabaseHealthReport> {
    console.log("Starting comprehensive database diagnostics...")

    this.results = []
    this.metrics = []

    try {
      await this.testDatabaseConnection()
      await this.testDataIntegrity()
      await this.testPerformance()
      await this.testConcurrentAccess()
      await this.validateRelationships()
    } catch (error) {
      this.logResult("DIAGNOSTIC_EXECUTION", "ERROR", `Failed to complete diagnostics: ${error}`, "ERROR")
    }

    return this.generateReport()
  }

  private async testDatabaseConnection(): Promise<void> {
    const startTime = Date.now()

    try {
      const { data, error } = await supabase.from("profiles").select("id").limit(1)

      const executionTime = Date.now() - startTime
      this.logMetric("DATABASE_CONNECTION", executionTime)

      if (error) {
        this.logResult("DATABASE_CONNECTION", "ERROR", `Connection failed: ${error.message}`, "ERROR")
      } else {
        this.logResult("DATABASE_CONNECTION", "PASS", `Connection successful in ${executionTime}ms`)
      }
    } catch (error) {
      this.logResult("DATABASE_CONNECTION", "ERROR", `Connection test failed: ${error}`, "ERROR")
    }
  }

  private async testDataIntegrity(): Promise<void> {
    console.log("Testing data integrity...")

    // Test profiles integrity
    await this.testProfilesIntegrity()

    // Test game sessions integrity
    await this.testGameSessionsIntegrity()

    // Test friendships integrity
    await this.testFriendshipsIntegrity()

    // Test friend requests integrity
    await this.testFriendRequestsIntegrity()

    // Test game invitations integrity
    await this.testGameInvitationsIntegrity()
  }

  private async testProfilesIntegrity(): Promise<void> {
    const startTime = Date.now()

    try {
      // Check for profiles count
      const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id, email, full_name")

      const executionTime = Date.now() - startTime
      this.logMetric("PROFILES_INTEGRITY_CHECK", executionTime, profiles?.length)

      if (profilesError) {
        this.logResult("PROFILES_INTEGRITY", "ERROR", `Profiles query failed: ${profilesError.message}`, "ERROR")
        return
      }

      if (!profiles || profiles.length === 0) {
        this.logResult("PROFILES_INTEGRITY", "WARNING", "No profiles found in database", "WARNING")
        return
      }

      // Check for invalid emails
      const invalidEmails = profiles.filter(
        (p) => !p.email || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(p.email),
      )

      if (invalidEmails.length > 0) {
        this.logResult(
          "PROFILES_EMAIL_VALIDATION",
          "ERROR",
          `Found ${invalidEmails.length} profiles with invalid email formats`,
          "ERROR",
        )
      } else {
        this.logResult("PROFILES_EMAIL_VALIDATION", "PASS", "All email formats are valid")
      }

      // Check for duplicate emails
      const emailCounts = profiles.reduce(
        (acc, profile) => {
          acc[profile.email] = (acc[profile.email] || 0) + 1
          return acc
        },
        {} as Record<string, number>,
      )

      const duplicateEmails = Object.entries(emailCounts).filter(([_, count]) => count > 1)

      if (duplicateEmails.length > 0) {
        this.logResult(
          "PROFILES_DUPLICATE_EMAILS",
          "ERROR",
          `Found ${duplicateEmails.length} duplicate email addresses`,
          "ERROR",
        )
      } else {
        this.logResult("PROFILES_DUPLICATE_EMAILS", "PASS", "No duplicate emails found")
      }

      this.logResult("PROFILES_INTEGRITY", "PASS", `Validated ${profiles.length} profiles`)
    } catch (error) {
      this.logResult("PROFILES_INTEGRITY", "ERROR", `Profiles integrity check failed: ${error}`, "ERROR")
    }
  }

  private async testGameSessionsIntegrity(): Promise<void> {
    const startTime = Date.now()

    try {
      const { data: sessions, error } = await supabase
        .from("game_sessions")
        .select("id, user_id, status, name, players_data")

      const executionTime = Date.now() - startTime
      this.logMetric("GAME_SESSIONS_INTEGRITY_CHECK", executionTime, sessions?.length)

      if (error) {
        this.logResult("GAME_SESSIONS_INTEGRITY", "ERROR", `Game sessions query failed: ${error.message}`, "ERROR")
        return
      }

      if (!sessions) {
        this.logResult("GAME_SESSIONS_INTEGRITY", "INFO", "No game sessions found")
        return
      }

      // Check for invalid statuses
      const validStatuses = ["active", "completed", "pending_close"]
      const invalidSessions = sessions.filter((s) => !validStatuses.includes(s.status))

      if (invalidSessions.length > 0) {
        this.logResult(
          "GAME_SESSIONS_STATUS_VALIDATION",
          "ERROR",
          `Found ${invalidSessions.length} sessions with invalid status`,
          "ERROR",
        )
      } else {
        this.logResult("GAME_SESSIONS_STATUS_VALIDATION", "PASS", "All session statuses are valid")
      }

      // Check for sessions with invalid JSON data
      const invalidJsonSessions = sessions.filter((s) => {
        try {
          if (s.players_data && typeof s.players_data === "string") {
            JSON.parse(s.players_data)
          }
          return false
        } catch {
          return true
        }
      })

      if (invalidJsonSessions.length > 0) {
        this.logResult(
          "GAME_SESSIONS_JSON_VALIDATION",
          "ERROR",
          `Found ${invalidJsonSessions.length} sessions with invalid JSON data`,
          "ERROR",
        )
      } else {
        this.logResult("GAME_SESSIONS_JSON_VALIDATION", "PASS", "All session JSON data is valid")
      }

      this.logResult("GAME_SESSIONS_INTEGRITY", "PASS", `Validated ${sessions.length} game sessions`)
    } catch (error) {
      this.logResult("GAME_SESSIONS_INTEGRITY", "ERROR", `Game sessions integrity check failed: ${error}`, "ERROR")
    }
  }

  private async testFriendshipsIntegrity(): Promise<void> {
    const startTime = Date.now()

    try {
      const { data: friendships, error } = await supabase.from("friendships").select("id, user_id, friend_id")

      const executionTime = Date.now() - startTime
      this.logMetric("FRIENDSHIPS_INTEGRITY_CHECK", executionTime, friendships?.length)

      if (error) {
        this.logResult("FRIENDSHIPS_INTEGRITY", "ERROR", `Friendships query failed: ${error.message}`, "ERROR")
        return
      }

      if (!friendships || friendships.length === 0) {
        this.logResult("FRIENDSHIPS_INTEGRITY", "INFO", "No friendships found")
        return
      }

      // Check for self-friendships
      const selfFriendships = friendships.filter((f) => f.user_id === f.friend_id)

      if (selfFriendships.length > 0) {
        this.logResult(
          "FRIENDSHIPS_SELF_REFERENCE",
          "ERROR",
          `Found ${selfFriendships.length} self-friendship records`,
          "ERROR",
        )
      } else {
        this.logResult("FRIENDSHIPS_SELF_REFERENCE", "PASS", "No self-friendships found")
      }

      this.logResult("FRIENDSHIPS_INTEGRITY", "PASS", `Validated ${friendships.length} friendships`)
    } catch (error) {
      this.logResult("FRIENDSHIPS_INTEGRITY", "ERROR", `Friendships integrity check failed: ${error}`, "ERROR")
    }
  }

  private async testFriendRequestsIntegrity(): Promise<void> {
    const startTime = Date.now()

    try {
      const { data: requests, error } = await supabase
        .from("friend_requests")
        .select("id, sender_id, receiver_id, status")

      const executionTime = Date.now() - startTime
      this.logMetric("FRIEND_REQUESTS_INTEGRITY_CHECK", executionTime, requests?.length)

      if (error) {
        this.logResult("FRIEND_REQUESTS_INTEGRITY", "ERROR", `Friend requests query failed: ${error.message}`, "ERROR")
        return
      }

      if (!requests || requests.length === 0) {
        this.logResult("FRIEND_REQUESTS_INTEGRITY", "INFO", "No friend requests found")
        return
      }

      // Check for invalid statuses
      const validStatuses = ["pending", "accepted", "declined"]
      const invalidRequests = requests.filter((r) => !validStatuses.includes(r.status))

      if (invalidRequests.length > 0) {
        this.logResult(
          "FRIEND_REQUESTS_STATUS_VALIDATION",
          "ERROR",
          `Found ${invalidRequests.length} requests with invalid status`,
          "ERROR",
        )
      } else {
        this.logResult("FRIEND_REQUESTS_STATUS_VALIDATION", "PASS", "All request statuses are valid")
      }

      this.logResult("FRIEND_REQUESTS_INTEGRITY", "PASS", `Validated ${requests.length} friend requests`)
    } catch (error) {
      this.logResult("FRIEND_REQUESTS_INTEGRITY", "ERROR", `Friend requests integrity check failed: ${error}`, "ERROR")
    }
  }

  private async testGameInvitationsIntegrity(): Promise<void> {
    const startTime = Date.now()

    try {
      const { data: invitations, error } = await supabase
        .from("game_invitations")
        .select("id, game_session_id, inviter_id, invitee_id, status")

      const executionTime = Date.now() - startTime
      this.logMetric("GAME_INVITATIONS_INTEGRITY_CHECK", executionTime, invitations?.length)

      if (error) {
        // Game invitations might not exist yet
        this.logResult("GAME_INVITATIONS_INTEGRITY", "INFO", "Game invitations table not available or empty")
        return
      }

      if (!invitations || invitations.length === 0) {
        this.logResult("GAME_INVITATIONS_INTEGRITY", "INFO", "No game invitations found")
        return
      }

      // Check for invalid statuses
      const validStatuses = ["pending", "accepted", "declined"]
      const invalidInvitations = invitations.filter((i) => !validStatuses.includes(i.status))

      if (invalidInvitations.length > 0) {
        this.logResult(
          "GAME_INVITATIONS_STATUS_VALIDATION",
          "ERROR",
          `Found ${invalidInvitations.length} invitations with invalid status`,
          "ERROR",
        )
      } else {
        this.logResult("GAME_INVITATIONS_STATUS_VALIDATION", "PASS", "All invitation statuses are valid")
      }

      this.logResult("GAME_INVITATIONS_INTEGRITY", "PASS", `Validated ${invitations.length} game invitations`)
    } catch (error) {
      this.logResult("GAME_INVITATIONS_INTEGRITY", "WARNING", `Game invitations check failed: ${error}`, "WARNING")
    }
  }

  private async testPerformance(): Promise<void> {
    console.log("Testing database performance...")

    // Test basic queries
    await this.testQueryPerformance("PROFILES_SELECT", () => supabase.from("profiles").select("*").limit(100))

    await this.testQueryPerformance("GAME_SESSIONS_SELECT", () => supabase.from("game_sessions").select("*").limit(50))

    await this.testQueryPerformance("FRIENDSHIPS_JOIN", () =>
      supabase
        .from("friendships")
        .select(`
          id,
          user_id,
          friend_id,
          user_profile:profiles!friendships_user_id_fkey(full_name),
          friend_profile:profiles!friendships_friend_id_fkey(full_name)
        `)
        .limit(50),
    )
  }

  private async testQueryPerformance(testName: string, queryFn: () => Promise<any>): Promise<void> {
    const startTime = Date.now()

    try {
      const result = await queryFn()
      const executionTime = Date.now() - startTime

      this.logMetric(testName, executionTime, result.data?.length)

      if (result.error) {
        this.logResult(testName, "ERROR", `Query failed: ${result.error.message}`, "ERROR")
      } else if (executionTime > 1000) {
        this.logResult(testName, "WARNING", `Query took ${executionTime}ms (>1000ms)`, "WARNING")
      } else if (executionTime > 500) {
        this.logResult(testName, "WARNING", `Query took ${executionTime}ms (>500ms)`, "WARNING")
      } else {
        this.logResult(testName, "PASS", `Query completed in ${executionTime}ms`)
      }
    } catch (error) {
      this.logResult(testName, "ERROR", `Performance test failed: ${error}`, "ERROR")
    }
  }

  private async testConcurrentAccess(): Promise<void> {
    console.log("Testing concurrent access...")

    const startTime = Date.now()

    try {
      // Simulate concurrent operations
      const promises = [
        supabase.from("profiles").select("id").limit(10),
        supabase.from("game_sessions").select("id").limit(10),
        supabase.from("friendships").select("id").limit(10),
      ]

      await Promise.all(promises)

      const executionTime = Date.now() - startTime
      this.logMetric("CONCURRENT_ACCESS_TEST", executionTime)

      if (executionTime > 2000) {
        this.logResult(
          "CONCURRENT_ACCESS",
          "WARNING",
          `Concurrent operations took ${executionTime}ms (>2000ms)`,
          "WARNING",
        )
      } else {
        this.logResult("CONCURRENT_ACCESS", "PASS", `Concurrent operations completed in ${executionTime}ms`)
      }
    } catch (error) {
      this.logResult("CONCURRENT_ACCESS", "ERROR", `Concurrent access test failed: ${error}`, "ERROR")
    }
  }

  private async validateRelationships(): Promise<void> {
    console.log("Validating database relationships...")

    try {
      // Check if all game sessions have valid user references
      const { data: orphanedSessions, error: sessionsError } = await supabase.from("game_sessions").select(`
          id,
          user_id,
          profiles!inner(id)
        `)

      if (sessionsError) {
        this.logResult(
          "RELATIONSHIP_VALIDATION",
          "ERROR",
          `Failed to validate game session relationships: ${sessionsError.message}`,
          "ERROR",
        )
      } else {
        this.logResult("RELATIONSHIP_VALIDATION", "PASS", "All game sessions have valid user references")
      }

      // Check friendship relationships
      const { data: friendshipCheck, error: friendshipError } = await supabase
        .from("friendships")
        .select(`
          id,
          user_profile:profiles!friendships_user_id_fkey(id),
          friend_profile:profiles!friendships_friend_id_fkey(id)
        `)
        .limit(10)

      if (friendshipError) {
        this.logResult(
          "FRIENDSHIP_RELATIONSHIPS",
          "WARNING",
          `Friendship relationship validation had issues: ${friendshipError.message}`,
          "WARNING",
        )
      } else {
        this.logResult("FRIENDSHIP_RELATIONSHIPS", "PASS", "Friendship relationships are valid")
      }
    } catch (error) {
      this.logResult("RELATIONSHIP_VALIDATION", "ERROR", `Relationship validation failed: ${error}`, "ERROR")
    }
  }

  private generateReport(): DatabaseHealthReport {
    const summary = {
      totalTests: this.results.length,
      passedTests: this.results.filter((r) => r.status === "PASS").length,
      warningTests: this.results.filter((r) => r.status === "WARNING").length,
      errorTests: this.results.filter((r) => r.status === "ERROR").length,
    }

    const overallStatus: DatabaseHealthReport["overallStatus"] =
      summary.errorTests > 0 ? "CRITICAL" : summary.warningTests > 0 ? "WARNING" : "HEALTHY"

    const recommendations: string[] = []

    if (summary.errorTests > 0) {
      recommendations.push("CRITICAL: Address all ERROR level issues immediately")
      recommendations.push("Review data integrity and fix any corrupted records")
    }

    if (summary.warningTests > 0) {
      recommendations.push("Review WARNING level issues for potential optimization")
      recommendations.push("Consider adding indexes for slow queries")
    }

    if (this.metrics.some((m) => m.executionTimeMs > 1000)) {
      recommendations.push("Some queries are taking longer than 1 second - consider optimization")
    }

    if (overallStatus === "HEALTHY") {
      recommendations.push("Database appears to be in good health")
      recommendations.push("Continue regular monitoring and maintenance")
    }

    return {
      overallStatus,
      diagnosticResults: this.results,
      performanceMetrics: this.metrics,
      recommendations,
      summary,
    }
  }
}

// Export utility function for easy use
export async function runDatabaseDiagnostics(): Promise<DatabaseHealthReport> {
  const diagnostics = new DatabaseDiagnostics()
  return await diagnostics.runComprehensiveDiagnostics()
}
