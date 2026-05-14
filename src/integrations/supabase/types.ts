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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      coord_suggestions: {
        Row: {
          church_en: string
          church_ru: string
          created_at: string
          end_year: number | null
          id: string
          lat: number
          lon: number
          notes: string | null
          region_en: string
          region_ru: string
          reviewed_at: string | null
          reviewed_by: string | null
          settlement_en: string
          settlement_ru: string
          start_year: number | null
          status: Database["public"]["Enums"]["suggestion_status"]
          submitter_note: string | null
          uezd_en: string
          uezd_ru: string
          years: string
        }
        Insert: {
          church_en?: string
          church_ru?: string
          created_at?: string
          end_year?: number | null
          id?: string
          lat: number
          lon: number
          notes?: string | null
          region_en?: string
          region_ru?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          settlement_en?: string
          settlement_ru?: string
          start_year?: number | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          submitter_note?: string | null
          uezd_en?: string
          uezd_ru?: string
          years?: string
        }
        Update: {
          church_en?: string
          church_ru?: string
          created_at?: string
          end_year?: number | null
          id?: string
          lat?: number
          lon?: number
          notes?: string | null
          region_en?: string
          region_ru?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          settlement_en?: string
          settlement_ru?: string
          start_year?: number | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          submitter_note?: string | null
          uezd_en?: string
          uezd_ru?: string
          years?: string
        }
        Relationships: []
      }
      feature_overrides: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          data: Json | null
          feature_id: number | null
          id: string
          notes: string | null
          published: boolean
          updated_at: string
        }
        Insert: {
          action: string
          created_at?: string
          created_by?: string | null
          data?: Json | null
          feature_id?: number | null
          id?: string
          notes?: string | null
          published?: boolean
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          data?: Json | null
          feature_id?: number | null
          id?: string
          notes?: string | null
          published?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      problem_report_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_status: Database["public"]["Enums"]["report_status"]
          note: string | null
          old_status: Database["public"]["Enums"]["report_status"] | null
          report_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status: Database["public"]["Enums"]["report_status"]
          note?: string | null
          old_status?: Database["public"]["Enums"]["report_status"] | null
          report_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status?: Database["public"]["Enums"]["report_status"]
          note?: string | null
          old_status?: Database["public"]["Enums"]["report_status"] | null
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "problem_report_history_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "problem_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      problem_reports: {
        Row: {
          admin_notes: string | null
          contact: string | null
          created_at: string
          id: string
          lang: string | null
          lat: number | null
          lon: number | null
          message: string
          page_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["report_status"]
          user_agent: string | null
          zoom: number | null
        }
        Insert: {
          admin_notes?: string | null
          contact?: string | null
          created_at?: string
          id?: string
          lang?: string | null
          lat?: number | null
          lon?: number | null
          message: string
          page_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          user_agent?: string | null
          zoom?: number | null
        }
        Update: {
          admin_notes?: string | null
          contact?: string | null
          created_at?: string
          id?: string
          lang?: string | null
          lat?: number | null
          lon?: number | null
          message?: string
          page_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          user_agent?: string | null
          zoom?: number | null
        }
        Relationships: []
      }
      uezd_corrections: {
        Row: {
          created_at: string
          created_by: string | null
          current_uezd: Json
          feature_id: number | null
          id: string
          note: string | null
          proposed_uezd: Json
          region_snapshot: Json
          reviewed_at: string | null
          reviewed_by: string | null
          settlement_snapshot: Json
          status: Database["public"]["Enums"]["uezd_correction_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_uezd?: Json
          feature_id?: number | null
          id?: string
          note?: string | null
          proposed_uezd?: Json
          region_snapshot?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          settlement_snapshot?: Json
          status?: Database["public"]["Enums"]["uezd_correction_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_uezd?: Json
          feature_id?: number | null
          id?: string
          note?: string | null
          proposed_uezd?: Json
          region_snapshot?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          settlement_snapshot?: Json
          status?: Database["public"]["Enums"]["uezd_correction_status"]
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      report_status: "new" | "in_progress" | "resolved"
      suggestion_status: "pending" | "approved" | "rejected"
      uezd_correction_status: "pending" | "approved" | "rejected"
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
  public: {
    Enums: {
      app_role: ["admin", "user"],
      report_status: ["new", "in_progress", "resolved"],
      suggestion_status: ["pending", "approved", "rejected"],
      uezd_correction_status: ["pending", "approved", "rejected"],
    },
  },
} as const
