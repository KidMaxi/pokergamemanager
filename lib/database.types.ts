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
    }
    Enums: {
      [_ in never]: never
    }
  }
}
