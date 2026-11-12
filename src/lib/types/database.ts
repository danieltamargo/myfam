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
      family_member_birthdays: {
        Row: { family_id: string; user_id: string; month: number; day: number }
        Insert: { family_id: string; user_id: string; month: number; day: number }
        Update: { family_id?: string; user_id?: string; month?: number; day?: number }
        Relationships: []
      }
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
      calendar_external_event_links: {
        Row: {
          conflict: string | null
          connection_id: string
          direction: string
          local_event_id: string | null
          local_version: number
          remote_deleted: boolean
          remote_etag: string
          remote_event_id: string
        }
        Insert: {
          conflict?: string | null
          connection_id: string
          direction: string
          local_event_id?: string | null
          local_version: number
          remote_deleted?: boolean
          remote_etag: string
          remote_event_id: string
        }
        Update: {
          conflict?: string | null
          connection_id?: string
          direction?: string
          local_event_id?: string | null
          local_version?: number
          remote_deleted?: boolean
          remote_etag?: string
          remote_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_external_event_links_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "external_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_external_event_links_local_event_id_fkey"
            columns: ["local_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_oauth_states: {
        Row: {
          expires_at: string
          family_id: string
          nonce_hash: string
          user_id: string
        }
        Insert: {
          expires_at: string
          family_id: string
          nonce_hash: string
          user_id: string
        }
        Update: {
          expires_at?: string
          family_id?: string
          nonce_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_oauth_states_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_oauth_states_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_oauth_states_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
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
      expense_collection_event_links: {
        Row: {
          collection_id: string
          event_id: string
          family_id: string
        }
        Insert: {
          collection_id: string
          event_id: string
          family_id: string
        }
        Update: {
          collection_id?: string
          event_id?: string
          family_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_collection_event_links_family_id_collection_id_fkey"
            columns: ["family_id", "collection_id"]
            isOneToOne: false
            referencedRelation: "expense_collections"
            referencedColumns: ["family_id", "id"]
          },
          {
            foreignKeyName: "expense_collection_event_links_family_id_event_id_fkey"
            columns: ["family_id", "event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["family_id", "id"]
          },
        ]
      }
      expense_event_links: {
        Row: { expense_id: string; collection_id: string; family_id: string; event_id: string }
        Insert: { expense_id: string; collection_id: string; family_id: string; event_id: string }
        Update: { expense_id?: string; collection_id?: string; family_id?: string; event_id?: string }
        Relationships: [
          { foreignKeyName: "expense_event_links_collection_id_expense_id_fkey"; columns: ["collection_id", "expense_id"]; isOneToOne: false; referencedRelation: "expenses"; referencedColumns: ["collection_id", "id"] },
          { foreignKeyName: "expense_event_links_family_id_collection_id_fkey"; columns: ["family_id", "collection_id"]; isOneToOne: false; referencedRelation: "expense_collections"; referencedColumns: ["family_id", "id"] },
          { foreignKeyName: "expense_event_links_family_id_event_id_fkey"; columns: ["family_id", "event_id"]; isOneToOne: false; referencedRelation: "calendar_events"; referencedColumns: ["family_id", "id"] }
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
      expense_settlements: {
        Row: {
          amount_cents: number
          collection_id: string
          created_at: string
          created_by: string
          from_user_id: string
          id: string
          idempotency_key: string
          to_user_id: string
        }
        Insert: {
          amount_cents: number
          collection_id: string
          created_at?: string
          created_by: string
          from_user_id: string
          id?: string
          idempotency_key: string
          to_user_id: string
        }
        Update: {
          amount_cents?: number
          collection_id?: string
          created_at?: string
          created_by?: string
          from_user_id?: string
          id?: string
          idempotency_key?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_settlements_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "expense_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_settlements_collection_id_from_user_id_fkey"
            columns: ["collection_id", "from_user_id"]
            isOneToOne: false
            referencedRelation: "expense_collection_members"
            referencedColumns: ["collection_id", "user_id"]
          },
          {
            foreignKeyName: "expense_settlements_collection_id_to_user_id_fkey"
            columns: ["collection_id", "to_user_id"]
            isOneToOne: false
            referencedRelation: "expense_collection_members"
            referencedColumns: ["collection_id", "user_id"]
          },
          {
            foreignKeyName: "expense_settlements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_settlements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
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
          sync_cursor: Json | null
          sync_attempted_at: string | null
          sync_lease_id: string | null
          sync_lease_until: string | null
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
          sync_cursor?: Json | null
          sync_attempted_at?: string | null
          sync_lease_id?: string | null
          sync_lease_until?: string | null
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
          sync_cursor?: Json | null
          sync_attempted_at?: string | null
          sync_lease_id?: string | null
          sync_lease_until?: string | null
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
          alias: string | null
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          alias?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          alias?: string | null
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
      family_document_members: {
        Row: {
          added_at: string
          added_by: string
          document_id: string
          family_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by: string
          document_id: string
          family_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string
          document_id?: string
          family_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_document_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_document_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_document_members_family_id_document_id_fkey"
            columns: ["family_id", "document_id"]
            isOneToOne: false
            referencedRelation: "family_documents"
            referencedColumns: ["family_id", "id"]
          },
          {
            foreignKeyName: "family_document_members_family_id_user_id_fkey"
            columns: ["family_id", "user_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["family_id", "user_id"]
          },
          {
            foreignKeyName: "family_document_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_document_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_documents: {
        Row: {
          created_at: string
          display_name: string
          expires_at: string | null
          family_id: string
          folder_name: string | null
          id: string
          mime_type: string
          original_name: string
          owner_id: string
          size_bytes: number
          status: string
          storage_path: string
          updated_at: string
          version: number
          visibility: string
        }
        Insert: {
          created_at?: string
          display_name: string
          expires_at?: string | null
          family_id: string
          folder_name?: string | null
          id?: string
          mime_type: string
          original_name: string
          owner_id: string
          size_bytes: number
          status?: string
          storage_path: string
          updated_at?: string
          version?: number
          visibility?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          expires_at?: string | null
          family_id?: string
          folder_name?: string | null
          id?: string
          mime_type?: string
          original_name?: string
          owner_id?: string
          size_bytes?: number
          status?: string
          storage_path?: string
          updated_at?: string
          version?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_documents_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_documents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_documents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_habit_members: {
        Row: {
          added_at: string
          added_by: string
          family_id: string
          habit_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by: string
          family_id: string
          habit_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string
          family_id?: string
          habit_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_habit_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_habit_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_habit_members_family_id_habit_id_fkey"
            columns: ["family_id", "habit_id"]
            isOneToOne: false
            referencedRelation: "family_habits"
            referencedColumns: ["family_id", "id"]
          },
          {
            foreignKeyName: "family_habit_members_family_id_user_id_fkey"
            columns: ["family_id", "user_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["family_id", "user_id"]
          },
          {
            foreignKeyName: "family_habit_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_habit_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_habits: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          description: string | null
          family_id: string
          id: string
          start_on: string
          title: string
          updated_at: string
          version: number
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          family_id: string
          id?: string
          start_on?: string
          title: string
          updated_at?: string
          version?: number
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          family_id?: string
          id?: string
          start_on?: string
          title?: string
          updated_at?: string
          version?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_habits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_habits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_habits_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
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
      family_list_items: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          id: string
          list_id: string
          quantity: number
          sort_order: number
          title: string
          unit: string | null
          updated_at: string
          version: number
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          list_id: string
          quantity?: number
          sort_order: number
          title: string
          unit?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          list_id?: string
          quantity?: number
          sort_order?: number
          title?: string
          unit?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "family_list_items_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_list_items_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_list_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_list_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "family_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      family_list_members: {
        Row: {
          added_at: string
          added_by: string
          family_id: string
          list_id: string
          role: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by: string
          family_id: string
          list_id: string
          role?: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string
          family_id?: string
          list_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_list_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_list_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_list_members_family_id_list_id_fkey"
            columns: ["family_id", "list_id"]
            isOneToOne: false
            referencedRelation: "family_lists"
            referencedColumns: ["family_id", "id"]
          },
          {
            foreignKeyName: "family_list_members_family_id_user_id_fkey"
            columns: ["family_id", "user_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["family_id", "user_id"]
          },
          {
            foreignKeyName: "family_list_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_list_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_lists: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          description: string | null
          family_id: string
          id: string
          list_type: string
          title: string
          updated_at: string
          version: number
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          family_id: string
          id?: string
          list_type?: string
          title: string
          updated_at?: string
          version?: number
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          family_id?: string
          id?: string
          list_type?: string
          title?: string
          updated_at?: string
          version?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_lists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_lists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_lists_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          can_configure_modules: boolean
          can_manage_members: boolean
          family_id: string | null
          id: string
          joined_at: string | null
          role: string
          user_id: string | null
        }
        Insert: {
          can_configure_modules?: boolean
          can_manage_members?: boolean
          family_id?: string | null
          id?: string
          joined_at?: string | null
          role?: string
          user_id?: string | null
        }
        Update: {
          can_configure_modules?: boolean
          can_manage_members?: boolean
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
          enabled: boolean
          enabled_at: string | null
          enabled_by: string | null
          family_id: string
          id: string
          module_name: string
          settings: Json
        }
        Insert: {
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          family_id: string
          id?: string
          module_name: string
          settings?: Json
        }
        Update: {
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          family_id?: string
          id?: string
          module_name?: string
          settings?: Json
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
      family_note_members: {
        Row: {
          added_at: string
          added_by: string
          family_id: string
          note_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by: string
          family_id: string
          note_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string
          family_id?: string
          note_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_note_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_note_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_note_members_family_id_note_id_fkey"
            columns: ["family_id", "note_id"]
            isOneToOne: false
            referencedRelation: "family_notes"
            referencedColumns: ["family_id", "id"]
          },
          {
            foreignKeyName: "family_note_members_family_id_user_id_fkey"
            columns: ["family_id", "user_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["family_id", "user_id"]
          },
          {
            foreignKeyName: "family_note_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_note_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_notes: {
        Row: {
          archived_at: string | null
          content: string
          created_at: string
          created_by: string
          family_id: string
          id: string
          search_vector: unknown
          title: string
          updated_at: string
          version: number
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          content?: string
          created_at?: string
          created_by: string
          family_id: string
          id?: string
          search_vector?: unknown
          title: string
          updated_at?: string
          version?: number
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          content?: string
          created_at?: string
          created_by?: string
          family_id?: string
          id?: string
          search_vector?: unknown
          title?: string
          updated_at?: string
          version?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_notes_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      family_recipes: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          description: string | null
          family_id: string
          id: string
          instructions: string | null
          servings: number
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          family_id: string
          id?: string
          instructions?: string | null
          servings?: number
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          family_id?: string
          id?: string
          instructions?: string | null
          servings?: number
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "family_recipes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_recipes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_recipes_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      family_tasks: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          description: string | null
          due_on: string | null
          family_id: string
          group_id: string | null
          id: string
          priority: string
          recurrence_frequency: string
          recurrence_interval: number
          recurrence_until: string | null
          status: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_on?: string | null
          family_id: string
          group_id?: string | null
          id?: string
          priority?: string
          recurrence_frequency?: string
          recurrence_interval?: number
          recurrence_until?: string | null
          status?: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_on?: string | null
          family_id?: string
          group_id?: string | null
          id?: string
          priority?: string
          recurrence_frequency?: string
          recurrence_interval?: number
          recurrence_until?: string | null
          status?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "family_tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_tasks_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_tasks_family_id_group_id_fkey"
            columns: ["family_id", "group_id"]
            isOneToOne: false
            referencedRelation: "task_groups"
            referencedColumns: ["family_id", "id"]
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
          protocol_version: number
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
          protocol_version?: number
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
          protocol_version?: number
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
          turn_deadline: string | null
          version: number
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
          turn_deadline?: string | null
          version?: number
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
          turn_deadline?: string | null
          version?: number
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
      gift_calendar_event_links: {
        Row: {
          event_id: string
          family_id: string
          item_id: string
        }
        Insert: {
          event_id: string
          family_id: string
          item_id: string
        }
        Update: {
          event_id?: string
          family_id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_calendar_event_links_family_id_event_id_fkey"
            columns: ["family_id", "event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["family_id", "id"]
          },
          {
            foreignKeyName: "gift_calendar_event_links_family_id_item_id_fkey"
            columns: ["family_id", "item_id"]
            isOneToOne: false
            referencedRelation: "gift_items"
            referencedColumns: ["family_id", "id"]
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
          purchased_by: string | null
          quantity_purchased: number
        }
        Insert: {
          id?: string
          item_id: string
          notes?: string | null
          purchased_at?: string | null
          purchased_by?: string | null
          quantity_purchased?: number
        }
        Update: {
          id?: string
          item_id?: string
          notes?: string | null
          purchased_at?: string | null
          purchased_by?: string | null
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
      habit_completions: {
        Row: {
          completed_by: string
          completed_on: string
          created_at: string
          family_id: string
          habit_id: string
        }
        Insert: {
          completed_by: string
          completed_on: string
          created_at?: string
          family_id: string
          habit_id: string
        }
        Update: {
          completed_by?: string
          completed_on?: string
          created_at?: string
          family_id?: string
          habit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_completions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habit_completions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habit_completions_family_id_completed_by_fkey"
            columns: ["family_id", "completed_by"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["family_id", "user_id"]
          },
          {
            foreignKeyName: "habit_completions_family_id_habit_id_fkey"
            columns: ["family_id", "habit_id"]
            isOneToOne: false
            referencedRelation: "family_habits"
            referencedColumns: ["family_id", "id"]
          },
        ]
      }
      meal_plan_entries: {
        Row: {
          created_at: string
          created_by: string
          family_id: string
          id: string
          meal_type: string
          notes: string | null
          planned_on: string
          recipe_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          family_id: string
          id?: string
          meal_type: string
          notes?: string | null
          planned_on: string
          recipe_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          family_id?: string
          id?: string
          meal_type?: string
          notes?: string | null
          planned_on?: string
          recipe_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_entries_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_entries_family_id_recipe_id_fkey"
            columns: ["family_id", "recipe_id"]
            isOneToOne: false
            referencedRelation: "family_recipes"
            referencedColumns: ["family_id", "id"]
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
      recipe_ingredients: {
        Row: {
          created_at: string
          family_id: string
          id: string
          name: string
          quantity: number | null
          recipe_id: string
          sort_order: number
          unit: string | null
        }
        Insert: {
          created_at?: string
          family_id: string
          id?: string
          name: string
          quantity?: number | null
          recipe_id: string
          sort_order: number
          unit?: string | null
        }
        Update: {
          created_at?: string
          family_id?: string
          id?: string
          name?: string
          quantity?: number | null
          recipe_id?: string
          sort_order?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_family_id_recipe_id_fkey"
            columns: ["family_id", "recipe_id"]
            isOneToOne: false
            referencedRelation: "family_recipes"
            referencedColumns: ["family_id", "id"]
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
      task_assignees: {
        Row: {
          assigned_at: string
          assigned_by: string
          family_id: string
          task_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          family_id: string
          task_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          family_id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_family_id_task_id_fkey"
            columns: ["family_id", "task_id"]
            isOneToOne: false
            referencedRelation: "family_tasks"
            referencedColumns: ["family_id", "id"]
          },
          {
            foreignKeyName: "task_assignees_family_id_user_id_fkey"
            columns: ["family_id", "user_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["family_id", "user_id"]
          },
          {
            foreignKeyName: "task_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_completions: {
        Row: {
          completed_at: string
          completed_by: string
          family_id: string
          id: string
          occurrence_due_on: string | null
          task_id: string
        }
        Insert: {
          completed_at?: string
          completed_by: string
          family_id: string
          id?: string
          occurrence_due_on?: string | null
          task_id: string
        }
        Update: {
          completed_at?: string
          completed_by?: string
          family_id?: string
          id?: string
          occurrence_due_on?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_completions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_family_id_completed_by_fkey"
            columns: ["family_id", "completed_by"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["family_id", "user_id"]
          },
          {
            foreignKeyName: "task_completions_family_id_task_id_fkey"
            columns: ["family_id", "task_id"]
            isOneToOne: false
            referencedRelation: "family_tasks"
            referencedColumns: ["family_id", "id"]
          },
          {
            foreignKeyName: "task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "family_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_due_deliveries: {
        Row: {
          delivered_at: string
          due_on: string
          recipient_id: string
          task_id: string
        }
        Insert: {
          delivered_at?: string
          due_on: string
          recipient_id: string
          task_id: string
        }
        Update: {
          delivered_at?: string
          due_on?: string
          recipient_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_due_deliveries_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_due_deliveries_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_due_deliveries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "family_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_groups: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          family_id: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          family_id: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          family_id?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_groups_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      task_mentions: {
        Row: {
          created_at: string
          family_id: string
          mentioned_by: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          family_id: string
          mentioned_by: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          family_id?: string
          mentioned_by?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_mentions_family_id_task_id_fkey"
            columns: ["family_id", "task_id"]
            isOneToOne: false
            referencedRelation: "family_tasks"
            referencedColumns: ["family_id", "id"]
          },
          {
            foreignKeyName: "task_mentions_family_id_user_id_fkey"
            columns: ["family_id", "user_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["family_id", "user_id"]
          },
          {
            foreignKeyName: "task_mentions_mentioned_by_fkey"
            columns: ["mentioned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_mentions_mentioned_by_fkey"
            columns: ["mentioned_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_mentions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_mentions_user_id_fkey"
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
      family_storage_has_capacity: {
        Args: { p_bucket_id: string; p_name: string; p_size_bytes: number }
        Returns: boolean
      }
      accept_family_invitation: {
        Args: { p_invitation_id: string }
        Returns: string
      }
      acquire_google_calendar_sync: {
        Args: { p_connection_id: string; p_user_id: string }
        Returns: string
      }
      add_bot_to_room: {
        Args: { p_difficulty?: string; p_room_id: string }
        Returns: string
      }
      add_family_list_item: {
        Args: {
          p_list_id: string
          p_quantity: number
          p_title: string
          p_unit: string
        }
        Returns: string
      }
      apply_google_calendar_event: {
        Args: {
          p_connection_id: string
          p_etag: string
          p_event: Json
          p_expected_version?: number
          p_force?: boolean
          p_lease_id: string
          p_remote_event_id: string
        }
        Returns: string
      }
      archive_family_habit: { Args: { p_habit_id: string }; Returns: undefined }
      begin_family_document_upload: {
        Args: {
          p_display_name: string
          p_expires_at?: string
          p_family_id: string
          p_folder_name?: string
          p_member_ids?: string[]
          p_mime_type: string
          p_original_name: string
          p_size_bytes: number
          p_visibility?: string
        }
        Returns: Json
      }
      begin_mfa_recovery: {
        Args: { p_code_hash: string; p_job_id: string; p_user_id: string }
        Returns: boolean
      }
      bind_mfa_recovery_session: {
        Args: { p_job_id: string; p_session_id: string; p_user_id: string }
        Returns: undefined
      }
      cancel_family_document_upload: {
        Args: { p_document_id: string }
        Returns: undefined
      }
      change_expense_collection_role: {
        Args: { p_collection_id: string; p_role: string; p_user_id: string }
        Returns: undefined
      }
      choose_family_game_color: {
        Args: { p_choice: string; p_room_id: string; p_version: number }
        Returns: number
      }
      complete_family_document_delete: {
        Args: { p_document_id: string }
        Returns: undefined
      }
      complete_family_document_upload: {
        Args: { p_document_id: string }
        Returns: number
      }
      complete_my_mfa_recovery: { Args: never; Returns: undefined }
      copy_recipe_ingredients_to_list: {
        Args: { p_list_id: string; p_recipe_id: string }
        Returns: number
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
      save_expense_with_event: {
        Args: {
          p_collection_id: string
          p_expense_id: string
          p_version: number
          p_category_id: string
          p_paid_by: string
          p_description: string
          p_amount: number
          p_occurred_on: string
          p_notes: string
          p_receipt_path: string
          p_splits: Json
          p_calendar_change: string
          p_calendar_event_id: string
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
      create_family_game:
        | {
            Args: { p_family_id: string; p_name: string; p_opponent_id: string }
            Returns: string
          }
        | {
            Args: {
              p_family_id: string
              p_game_type: string
              p_name: string
              p_opponent_id: string
            }
            Returns: string
          }
      create_family_habit: {
        Args: {
          p_description: string
          p_family_id: string
          p_member_ids?: string[]
          p_start_on?: string
          p_title: string
          p_visibility?: string
        }
        Returns: string
      }
      create_family_list: {
        Args: {
          p_description: string
          p_family_id: string
          p_member_ids: string[]
          p_title: string
          p_visibility: string
        }
        Returns: string
      }
      create_family_note: {
        Args: {
          p_content: string
          p_family_id: string
          p_member_ids?: string[]
          p_title: string
          p_visibility?: string
        }
        Returns: string
      }
      create_family_recipe: {
        Args: {
          p_description: string
          p_family_id: string
          p_ingredients: Json
          p_instructions: string
          p_servings: number
          p_title: string
        }
        Returns: string
      }
      create_family_task: {
        Args: {
          p_assignee_ids: string[]
          p_description: string
          p_due_on: string
          p_family_id: string
          p_group_id: string
          p_mention_ids: string[]
          p_priority: string
          p_recurrence_frequency?: string
          p_recurrence_interval?: number
          p_recurrence_until?: string
          p_title: string
        }
        Returns: string
      }
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
      create_task_group: {
        Args: { p_family_id: string; p_name: string }
        Returns: string
      }
      create_typed_family_list: {
        Args: {
          p_description: string
          p_family_id: string
          p_list_type: string
          p_member_ids: string[]
          p_source_list_id?: string
          p_title: string
          p_visibility: string
        }
        Returns: string
      }
      delete_calendar_event: {
        Args: { p_event_id: string; p_version: number }
        Returns: undefined
      }
      delete_expense_with_lock: {
        Args: {
          p_collection_id: string
          p_expense_id: string
          p_version: number
        }
        Returns: string
      }
      delete_family: { Args: { p_family_id: string }; Returns: undefined }
      delete_family_list_item: {
        Args: { p_item_id: string; p_version: number }
        Returns: undefined
      }
      end_family_game: {
        Args: { p_reason: string; p_room_id: string }
        Returns: undefined
      }
      extract_mentions_from_comment: {
        Args: { comment_text: string }
        Returns: string[]
      }
      generate_join_code: { Args: never; Returns: string }
      get_calendar_event_origins: {
        Args: { p_event_ids: string[]; p_family_id: string }
        Returns: {
          event_id: string
          origin: string
        }[]
      }
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
      get_expense_settlement_balances: {
        Args: { p_collection_id: string }
        Returns: {
          balance_cents: number
          user_id: string
        }[]
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
      get_my_mfa_recovery_state: {
        Args: never
        Returns: {
          allowed: boolean
          pending: boolean
          required: boolean
          session_valid: boolean
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
      guess_family_wordle: {
        Args: { p_guess: string; p_room_id: string; p_version: number }
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
      mark_gift_item_received: {
        Args: { p_item_id: string; p_version: number }
        Returns: number
      }
      move_family_game: {
        Args: {
          p_col: number
          p_room_id: string
          p_row: number
          p_version: number
        }
        Returns: number
      }
      prepare_family_document_delete: {
        Args: { p_document_id: string; p_version: number }
        Returns: string
      }
      prepare_family_document_download: {
        Args: { p_document_id: string }
        Returns: string
      }
      process_calendar_reminders: {
        Args: { p_limit?: number; p_now?: string }
        Returns: number
      }
      process_due_recurring_expenses: {
        Args: { p_as_of?: string }
        Returns: number
      }
      process_task_due_notifications: {
        Args: { p_limit?: number; p_today?: string }
        Returns: number
      }
      purchase_gift_item: {
        Args: { p_item_id: string; p_quantity?: number }
        Returns: string
      }
      react_family_game: {
        Args: { p_room_id: string; p_version: number }
        Returns: number
      }
      read_family_game_signal: { Args: { p_room_id: string }; Returns: boolean }
      ready_family_game: { Args: { p_room_id: string }; Returns: undefined }
      record_expense_settlement: {
        Args: {
          p_amount_cents: number
          p_collection_id: string
          p_from_user_id: string
          p_idempotency_key: string
          p_to_user_id: string
        }
        Returns: string
      }
      record_google_calendar_export: {
        Args: {
          p_connection_id: string
          p_etag: string
          p_lease_id: string
          p_local_event_id: string
          p_local_version: number
          p_remote_event_id: string
        }
        Returns: undefined
      }
      reject_family_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      release_gift_item: {
        Args: { p_coordination_type?: string; p_item_id: string }
        Returns: undefined
      }
      remove_family_meal: { Args: { p_entry_id: string }; Returns: undefined }
      remove_family_member: {
        Args: { p_family_id: string; p_target_user_id: string }
        Returns: undefined
      }
      replace_my_mfa_recovery_codes: {
        Args: { p_hashes: string[] }
        Returns: undefined
      }
      reserve_gift_item: {
        Args: { p_item_id: string; p_quantity?: number; p_status?: string }
        Returns: string
      }
      restore_family_document_delete: {
        Args: { p_document_id: string }
        Returns: number
      }
      reveal_purchased_gift_items: {
        Args: { p_family_id: string }
        Returns: string[]
      }
      reveal_received_gift_buyers: {
        Args: { p_item_id: string }
        Returns: {
          buyer_id: string | null
          display_name: string
          purchased_at: string | null
          quantity: number
        }[]
      }
      revoke_expense_collection_member: {
        Args: { p_collection_id: string; p_user_id: string }
        Returns: undefined
      }
      save_wishlist_item: {
        Args: {
          p_calendar_change: string
          p_calendar_event_id: string
          p_category_ids: string[]
          p_currency: string
          p_description: string
          p_desired_quantity: number
          p_family_id: string
          p_image_path: string
          p_item_id: string
          p_links: string[]
          p_name: string
          p_owner_id: string
          p_price: number
          p_priority: number
          p_status: string
          p_version: number
        }
        Returns: string
      }
      schedule_family_meal: {
        Args: {
          p_family_id: string
          p_meal_type: string
          p_notes?: string
          p_planned_on: string
          p_recipe_id: string
        }
        Returns: string
      }
      set_expense_collection_event: {
        Args: { p_change: string; p_collection_id: string; p_event_id: string }
        Returns: undefined
      }
      set_family_habit_completion: {
        Args: {
          p_completed: boolean
          p_completed_on: string
          p_habit_id: string
        }
        Returns: boolean
      }
      set_family_list_item_completed: {
        Args: { p_completed: boolean; p_item_id: string; p_version: number }
        Returns: number
      }
      set_family_list_type: {
        Args: { p_list_id: string; p_list_type: string; p_version: number }
        Returns: undefined
      }
      set_family_member_capabilities: {
        Args: {
          p_can_configure_modules: boolean
          p_can_manage_members: boolean
          p_family_id: string
          p_target_user_id: string
        }
        Returns: undefined
      }
      set_family_module_preference: {
        Args: { p_enabled: boolean; p_family_id: string; p_module_name: string }
        Returns: {
          enabled: boolean
          enabled_at: string | null
          enabled_by: string | null
          family_id: string
          id: string
          module_name: string
          settings: Json
        }
        SetofOptions: {
          from: "*"
          to: "family_modules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_family_note_archived: {
        Args: { p_archived: boolean; p_note_id: string; p_version: number }
        Returns: number
      }
      set_family_task_status: {
        Args: { p_status: string; p_task_id: string; p_version: number }
        Returns: number
      }
      set_recurring_expense_rule_active: {
        Args: { p_active: boolean; p_collection_id: string; p_rule_id: string }
        Returns: undefined
      }
      start_family_game: { Args: { p_room_id: string }; Returns: string }
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
      update_family_document_access: {
        Args: {
          p_document_id: string
          p_expires_at: string
          p_folder_name: string
          p_member_ids: string[]
          p_version: number
          p_visibility: string
        }
        Returns: number
      }
      update_family_note: {
        Args: {
          p_content: string
          p_member_ids?: string[]
          p_note_id: string
          p_title: string
          p_version: number
          p_visibility: string
        }
        Returns: number
      }
      update_family_task: {
        Args: {
          p_assignee_ids: string[]
          p_description: string
          p_due_on: string
          p_group_id: string
          p_mention_ids: string[]
          p_priority: string
          p_recurrence_frequency?: string
          p_recurrence_interval?: number
          p_recurrence_until?: string
          p_task_id: string
          p_title: string
          p_version: number
        }
        Returns: undefined
      }
    }
    Enums: {
      game_type:
        | "tic_tac_toe"
        | "connect_four"
        | "wordle"
        | "reaction"
        | "color"
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
      game_type: ["tic_tac_toe", "connect_four", "wordle", "reaction", "color"],
      room_status: ["waiting", "in_progress", "finished", "cancelled"],
    },
  },
} as const
