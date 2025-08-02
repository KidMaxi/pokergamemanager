export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string
          avatar_url: string | null
          created_at: string
          updated_at: string
          is_admin: boolean
          preferences: Json
          all_time_profit_loss: number
          games_played: number
          last_game_date: string | null
        }
        Insert: {
          id: string
          email: string
          full_name?: string
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
          is_admin?: boolean
          preferences?: Json
          all_time_profit_loss?: number
          games_played?: number
          last_game_date?: string | null
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
          is_admin?: boolean
          preferences?: Json
          all_time_profit_loss?: number
          games_played?: number
          last_game_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      game_sessions: {
        Row: {
          id: string
          user_id: string
          name: string
          start_time: string
          end_time: string | null
          status: "active" | "completed" | "pending_close"
          point_to_cash_rate: number
          players_data: Json
          game_metadata: Json
          created_at: string
          updated_at: string
          invited_users: string[] | null
          buy_in_amount: number
          created_by: string
          ended_at: string | null
          location: string | null
          max_players: number | null
          is_active: boolean
          started_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          start_time?: string
          end_time?: string | null
          status?: "active" | "completed" | "pending_close"
          point_to_cash_rate?: number
          players_data?: Json
          game_metadata?: Json
          created_at?: string
          updated_at?: string
          invited_users?: string[] | null
          buy_in_amount: number
          created_by: string
          ended_at?: string | null
          location?: string | null
          max_players?: number | null
          is_active?: boolean
          started_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          start_time?: string
          end_time?: string | null
          status?: "active" | "completed" | "pending_close"
          point_to_cash_rate?: number
          players_data?: Json
          game_metadata?: Json
          created_at?: string
          updated_at?: string
          invited_users?: string[] | null
          buy_in_amount?: number
          created_by?: string
          ended_at?: string | null
          location?: string | null
          max_players?: number | null
          is_active?: boolean
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          id: string
          user_id: string
          friend_id: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          friend_id: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          friend_id?: string
          created_at?: string
        }
      }
      friend_requests: {
        Row: {
          id: string
          sender_id: string
          receiver_id: string
          status: "pending" | "accepted" | "declined"
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          sender_id: string
          receiver_id: string
          status?: "pending" | "accepted" | "declined"
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          sender_id?: string
          receiver_id?: string
          status?: "pending" | "accepted" | "declined"
          created_at?: string
          updated_at?: string
        }
      }
      game_invitations: {
        Row: {
          id: string
          game_session_id: string
          inviter_id: string
          invitee_id: string
          status: "pending" | "accepted" | "declined"
          created_at: string
          updated_at: string
          game_id: string
          invited_by: string
          invited_user: string
        }
        Insert: {
          id?: string
          game_session_id: string
          inviter_id: string
          invitee_id: string
          status?: "pending" | "accepted" | "declined"
          created_at?: string
          updated_at?: string
          game_id: string
          invited_by: string
          invited_user: string
        }
        Update: {
          id?: string
          game_session_id?: string
          inviter_id?: string
          invitee_id?: string
          status?: "pending" | "accepted" | "declined"
          created_at?: string
          updated_at?: string
          game_id?: string
          invited_by?: string
          invited_user?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_invitations_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_invitations_invited_user_fkey"
            columns: ["invited_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_results: {
        Row: {
          buy_in_amount: number
          cash_out_amount: number | null
          created_at: string
          game_id: string
          id: string
          player_name: string
          profit_loss: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          buy_in_amount: number
          cash_out_amount?: number | null
          created_at?: string
          game_id: string
          id?: string
          player_name: string
          profit_loss?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          buy_in_amount?: number
          cash_out_amount?: number | null
          created_at?: string
          game_id?: string
          id?: string
          player_name?: string
          profit_loss?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_results_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_statistics: {
        Row: {
          id: string
          user_id: string
          total_games_played: number
          total_buy_ins: number
          total_cash_outs: number
          net_profit_loss: number
          biggest_win: number
          biggest_loss: number
          win_rate: number
          roi: number
          average_session_length_minutes: number
          total_session_time_hours: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          total_games_played?: number
          total_buy_ins?: number
          total_cash_outs?: number
          net_profit_loss?: number
          biggest_win?: number
          biggest_loss?: number
          win_rate?: number
          roi?: number
          average_session_length_minutes?: number
          total_session_time_hours?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          total_games_played?: number
          total_buy_ins?: number
          total_cash_outs?: number
          net_profit_loss?: number
          biggest_win?: number
          biggest_loss?: number
          win_rate?: number
          roi?: number
          average_session_length_minutes?: number
          total_session_time_hours?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_statistics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friends: {
        Row: {
          created_at: string
          id: string
          requester_id: string
          status: string
          target_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          target_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          target_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friends_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friends_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      update_user_game_stats: {
        Args: {
          user_id_param: string
          profit_loss_amount: number
        }
        Returns: void
      }
      accept_friend_request: {
        Args: {
          request_id: string
        }
        Returns: void
      }
      remove_friendship: {
        Args: {
          friend_user_id: string
        }
        Returns: void
      }
      update_user_statistics_after_game: {
        Args: {
          p_user_id: string
          p_total_buy_in: number
          p_total_cash_out: number
          p_session_length_minutes: number
        }
        Returns: boolean
      }
      get_user_statistics: {
        Args: {
          p_user_id: string
        }
        Returns: {
          user_id: string
          total_games_played: number
          total_buy_ins: number
          total_cash_outs: number
          net_profit_loss: number
          biggest_win: number
          biggest_loss: number
          win_rate: number
          roi: number
          average_session_length_minutes: number
          total_session_time_hours: number
          profit_per_hour: number
          created_at: string
          updated_at: string
        }[]
      }
      get_statistics_leaderboard: {
        Args: {
          p_metric?: string
          p_limit?: number
        }
        Returns: {
          user_id: string
          full_name: string
          email: string
          metric_value: number
          total_games_played: number
          win_rate: number
        }[]
      }
      migrate_profile_stats_to_user_statistics: {
        Args: {}
        Returns: number
      }
      accept_game_invitation_v2: {
        Args: {
          p_invitation_id: string
        }
        Returns: {
          success: boolean
          message: string
          game_id: string
        }[]
      }
      get_game_with_participants: {
        Args: {
          p_game_id: string
        }
        Returns: {
          id: string
          name: string
          buy_in_amount: number
          location: string
          max_players: number
          is_active: boolean
          created_by: string
          created_at: string
          started_at: string
          ended_at: string
          updated_at: string
          players: Json
          creator_name: string
          creator_email: string
          participants: Json
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    ? (Database["public"]["Tables"] & Database["public"]["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends keyof Database["public"]["Tables"] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends keyof Database["public"]["Tables"] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
    ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends keyof Database["public"]["Enums"] | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
    ? Database["public"]["Enums"][PublicEnumNameOrOptions]
    : never
