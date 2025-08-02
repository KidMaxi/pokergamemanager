export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
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
          full_name?: string | null
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
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
          is_admin?: boolean
          preferences?: Json
          all_time_profit_loss?: number
          games_played?: number
          last_game_date?: string | null
        }
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
        }
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
        }
        Insert: {
          id?: string
          game_session_id: string
          inviter_id: string
          invitee_id: string
          status?: "pending" | "accepted" | "declined"
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          game_session_id?: string
          inviter_id?: string
          invitee_id?: string
          status?: "pending" | "accepted" | "declined"
          created_at?: string
          updated_at?: string
        }
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
    }
    Enums: {
      [_ in never]: never
    }
  }
}
