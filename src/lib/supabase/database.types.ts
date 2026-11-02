export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_holder_name: string
          account_match_key: string
          account_number_masked: string
          balance: number
          balance_updated_at: string | null
          bank_id: number
          branch_id: string | null
          business_id: string
          created_at: string
          currency_code: string
          id: string
          include_in_totals: boolean
          is_active: boolean
          is_default: boolean
          is_dormant: boolean
          pending_credit: number | null
          settled_balance: number | null
          updated_at: string
        }
        Insert: {
          account_holder_name: string
          account_match_key: string
          account_number_masked: string
          balance?: number
          balance_updated_at?: string | null
          bank_id: number
          branch_id?: string | null
          business_id: string
          created_at?: string
          currency_code?: string
          id?: string
          include_in_totals?: boolean
          is_active?: boolean
          is_default?: boolean
          is_dormant?: boolean
          pending_credit?: number | null
          settled_balance?: number | null
          updated_at?: string
        }
        Update: {
          account_holder_name?: string
          account_match_key?: string
          account_number_masked?: string
          balance?: number
          balance_updated_at?: string | null
          bank_id?: number
          branch_id?: string | null
          business_id?: string
          created_at?: string
          currency_code?: string
          id?: string
          include_in_totals?: boolean
          is_active?: boolean
          is_default?: boolean
          is_dormant?: boolean
          pending_credit?: number | null
          settled_balance?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      banks: {
        Row: {
          code: string
          colors: string | null
          created_at: string
          id: number
          is_active: boolean
          logo_url: string | null
          mask_pattern: number | null
          name: string
          sender_ids: string
          short_name: string
          sim_based: boolean | null
          uniform_masking: boolean | null
          updated_at: string
        }
        Insert: {
          code: string
          colors?: string | null
          created_at?: string
          id: number
          is_active?: boolean
          logo_url?: string | null
          mask_pattern?: number | null
          name: string
          sender_ids: string
          short_name: string
          sim_based?: boolean | null
          uniform_masking?: boolean | null
          updated_at?: string
        }
        Update: {
          code?: string
          colors?: string | null
          created_at?: string
          id?: number
          is_active?: boolean
          logo_url?: string | null
          mask_pattern?: number | null
          name?: string
          sender_ids?: string
          short_name?: string
          sim_based?: boolean | null
          uniform_masking?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      branch_memberships: {
        Row: {
          assigned_by_member_id: string | null
          branch_id: string
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          member_id: string
          updated_at: string
        }
        Insert: {
          assigned_by_member_id?: string | null
          branch_id: string
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          member_id: string
          updated_at?: string
        }
        Update: {
          assigned_by_member_id?: string | null
          branch_id?: string
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_memberships_assigned_by_member_id_fkey"
            columns: ["assigned_by_member_id"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_memberships_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_memberships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_memberships_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          business_id: string
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          is_main: boolean
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id: string
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_main?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_main?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_members: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          display_name: string
          id: string
          normalized_username: string | null
          phone: string | null
          role: string
          status: string
          updated_at: string
          user_id: string | null
          username: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          display_name: string
          id?: string
          normalized_username?: string | null
          phone?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          username?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          display_name?: string
          id?: string
          normalized_username?: string | null
          phone?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          archived_at: string | null
          business_type: string | null
          created_at: string
          created_by: string | null
          currency_code: string
          id: string
          name: string
          status: string
          timezone: string
          tracking_started_at: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          business_type?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          id?: string
          name: string
          status?: string
          timezone?: string
          tracking_started_at?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          business_type?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          id?: string
          name?: string
          status?: string
          timezone?: string
          tracking_started_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          builtin_key: string | null
          business_id: string
          code: string | null
          color_key: string | null
          created_at: string
          description: string | null
          flow: string
          icon_key: string | null
          id: string
          is_active: boolean
          is_builtin: boolean
          is_cogs: boolean
          is_tax_deductible: boolean
          name: string
          uncategorized: boolean
          updated_at: string
        }
        Insert: {
          builtin_key?: string | null
          business_id: string
          code?: string | null
          color_key?: string | null
          created_at?: string
          description?: string | null
          flow: string
          icon_key?: string | null
          id?: string
          is_active?: boolean
          is_builtin?: boolean
          is_cogs?: boolean
          is_tax_deductible?: boolean
          name: string
          uncategorized?: boolean
          updated_at?: string
        }
        Update: {
          builtin_key?: string | null
          business_id?: string
          code?: string | null
          color_key?: string | null
          created_at?: string
          description?: string | null
          flow?: string
          icon_key?: string | null
          id?: string
          is_active?: boolean
          is_builtin?: boolean
          is_cogs?: boolean
          is_tax_deductible?: boolean
          name?: string
          uncategorized?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      device_assignments: {
        Row: {
          assigned_at: string
          assigned_by_member_id: string | null
          business_id: string
          device_id: string
          id: string
          is_active: boolean
          member_id: string
          revoked_at: string | null
        }
        Insert: {
          assigned_at?: string
          assigned_by_member_id?: string | null
          business_id: string
          device_id: string
          id?: string
          is_active?: boolean
          member_id: string
          revoked_at?: string | null
        }
        Update: {
          assigned_at?: string
          assigned_by_member_id?: string | null
          business_id?: string
          device_id?: string
          id?: string
          is_active?: boolean
          member_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_assignments_assigned_by_member_id_fkey"
            columns: ["assigned_by_member_id"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_assignments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_assignments_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_assignments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["id"]
          },
        ]
      }
      device_bank_accounts: {
        Row: {
          account_id: string
          business_id: string
          created_at: string
          created_by_member_id: string | null
          device_id: string
          id: string
          is_active: boolean
          sim_label: string | null
        }
        Insert: {
          account_id: string
          business_id: string
          created_at?: string
          created_by_member_id?: string | null
          device_id: string
          id?: string
          is_active?: boolean
          sim_label?: string | null
        }
        Update: {
          account_id?: string
          business_id?: string
          created_at?: string
          created_by_member_id?: string | null
          device_id?: string
          id?: string
          is_active?: boolean
          sim_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_bank_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_bank_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_bank_accounts_created_by_member_id_fkey"
            columns: ["created_by_member_id"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_bank_accounts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          api_level: number | null
          app_version: string | null
          branch_id: string | null
          business_id: string
          created_at: string
          device_key: string | null
          device_manufacturer: string | null
          device_model: string | null
          device_name: string
          device_type: string
          id: string
          is_active: boolean
          last_seen_at: string | null
          os_version: string | null
          platform: string
          registered_by_member_id: string | null
          revoked_at: string | null
        }
        Insert: {
          api_level?: number | null
          app_version?: string | null
          branch_id?: string | null
          business_id: string
          created_at?: string
          device_key?: string | null
          device_manufacturer?: string | null
          device_model?: string | null
          device_name: string
          device_type?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          os_version?: string | null
          platform?: string
          registered_by_member_id?: string | null
          revoked_at?: string | null
        }
        Update: {
          api_level?: number | null
          app_version?: string | null
          branch_id?: string | null
          business_id?: string
          created_at?: string
          device_key?: string | null
          device_manufacturer?: string | null
          device_model?: string | null
          device_name?: string
          device_type?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          os_version?: string | null
          platform?: string
          registered_by_member_id?: string | null
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devices_registered_by_member_id_fkey"
            columns: ["registered_by_member_id"]
            isOneToOne: false
            referencedRelation: "business_members"
            referencedColumns: ["id"]
          },
        ]
      }
      failed_parses: {
        Row: {
          body: string
          business_id: string | null
          id: number
          parser_version: string | null
          reason: string | null
          received_at: string
          sender: string
          source_device_id: string | null
        }
        Insert: {
          body: string
          business_id?: string | null
          id?: number
          parser_version?: string | null
          reason?: string | null
          received_at?: string
          sender: string
          source_device_id?: string | null
        }
        Update: {
          body?: string
          business_id?: string | null
          id?: number
          parser_version?: string | null
          reason?: string | null
          received_at?: string
          sender?: string
          source_device_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "failed_parses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_parses_source_device_id_fkey"
            columns: ["source_device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          account_number: string | null
          amount: number
          bank_id: number | null
          branch_id: string | null
          business_id: string
          captured_at: string
          category_id: string | null
          category_ids: Json | null
          created_at: string
          creditor: string | null
          currency_code: string
          current_balance: number | null
          disaster_recovery: number | null
          id: string
          note: string | null
          owner_account_number: string | null
          owner_assignment_source: string | null
          parser_version: string | null
          receiver: string | null
          reference: string | null
          service_charge: number | null
          sms_received_at: string | null
          source_device_id: string | null
          source_fingerprint: string
          source_message_id: string | null
          source_type: string | null
          status: string | null
          total_amount: number | null
          transaction_at: string | null
          transaction_link: string | null
          transaction_time_inferred: boolean
          type: string | null
          updated_at: string
          vat: number | null
        }
        Insert: {
          account_id?: string | null
          account_number?: string | null
          amount?: number
          bank_id?: number | null
          branch_id?: string | null
          business_id: string
          captured_at?: string
          category_id?: string | null
          category_ids?: Json | null
          created_at?: string
          creditor?: string | null
          currency_code?: string
          current_balance?: number | null
          disaster_recovery?: number | null
          id?: string
          note?: string | null
          owner_account_number?: string | null
          owner_assignment_source?: string | null
          parser_version?: string | null
          receiver?: string | null
          reference?: string | null
          service_charge?: number | null
          sms_received_at?: string | null
          source_device_id?: string | null
          source_fingerprint: string
          source_message_id?: string | null
          source_type?: string | null
          status?: string | null
          total_amount?: number | null
          transaction_at?: string | null
          transaction_link?: string | null
          transaction_time_inferred?: boolean
          type?: string | null
          updated_at?: string
          vat?: number | null
        }
        Update: {
          account_id?: string | null
          account_number?: string | null
          amount?: number
          bank_id?: number | null
          branch_id?: string | null
          business_id?: string
          captured_at?: string
          category_id?: string | null
          category_ids?: Json | null
          created_at?: string
          creditor?: string | null
          currency_code?: string
          current_balance?: number | null
          disaster_recovery?: number | null
          id?: string
          note?: string | null
          owner_account_number?: string | null
          owner_assignment_source?: string | null
          parser_version?: string | null
          receiver?: string | null
          reference?: string | null
          service_charge?: number | null
          sms_received_at?: string | null
          source_device_id?: string | null
          source_fingerprint?: string
          source_message_id?: string | null
          source_type?: string | null
          status?: string | null
          total_amount?: number | null
          transaction_at?: string | null
          transaction_link?: string | null
          transaction_time_inferred?: boolean
          type?: string | null
          updated_at?: string
          vat?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_source_device_id_fkey"
            columns: ["source_device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
