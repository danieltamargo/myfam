export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          family_id: string | null
          id: string
          metadata: Json | null
          module_name: string | null
          resource_id: string | null
          resource_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          family_id?: string | null
          id?: string
          metadata?: Json | null
          module_name?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          family_id?: string | null
          id?: string
          metadata?: Json | null
          module_name?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_event_participants: {
        Row: {
          created_at: string
          event_id: string
          family_id: string
          response: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          family_id: string
          response?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          family_id?: string
          response?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_participants_family_id_event_id_fkey"
            columns: ["family_id", "event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["family_id", "id"]
          },
          {
            foreignKeyName: "calendar_event_participants_family_id_user_id_fkey"
            columns: ["family_id", "user_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["family_id", "user_id"]
          },
          {
            foreignKeyName: "calendar_event_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_event_reminders: {
        Row: {
          created_at: string
          delivered_at: string | null
          event_id: string
          id: string
          minutes_before: number
          occurrence_start: string
          recipient_id: string
          scheduled_for: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          event_id: string
          id?: string
          minutes_before: number
          occurrence_start: string
          recipient_id: string
          scheduled_for: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          event_id?: string
          id?: string
          minutes_before?: number
          occurrence_start?: string
          recipient_id?: string
          scheduled_for?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_reminders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_reminders_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_reminders_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          created_at: string
          created_by: string
          description: string | null
          ends_at: string
          family_id: string
          id: string
          recurrence_count: number | null
          recurrence_frequency: string
          recurrence_interval: number
          recurrence_until: string | null
          starts_at: string
          timezone: string
          title: string
          updated_at: string
          version: number
          visibility: string
          wishlist_category_id: string | null
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          created_by: string
          description?: string | null
          ends_at: string
          family_id: string
          id?: string
          recurrence_count?: number | null
          recurrence_frequency?: string
          recurrence_interval?: number
          recurrence_until?: string | null
          starts_at: string
          timezone: string
          title: string
          updated_at?: string
          version?: number
          visibility?: string
          wishlist_category_id?: string | null
        }
        Update: {
          all_day?: boolean
          created_at?: string
          created_by?: string
          description?: string | null
          ends_at?: string
          family_id?: string
          id?: string
          recurrence_count?: number | null
          recurrence_frequency?: string
          recurrence_interval?: number
          recurrence_until?: string | null
          starts_at?: string
          timezone?: string
          title?: string
          updated_at?: string
          version?: number
          visibility?: string
          wishlist_category_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_family_id_wishlist_category_id_fkey"
            columns: ["family_id", "wishlist_category_id"]
            isOneToOne: false
            referencedRelation: "gift_event_categories"
            referencedColumns: ["family_id", "id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          collection_id: string
          color: string | null
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          collection_id: string
          color?: string | null
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          collection_id?: string
          color?: string | null
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "expense_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_collection_members: {
        Row: {
          collection_id: string
          invited_by: string | null
          joined_at: string | null
          removed_at: string | null
          role: string
          status: string
          user_id: string
        }
        Insert: {
          collection_id: string
          invited_by?: string | null
          joined_at?: string | null
          removed_at?: string | null
          role: string
          status?: string
          user_id: string
        }
        Update: {
          collection_id?: string
          invited_by?: string | null
          joined_at?: string | null
          removed_at?: string | null
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_collection_members_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "expense_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_collection_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_collection_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_collection_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_collection_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_collections: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          currency: string
          description: string | null
          family_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          currency?: string
          description?: string | null
          family_id: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          description?: string | null
          family_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_collections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_collections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_collections_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_splits: {
        Row: {
          amount: number
          collection_id: string
          expense_id: string
          user_id: string
        }
        Insert: {
          amount: number
          collection_id: string
          expense_id: string
          user_id: string
        }
        Update: {
          amount?: number
          collection_id?: string
          expense_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_splits_collection_id_expense_id_fkey"
            columns: ["collection_id", "expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["collection_id", "id"]
          },
          {
            foreignKeyName: "expense_splits_collection_id_user_id_fkey"
            columns: ["collection_id", "user_id"]
            isOneToOne: false
            referencedRelation: "expense_collection_members"
            referencedColumns: ["collection_id", "user_id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category_id: string | null
          collection_id: string
          created_at: string
          created_by: string
          description: string
          id: string
          notes: string | null
          occurred_on: string
          paid_by: string
          receipt_path: string | null
          recurring_occurrence_on: string | null
          recurring_rule_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          amount: number
          category_id?: string | null
          collection_id: string
          created_at?: string
          created_by: string
          description: string
          id?: string
          notes?: string | null
          occurred_on: string
          paid_by: string
          receipt_path?: string | null
          recurring_occurrence_on?: string | null
          recurring_rule_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          amount?: number
          category_id?: string | null
          collection_id?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          notes?: string | null
          occurred_on?: string
          paid_by?: string
          receipt_path?: string | null
          recurring_occurrence_on?: string | null
          recurring_rule_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "expenses_collection_id_category_id_fkey"
            columns: ["collection_id", "category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["collection_id", "id"]
          },
          {
            foreignKeyName: "expenses_collection_id_created_by_fkey"
            columns: ["collection_id", "created_by"]
            isOneToOne: false
            referencedRelation: "expense_collection_members"
            referencedColumns: ["collection_id", "user_id"]
          },
          {
            foreignKeyName: "expenses_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "expense_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_collection_id_paid_by_fkey"
            columns: ["collection_id", "paid_by"]
            isOneToOne: false
            referencedRelation: "expense_collection_members"
            referencedColumns: ["collection_id", "user_id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_recurring_rule_id_fkey"
            columns: ["recurring_rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_expense_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      external_connections: {
        Row: {
          access_token: string | null
          connected_at: string | null
          expires_at: string | null
          family_id: string | null
          id: string
          metadata: Json | null
          provider: string
          refresh_token: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          access_token?: string | null
          connected_at?: string | null
          expires_at?: string | null
          family_id?: string | null
          id?: string
          metadata?: Json | null
          provider: string
          refresh_token?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string | null
          connected_at?: string | null
          expires_at?: string | null
          family_id?: string | null
          id?: string
          metadata?: Json | null
          provider?: string
          refresh_token?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_connections_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "families_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "families_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_invitations: {
        Row: {
          created_at: string | null
          family_id: string | null
          id: string
          invited_by: string | null
          invited_user_id: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          family_id?: string | null
          id?: string
          invited_by?: string | null
          invited_user_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          family_id?: string | null
          id?: string
          invited_by?: string | null
          invited_user_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_invitations_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_invitations_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_invitations_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          family_id: string | null
          id: string
          joined_at: string | null
          role: string
          user_id: string | null
        }
        Insert: {
          family_id?: string | null
          id?: string
          joined_at?: string | null
          role?: string
          user_id?: string | null
        }
        Update: {
          family_id?: string | null
          id?: string
          joined_at?: string | null
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_modules: {
        Row: {
          enabled: boolean | null
          enabled_at: string | null
          enabled_by: string | null
          family_id: string | null
          id: string
          module_name: string
          settings: Json | null
        }
        Insert: {
          enabled?: boolean | null
          enabled_at?: string | null
          enabled_by?: string | null
          family_id?: string | null
          id?: string
          module_name: string
          settings?: Json | null
        }
        Update: {
          enabled?: boolean | null
          enabled_at?: string | null
          enabled_by?: string | null
          family_id?: string | null
          id?: string
          module_name?: string
          settings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "family_modules_enabled_by_fkey"
            columns: ["enabled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_modules_enabled_by_fkey"
            columns: ["enabled_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_modules_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      game_achievements: {
        Row: {
          achievement_key: string
          family_id: string | null
          game_type: Database["public"]["Enums"]["game_type"] | null
          id: string
          metadata: Json | null
          session_id: string | null
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_key: string
          family_id?: string | null
          game_type?: Database["public"]["Enums"]["game_type"] | null
          id?: string
          metadata?: Json | null
          session_id?: string | null
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_key?: string
          family_id?: string | null
          game_type?: Database["public"]["Enums"]["game_type"] | null
          id?: string
          metadata?: Json | null
          session_id?: string | null
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_achievements_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_achievements_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_moves: {
        Row: {
          created_at: string
          id: string
          move_data: Json
          move_number: number
          player_id: string | null
          player_number: number
          session_id: string
          state_after: Json
          time_taken_ms: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          move_data: Json
          move_number: number
          player_id?: string | null
          player_number: number
          session_id: string
          state_after: Json
          time_taken_ms?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          move_data?: Json
          move_number?: number
          player_id?: string | null
          player_number?: number
          session_id?: string
          state_after?: Json
          time_taken_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_moves_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_moves_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_moves_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      game_rooms: {
        Row: {
          config: Json | null
          created_at: string
          created_by: string
          family_id: string | null
          finished_at: string | null
          game_type: Database["public"]["Enums"]["game_type"]
          id: string
          is_public: boolean
          join_code: string | null
          max_players: number
          name: string
          started_at: string | null
          status: Database["public"]["Enums"]["room_status"]
        }
        Insert: {
          config?: Json | null
          created_at?: string
          created_by: string
          family_id?: string | null
          finished_at?: string | null
          game_type: Database["public"]["Enums"]["game_type"]
          id?: string
          is_public?: boolean
          join_code?: string | null
          max_players?: number
          name: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["room_status"]
        }
        Update: {
          config?: Json | null
          created_at?: string
          created_by?: string
          family_id?: string | null
          finished_at?: string | null
          game_type?: Database["public"]["Enums"]["game_type"]
          id?: string
          is_public?: boolean
          join_code?: string | null
          max_players?: number
          name?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["room_status"]
        }
        Relationships: [
          {
            foreignKeyName: "game_rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_rooms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_rooms_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      game_sessions: {
        Row: {
          duration_seconds: number | null
          final_state: Json | null
          finished_at: string | null
          game_state: Json
          game_type: Database["public"]["Enums"]["game_type"]
          has_bots: boolean
          id: string
          is_draw: boolean
          room_id: string
          started_at: string
          status: string
          winner_id: string | null
          winner_player_number: number | null
        }
        Insert: {
          duration_seconds?: number | null
          final_state?: Json | null
          finished_at?: string | null
          game_state?: Json
          game_type: Database["public"]["Enums"]["game_type"]
          has_bots?: boolean
          id?: string
          is_draw?: boolean
          room_id: string
          started_at?: string
          status?: string
          winner_id?: string | null
          winner_player_number?: number | null
        }
        Update: {
          duration_seconds?: number | null
          final_state?: Json | null
          finished_at?: string | null
          game_state?: Json
          game_type?: Database["public"]["Enums"]["game_type"]
          has_bots?: boolean
          id?: string
          is_draw?: boolean
          room_id?: string
          started_at?: string
          status?: string
          winner_id?: string | null
          winner_player_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_stats: {
        Row: {
          average_move_time_ms: number | null
          best_win_streak: number
          current_win_streak: number
          elo_rating: number | null
          family_id: string | null
          game_specific_stats: Json | null
          game_type: Database["public"]["Enums"]["game_type"]
          games_drawn: number
          games_lost: number
          games_played: number
          games_won: number
          id: string
          last_played_at: string | null
          total_time_played_seconds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          average_move_time_ms?: number | null
          best_win_streak?: number
          current_win_streak?: number
          elo_rating?: number | null
          family_id?: string | null
          game_specific_stats?: Json | null
          game_type: Database["public"]["Enums"]["game_type"]
          games_drawn?: number
          games_lost?: number
          games_played?: number
          games_won?: number
          id?: string
          last_played_at?: string | null
          total_time_played_seconds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          average_move_time_ms?: number | null
          best_win_streak?: number
          current_win_streak?: number
          elo_rating?: number | null
          family_id?: string | null
          game_specific_stats?: Json | null
          game_type?: Database["public"]["Enums"]["game_type"]
          games_drawn?: number
          games_lost?: number
          games_played?: number
          games_won?: number
          id?: string
          last_played_at?: string | null
          total_time_played_seconds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_stats_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_comment_mentions: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          mentioned_user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          mentioned_user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          mentioned_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "gift_item_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_comment_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_comment_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_event_categories: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string | null
          event_date: string | null
          family_id: string
          icon: string | null
          id: string
          is_system: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          event_date?: string | null
          family_id: string
          icon?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          event_date?: string | null
          family_id?: string
          icon?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_event_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_event_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_event_categories_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_item_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          item_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          item_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_item_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_item_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_item_comments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "gift_items"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_item_events: {
        Row: {
          created_at: string | null
          event_category_id: string
          id: string
          item_id: string
        }
        Insert: {
          created_at?: string | null
          event_category_id: string
          id?: string
          item_id: string
        }
        Update: {
          created_at?: string | null
          event_category_id?: string
          id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_item_events_event_category_id_fkey"
            columns: ["event_category_id"]
            isOneToOne: false
            referencedRelation: "gift_event_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_item_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "gift_items"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_items: {
        Row: {
          created_at: string | null
          currency: string
          description: string | null
          desired_quantity: number
          family_id: string
          id: string
          image_url: string | null
          links: string[] | null
          name: string
          owner_id: string
          price: number | null
          priority: number | null
          status: string
          updated_at: string | null
          version: number
        }
        Insert: {
          created_at?: string | null
          currency?: string
          description?: string | null
          desired_quantity?: number
          family_id: string
          id?: string
          image_url?: string | null
          links?: string[] | null
          name: string
          owner_id: string
          price?: number | null
          priority?: number | null
          status?: string
          updated_at?: string | null
          version?: number
        }
        Update: {
          created_at?: string | null
          currency?: string
          description?: string | null
          desired_quantity?: number
          family_id?: string
          id?: string
          image_url?: string | null
          links?: string[] | null
          name?: string
          owner_id?: string
          price?: number | null
          priority?: number | null
          status?: string
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "gift_items_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_purchases: {
        Row: {
          id: string
          item_id: string
          notes: string | null
          purchased_at: string | null
          purchased_by: string
          quantity_purchased: number
        }
        Insert: {
          id?: string
          item_id: string
          notes?: string | null
          purchased_at?: string | null
          purchased_by: string
          quantity_purchased?: number
        }
        Update: {
          id?: string
          item_id?: string
          notes?: string | null
          purchased_at?: string | null
          purchased_by?: string
          quantity_purchased?: number
        }
        Relationships: [
          {
            foreignKeyName: "gift_purchases_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "gift_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_purchases_purchased_by_fkey"
            columns: ["purchased_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_purchases_purchased_by_fkey"
            columns: ["purchased_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_reservations: {
        Row: {
          id: string
          item_id: string
          notes: string | null
          quantity: number
          reserved_at: string | null
          reserved_by: string
          status: string
        }
        Insert: {
          id?: string
          item_id: string
          notes?: string | null
          quantity?: number
          reserved_at?: string | null
          reserved_by: string
          status?: string
        }
        Update: {
          id?: string
          item_id?: string
          notes?: string | null
          quantity?: number
          reserved_at?: string | null
          reserved_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_reservations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "gift_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_reservations_reserved_by_fkey"
            columns: ["reserved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_reservations_reserved_by_fkey"
            columns: ["reserved_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          family_id: string | null
          id: string
          metadata: Json | null
          notable_id: string
          notable_type: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          family_id?: string | null
          id?: string
          metadata?: Json | null
          notable_id: string
          notable_type: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          family_id?: string | null
          id?: string
          metadata?: Json | null
          notable_id?: string
          notable_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string | null
          read: boolean
          reference_id: string | null
          reference_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean
          reference_id?: string | null
          reference_type?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          read?: boolean
          reference_id?: string | null
          reference_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_family_id: string | null
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          active_family_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          active_family_id?: string | null
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_family_id_fkey"
            columns: ["active_family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expense_rules: {
        Row: {
          active: boolean
          amount: number
          category_id: string | null
          collection_id: string
          created_at: string
          created_by: string
          day_of_month: number
          description: string
          frequency: string
          id: string
          next_run: string
          notes: string | null
          paid_by: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount: number
          category_id?: string | null
          collection_id: string
          created_at?: string
          created_by: string
          day_of_month: number
          description: string
          frequency: string
          id?: string
          next_run: string
          notes?: string | null
          paid_by: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          category_id?: string | null
          collection_id?: string
          created_at?: string
          created_by?: string
          day_of_month?: number
          description?: string
          frequency?: string
          id?: string
          next_run?: string
          notes?: string | null
          paid_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expense_rules_collection_id_category_id_fkey"
            columns: ["collection_id", "category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["collection_id", "id"]
          },
          {
            foreignKeyName: "recurring_expense_rules_collection_id_created_by_fkey"
            columns: ["collection_id", "created_by"]
            isOneToOne: false
            referencedRelation: "expense_collection_members"
            referencedColumns: ["collection_id", "user_id"]
          },
          {
            foreignKeyName: "recurring_expense_rules_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "expense_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expense_rules_collection_id_paid_by_fkey"
            columns: ["collection_id", "paid_by"]
            isOneToOne: false
            referencedRelation: "expense_collection_members"
            referencedColumns: ["collection_id", "user_id"]
          },
          {
            foreignKeyName: "recurring_expense_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expense_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expense_rules_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expense_rules_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expense_splits: {
        Row: {
          amount: number
          collection_id: string
          rule_id: string
          user_id: string
        }
        Insert: {
          amount: number
          collection_id: string
          rule_id: string
          user_id: string
        }
        Update: {
          amount?: number
          collection_id?: string
          rule_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expense_splits_collection_id_rule_id_fkey"
            columns: ["collection_id", "rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_expense_rules"
            referencedColumns: ["collection_id", "id"]
          },
          {
            foreignKeyName: "recurring_expense_splits_collection_id_user_id_fkey"
            columns: ["collection_id", "user_id"]
            isOneToOne: false
            referencedRelation: "expense_collection_members"
            referencedColumns: ["collection_id", "user_id"]
          },
        ]
      }
      room_participants: {
        Row: {
          bot_difficulty: string | null
          guest_identifier: string | null
          guest_name: string | null
          id: string
          is_active: boolean
          is_bot: boolean
          is_ready: boolean
          joined_at: string
          left_at: string | null
          player_number: number | null
          room_id: string
          user_id: string | null
        }
        Insert: {
          bot_difficulty?: string | null
          guest_identifier?: string | null
          guest_name?: string | null
          id?: string
          is_active?: boolean
          is_bot?: boolean
          is_ready?: boolean
          joined_at?: string
          left_at?: string | null
          player_number?: number | null
          room_id: string
          user_id?: string | null
        }
        Update: {
          bot_difficulty?: string | null
          guest_identifier?: string | null
          guest_name?: string | null
          id?: string
          is_active?: boolean
          is_bot?: boolean
          is_ready?: boolean
          joined_at?: string
          left_at?: string | null
          player_number?: number | null
          room_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_profiles: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          id: string | null
        }
        Insert: {
          avatar_url?: string | null
          display_name?: string | null
          id?: string | null
        }
        Update: {
          avatar_url?: string | null
          display_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_expense_collection_invitation: {
        Args: { p_collection_id: string }
        Returns: undefined
      }
      accept_family_invitation: {
        Args: { p_invitation_id: string }
        Returns: string
      }
      add_bot_to_room: {
        Args: { p_difficulty?: string; p_room_id: string }
        Returns: string
      }
      change_expense_collection_role: {
        Args: { p_collection_id: string; p_role: string; p_user_id: string }
        Returns: undefined
      }
      create_calendar_event: {
        Args: {
          p_all_day: boolean
          p_description: string
          p_ends_at: string
          p_family_id: string
          p_participant_ids: string[]
          p_recurrence_count?: number
          p_recurrence_frequency?: string
          p_recurrence_interval?: number
          p_recurrence_until?: string
          p_reminder_minutes?: number
          p_starts_at: string
          p_timezone: string
          p_title: string
          p_visibility: string
          p_wishlist_category_id?: string
        }
        Returns: string
      }
      create_expense_collection: {
        Args: {
          p_currency?: string
          p_description?: string
          p_family_id: string
          p_name: string
        }
        Returns: string
      }
      create_expense_with_splits: {
        Args: {
          p_amount: number
          p_category_id: string
          p_collection_id: string
          p_description: string
          p_notes: string
          p_occurred_on: string
          p_paid_by: string
          p_receipt_path: string
          p_splits: Json
        }
        Returns: string
      }
      create_family: { Args: { p_name: string }; Returns: string }
      create_recurring_expense_rule: {
        Args: {
          p_amount: number
          p_category_id: string
          p_collection_id: string
          p_description: string
          p_frequency: string
          p_next_run: string
          p_notes: string
          p_paid_by: string
          p_splits: Json
        }
        Returns: string
      }
      delete_calendar_event: {
        Args: { p_event_id: string; p_version: number }
        Returns: undefined
      }
      delete_family: { Args: { p_family_id: string }; Returns: undefined }
      extract_mentions_from_comment: {
        Args: { comment_text: string }
        Returns: string[]
      }
      generate_join_code: { Args: never; Returns: string }
      get_calendar_occurrences: {
        Args: {
          p_family_id: string
          p_from: string
          p_participant_id?: string
          p_to: string
        }
        Returns: {
          all_day: boolean
          created_by: string
          description: string
          event_id: string
          family_id: string
          occurrence_end: string
          occurrence_index: number
          occurrence_start: string
          participant_ids: string[]
          timezone: string
          title: string
          version: number
          visibility: string
          wishlist_category_id: string
        }[]
      }
      get_expense_balances: {
        Args: { p_collection_id: string; p_from: string; p_to: string }
        Returns: {
          balance: number
          owed: number
          paid: number
          user_id: string
        }[]
      }
      get_expense_collection_invitations: {
        Args: never
        Returns: {
          collection_id: string
          collection_name: string
          currency: string
          description: string
          family_id: string
          invited_by: string
          role: string
        }[]
      }
      get_expense_dashboard: {
        Args: {
          p_category_id?: string
          p_collection_id: string
          p_from: string
          p_granularity?: string
          p_paid_by?: string
          p_previous_from: string
          p_previous_to: string
          p_to: string
        }
        Returns: Json
      }
      get_game_leaderboard: {
        Args: {
          p_family_id: string
          p_game_type: Database["public"]["Enums"]["game_type"]
          p_limit?: number
        }
        Returns: {
          avatar_url: string
          best_win_streak: number
          display_name: string
          elo_rating: number
          games_played: number
          games_won: number
          rank: number
          user_id: string
          win_rate: number
        }[]
      }
      get_item_purchased_quantity: {
        Args: { item_uuid: string }
        Returns: number
      }
      get_managed_family_invitations: {
        Args: { p_family_id: string }
        Returns: {
          created_at: string
          family_id: string
          id: string
          invited_by: string
          invited_email: string
          invited_user_id: string
          status: string
          updated_at: string
        }[]
      }
      get_my_profile: {
        Args: never
        Returns: {
          active_family_id: string
          avatar_url: string
          created_at: string
          display_name: string
          email: string
          id: string
          updated_at: string
        }[]
      }
      get_unread_notification_count: {
        Args: { user_uuid: string }
        Returns: number
      }
      has_user_purchased_item: {
        Args: { item_uuid: string; user_uuid: string }
        Returns: boolean
      }
      invite_expense_collection_member: {
        Args: { p_collection_id: string; p_role?: string; p_user_id: string }
        Returns: undefined
      }
      invite_family_member: {
        Args: { p_email: string; p_family_id: string }
        Returns: string
      }
      is_room_owner: {
        Args: { p_room_id: string; p_user_id: string }
        Returns: boolean
      }
      leave_expense_collection: {
        Args: { p_collection_id: string }
        Returns: undefined
      }
      process_calendar_reminders: {
        Args: { p_limit?: number; p_now?: string }
        Returns: number
      }
      process_due_recurring_expenses: {
        Args: { p_as_of?: string }
        Returns: number
      }
      purchase_gift_item: {
        Args: { p_item_id: string; p_quantity?: number }
        Returns: string
      }
      reject_family_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      release_gift_item: {
        Args: { p_coordination_type?: string; p_item_id: string }
        Returns: undefined
      }
      remove_family_member: {
        Args: { p_family_id: string; p_target_user_id: string }
        Returns: undefined
      }
      reserve_gift_item: {
        Args: { p_item_id: string; p_quantity?: number; p_status?: string }
        Returns: string
      }
      revoke_expense_collection_member: {
        Args: { p_collection_id: string; p_user_id: string }
        Returns: undefined
      }
      set_recurring_expense_rule_active: {
        Args: { p_active: boolean; p_collection_id: string; p_rule_id: string }
        Returns: undefined
      }
      transfer_expense_collection_ownership: {
        Args: { p_collection_id: string; p_new_owner_id: string }
        Returns: undefined
      }
      transfer_family_ownership: {
        Args: { p_family_id: string; p_target_user_id: string }
        Returns: undefined
      }
      update_calendar_event: {
        Args: {
          p_all_day: boolean
          p_description: string
          p_ends_at: string
          p_event_id: string
          p_participant_ids: string[]
          p_recurrence_count?: number
          p_recurrence_frequency?: string
          p_recurrence_interval?: number
          p_recurrence_until?: string
          p_reminder_minutes?: number
          p_starts_at: string
          p_timezone: string
          p_title: string
          p_version: number
          p_visibility: string
          p_wishlist_category_id?: string
        }
        Returns: undefined
      }
      update_expense_with_splits: {
        Args: {
          p_amount: number
          p_category_id: string
          p_collection_id: string
          p_description: string
          p_expense_id: string
          p_notes: string
          p_occurred_on: string
          p_paid_by: string
          p_receipt_path: string
          p_splits: Json
          p_version: number
        }
        Returns: undefined
      }
    }
    Enums: {
      game_type: "tic_tac_toe" | "connect_four" | "wordle"
      room_status: "waiting" | "in_progress" | "finished" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      game_type: ["tic_tac_toe", "connect_four", "wordle"],
      room_status: ["waiting", "in_progress", "finished", "cancelled"],
    },
  },
} as const
