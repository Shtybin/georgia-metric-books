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
      ai_audit_findings: {
        Row: {
          confidence: number
          cost_usd: number
          created_at: string
          current: Json
          feature_id: number | null
          id: string
          kind: Database["public"]["Enums"]["ai_audit_finding_kind"]
          proposed: Json
          rationale: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          run_id: string
          severity: Database["public"]["Enums"]["ai_audit_severity"]
          sources: Json
          status: Database["public"]["Enums"]["ai_audit_finding_status"]
          tokens_in: number
          tokens_out: number
          updated_at: string
        }
        Insert: {
          confidence?: number
          cost_usd?: number
          created_at?: string
          current?: Json
          feature_id?: number | null
          id?: string
          kind: Database["public"]["Enums"]["ai_audit_finding_kind"]
          proposed?: Json
          rationale?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id: string
          severity?: Database["public"]["Enums"]["ai_audit_severity"]
          sources?: Json
          status?: Database["public"]["Enums"]["ai_audit_finding_status"]
          tokens_in?: number
          tokens_out?: number
          updated_at?: string
        }
        Update: {
          confidence?: number
          cost_usd?: number
          created_at?: string
          current?: Json
          feature_id?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["ai_audit_finding_kind"]
          proposed?: Json
          rationale?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id?: string
          severity?: Database["public"]["Enums"]["ai_audit_severity"]
          sources?: Json
          status?: Database["public"]["Enums"]["ai_audit_finding_status"]
          tokens_in?: number
          tokens_out?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_audit_findings_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_audit_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_audit_runs: {
        Row: {
          agent_progress: Json
          budget_usd: number
          created_by: string | null
          finished_at: string | null
          heartbeat_at: string
          id: string
          model: string
          notes: string | null
          paused_at: string | null
          points_done: number
          points_total: number
          scope: string
          spent_usd: number
          started_at: string
          status: Database["public"]["Enums"]["ai_audit_run_status"]
          task_kind: string
          updated_at: string
          watchdog_state: Json
        }
        Insert: {
          agent_progress?: Json
          budget_usd?: number
          created_by?: string | null
          finished_at?: string | null
          heartbeat_at?: string
          id?: string
          model?: string
          notes?: string | null
          paused_at?: string | null
          points_done?: number
          points_total?: number
          scope?: string
          spent_usd?: number
          started_at?: string
          status?: Database["public"]["Enums"]["ai_audit_run_status"]
          task_kind?: string
          updated_at?: string
          watchdog_state?: Json
        }
        Update: {
          agent_progress?: Json
          budget_usd?: number
          created_by?: string | null
          finished_at?: string | null
          heartbeat_at?: string
          id?: string
          model?: string
          notes?: string | null
          paused_at?: string | null
          points_done?: number
          points_total?: number
          scope?: string
          spent_usd?: number
          started_at?: string
          status?: Database["public"]["Enums"]["ai_audit_run_status"]
          task_kind?: string
          updated_at?: string
          watchdog_state?: Json
        }
        Relationships: []
      }
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
          origin: string
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
          origin?: string
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
          origin?: string
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
      external_sources: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          feature_id: number | null
          id: string
          place_query: string | null
          provider: string
          requires_auth: boolean
          scope: string
          title: string
          uezd_en: string | null
          uezd_ru: string | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          feature_id?: number | null
          id?: string
          place_query?: string | null
          provider?: string
          requires_auth?: boolean
          scope: string
          title?: string
          uezd_en?: string | null
          uezd_ru?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          feature_id?: number | null
          id?: string
          place_query?: string | null
          provider?: string
          requires_auth?: boolean
          scope?: string
          title?: string
          uezd_en?: string | null
          uezd_ru?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      feature_override_history: {
        Row: {
          action: string | null
          changed_at: string
          changed_by: string | null
          data: Json | null
          feature_id: number | null
          id: string
          notes: string | null
          op: string
          override_id: string
          prev_action: string | null
          prev_data: Json | null
          prev_notes: string | null
          prev_published: boolean | null
          published: boolean | null
        }
        Insert: {
          action?: string | null
          changed_at?: string
          changed_by?: string | null
          data?: Json | null
          feature_id?: number | null
          id?: string
          notes?: string | null
          op: string
          override_id: string
          prev_action?: string | null
          prev_data?: Json | null
          prev_notes?: string | null
          prev_published?: boolean | null
          published?: boolean | null
        }
        Update: {
          action?: string | null
          changed_at?: string
          changed_by?: string | null
          data?: Json | null
          feature_id?: number | null
          id?: string
          notes?: string | null
          op?: string
          override_id?: string
          prev_action?: string | null
          prev_data?: Json | null
          prev_notes?: string | null
          prev_published?: boolean | null
          published?: boolean | null
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
      guide_content: {
        Row: {
          content: string
          lang: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: string
          lang: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          lang?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      missing_years_suggestions: {
        Row: {
          created_at: string
          created_by: string | null
          current_missing: string
          feature_id: number | null
          id: string
          note: string | null
          proposed_missing: string
          reviewed_at: string | null
          reviewed_by: string | null
          settlement_snapshot: Json
          status: Database["public"]["Enums"]["missing_years_suggestion_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_missing?: string
          feature_id?: number | null
          id?: string
          note?: string | null
          proposed_missing?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          settlement_snapshot?: Json
          status?: Database["public"]["Enums"]["missing_years_suggestion_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_missing?: string
          feature_id?: number | null
          id?: string
          note?: string | null
          proposed_missing?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          settlement_snapshot?: Json
          status?: Database["public"]["Enums"]["missing_years_suggestion_status"]
          updated_at?: string
        }
        Relationships: []
      }
      pdf_text_chunks: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          decade_end: number
          decade_start: number
          id: string
          page_from: number | null
          page_to: number | null
          source_name: string
          storage_path: string | null
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          decade_end: number
          decade_start: number
          id?: string
          page_from?: number | null
          page_to?: number | null
          source_name: string
          storage_path?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          decade_end?: number
          decade_start?: number
          id?: string
          page_from?: number | null
          page_to?: number | null
          source_name?: string
          storage_path?: string | null
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
      tbilisi_coord_verifications: {
        Row: {
          church_id: number
          created_at: string
          created_by: string | null
          distance_m: number
          id: string
          model_confidence: number
          new_lat: number
          new_lon: number
          old_lat: number
          old_lon: number
          osm_candidates: Json
          reasoning: string
          reviewed_at: string | null
          reviewed_by: string | null
          sources: Json
          status: Database["public"]["Enums"]["tbilisi_coord_verif_status"]
          updated_at: string
        }
        Insert: {
          church_id: number
          created_at?: string
          created_by?: string | null
          distance_m?: number
          id?: string
          model_confidence?: number
          new_lat: number
          new_lon: number
          old_lat: number
          old_lon: number
          osm_candidates?: Json
          reasoning?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sources?: Json
          status?: Database["public"]["Enums"]["tbilisi_coord_verif_status"]
          updated_at?: string
        }
        Update: {
          church_id?: number
          created_at?: string
          created_by?: string | null
          distance_m?: number
          id?: string
          model_confidence?: number
          new_lat?: number
          new_lon?: number
          old_lat?: number
          old_lon?: number
          osm_candidates?: Json
          reasoning?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sources?: Json
          status?: Database["public"]["Enums"]["tbilisi_coord_verif_status"]
          updated_at?: string
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
      user_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token_hash?: string
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
      accept_invitation: { Args: { _token: string }; Returns: Json }
      has_min_role: {
        Args: {
          _min_role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      rollback_feature_override: {
        Args: { _history_id: string }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      ai_audit_finding_kind:
        | "settlement"
        | "uezd"
        | "church"
        | "years"
        | "missing_years"
        | "duplicate"
        | "other"
        | "geolocate"
      ai_audit_finding_status: "pending" | "approved" | "rejected" | "applied"
      ai_audit_run_status:
        | "running"
        | "paused"
        | "done"
        | "budget_exhausted"
        | "failed"
        | "cancelled"
      ai_audit_severity: "info" | "warn" | "error"
      app_role: "admin" | "user" | "editor" | "contributor"
      missing_years_suggestion_status: "pending" | "approved" | "rejected"
      report_status: "new" | "in_progress" | "resolved"
      suggestion_status: "pending" | "approved" | "rejected"
      tbilisi_coord_verif_status: "pending" | "approved" | "rejected"
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
      ai_audit_finding_kind: [
        "settlement",
        "uezd",
        "church",
        "years",
        "missing_years",
        "duplicate",
        "other",
        "geolocate",
      ],
      ai_audit_finding_status: ["pending", "approved", "rejected", "applied"],
      ai_audit_run_status: [
        "running",
        "paused",
        "done",
        "budget_exhausted",
        "failed",
        "cancelled",
      ],
      ai_audit_severity: ["info", "warn", "error"],
      app_role: ["admin", "user", "editor", "contributor"],
      missing_years_suggestion_status: ["pending", "approved", "rejected"],
      report_status: ["new", "in_progress", "resolved"],
      suggestion_status: ["pending", "approved", "rejected"],
      tbilisi_coord_verif_status: ["pending", "approved", "rejected"],
      uezd_correction_status: ["pending", "approved", "rejected"],
    },
  },
} as const
