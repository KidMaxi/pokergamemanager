export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          created_at: string
          updated_at: string
          is_admin: boolean
          all_time_profit_loss: number
          games_played: number
          total_wins: number
          win_ratio: number
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          created_at?: string
          updated_at?: string
          is_admin?: boolean
          all_time_profit_loss?: number
          games_played?: number
          total_wins?: number
          win_ratio?: number
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          created_at?: string
          updated_at?: string
          is_admin?: boolean
          all_time_profit_loss?: number
          games_played?: number
          total_wins?: number
          win_ratio?: number
        }
      }
      game_sessions: {
        Row: {
          id: string
          user_id: string
          name: string
          start_time: string
          end_time: string | null
          status: string
          point_to_cash_rate: number
          players_data: Json
          invited_users: string[] | null
          game_metadata: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          user_id: string
          name: string
          start_time: string
          end_time?: string | null
          status: string
          point_to_cash_rate: number
          players_data: Json
          invited_users?: string[] | null
          game_metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          start_time?: string
          end_time?: string | null
          status?: string
          point_to_cash_rate?: number
          players_data?: Json
          invited_users?: string[] | null
          game_metadata?: Json | null
          created_at?: string
          updated_at?: string
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
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          sender_id: string
          receiver_id: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          sender_id?: string
          receiver_id?: string
          status?: string
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
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          game_session_id: string
          inviter_id: string
          invitee_id: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          game_session_id?: string
          inviter_id?: string
          invitee_id?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      user_stats_with_winrate: {
        Row: {
          id: string
          full_name: string | null
          email: string
          games_played: number
          total_wins: number
          total_losses: number
          win_ratio: number
          all_time_profit_loss: number
          avg_profit_per_game: number
          created_at: string
          updated_at: string
        }
      }
    }
    Functions: {
      update_user_game_stats: {
        Args: {
          user_id_param: string
          profit_loss_amount: number
        }
        Returns: Json
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
      recalculate_all_win_ratios: {
        Args: {}
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
