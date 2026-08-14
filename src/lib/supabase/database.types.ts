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
      attachments: {
        Row: {
          book_id: string
          byte_size: number
          caption: string | null
          created_at: string
          entry_id: string | null
          height: number | null
          id: string
          mime_type: string
          storage_path: string
          uploader_id: string
          width: number | null
        }
        Insert: {
          book_id: string
          byte_size: number
          caption?: string | null
          created_at?: string
          entry_id?: string | null
          height?: number | null
          id?: string
          mime_type: string
          storage_path: string
          uploader_id: string
          width?: number | null
        }
        Update: {
          book_id?: string
          byte_size?: number
          caption?: string | null
          created_at?: string
          entry_id?: string | null
          height?: number | null
          id?: string
          mime_type?: string
          storage_path?: string
          uploader_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      book_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          book_id: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          invited_email: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["member_role"]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          book_id: string
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          invited_email?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          book_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          invited_email?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_invitations_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      book_members: {
        Row: {
          book_id: string
          joined_at: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          book_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          book_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_members_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          archived_at: string | null
          cover: Json
          created_at: string
          description: string | null
          design: Json
          id: string
          owner_id: string
          subtitle: string | null
          timezone: string
          title: string
          type: Database["public"]["Enums"]["book_type"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          cover?: Json
          created_at?: string
          description?: string | null
          design?: Json
          id?: string
          owner_id: string
          subtitle?: string | null
          timezone?: string
          title: string
          type: Database["public"]["Enums"]["book_type"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          cover?: Json
          created_at?: string
          description?: string | null
          design?: Json
          id?: string
          owner_id?: string
          subtitle?: string | null
          timezone?: string
          title?: string
          type?: Database["public"]["Enums"]["book_type"]
          updated_at?: string
        }
        Relationships: []
      }
      entries: {
        Row: {
          author_id: string
          book_id: string
          content: Json
          corrected_at: string | null
          correction_state: Database["public"]["Enums"]["correction_state"]
          created_at: string
          entry_date: string
          id: string
          location: string | null
          mood: string | null
          original_content: Json | null
          original_plain_text: string | null
          plain_text: string
          sealed_until: string | null
          search_vector: unknown
          status: Database["public"]["Enums"]["entry_status"]
          tags: string[]
          title: string | null
          updated_at: string
          within_day_order: number
        }
        Insert: {
          author_id: string
          book_id: string
          content: Json
          corrected_at?: string | null
          correction_state?: Database["public"]["Enums"]["correction_state"]
          created_at?: string
          entry_date: string
          id?: string
          location?: string | null
          mood?: string | null
          original_content?: Json | null
          original_plain_text?: string | null
          plain_text?: string
          sealed_until?: string | null
          search_vector?: unknown
          status?: Database["public"]["Enums"]["entry_status"]
          tags?: string[]
          title?: string | null
          updated_at?: string
          within_day_order?: number
        }
        Update: {
          author_id?: string
          book_id?: string
          content?: Json
          corrected_at?: string | null
          correction_state?: Database["public"]["Enums"]["correction_state"]
          created_at?: string
          entry_date?: string
          id?: string
          location?: string | null
          mood?: string | null
          original_content?: Json | null
          original_plain_text?: string | null
          plain_text?: string
          sealed_until?: string | null
          search_vector?: unknown
          status?: Database["public"]["Enums"]["entry_status"]
          tags?: string[]
          title?: string | null
          updated_at?: string
          within_day_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "entries_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_reactions: {
        Row: {
          book_id: string
          created_at: string
          emoji: string
          entry_id: string
          note: string | null
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          emoji: string
          entry_id: string
          note?: string | null
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          emoji?: string
          entry_id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_reactions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_reactions_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_versions: {
        Row: {
          book_id: string
          content: Json
          created_at: string
          created_by: string
          entry_id: string
          id: string
          kind: Database["public"]["Enums"]["entry_version_kind"]
          plain_text: string
          title: string | null
        }
        Insert: {
          book_id: string
          content: Json
          created_at?: string
          created_by: string
          entry_id: string
          id?: string
          kind?: Database["public"]["Enums"]["entry_version_kind"]
          plain_text?: string
          title?: string | null
        }
        Update: {
          book_id?: string
          content?: Json
          created_at?: string
          created_by?: string
          entry_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["entry_version_kind"]
          plain_text?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_versions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_versions_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          book_id: string
          created_at: string
          entry_id: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          entry_id: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          entry_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          book_id: string
          created_at: string
          created_by: string
          event_date: string
          id: string
          kind: string
          title: string
        }
        Insert: {
          book_id: string
          created_at?: string
          created_by: string
          event_date: string
          id?: string
          kind?: string
          title: string
        }
        Update: {
          book_id?: string
          created_at?: string
          created_by?: string
          event_date?: string
          id?: string
          kind?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accent: string
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          preferred_font: string
          signature: string | null
          updated_at: string
        }
        Insert: {
          accent?: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id: string
          preferred_font?: string
          signature?: string | null
          updated_at?: string
        }
        Update: {
          accent?: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          preferred_font?: string
          signature?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string }
      book_calendar: {
        Args: { p_book_id: string; p_from: string; p_to: string }
        Returns: {
          author_ids: string[]
          entry_count: number
          entry_date: string
        }[]
      }
      book_contributor_stats: {
        Args: { p_book_id: string }
        Returns: {
          author_id: string
          entry_count: number
          word_count: number
        }[]
      }
      book_role: {
        Args: { p_book_id: string }
        Returns: Database["public"]["Enums"]["member_role"]
      }
      book_stats: {
        Args: { p_book_id: string }
        Returns: {
          days_written: number
          entry_count: number
          first_entry_date: string
          last_entry_date: string
          word_count: number
        }[]
      }
      book_today: { Args: { p_book_id: string }; Returns: string }
      can_write_book: { Args: { p_book_id: string }; Returns: boolean }
      hash_invitation_token: { Args: { p_token: string }; Returns: string }
      invitation_preview: {
        Args: { p_token: string }
        Returns: {
          book_subtitle: string
          book_title: string
          book_type: Database["public"]["Enums"]["book_type"]
          expires_at: string
          inviter_name: string
          role: Database["public"]["Enums"]["member_role"]
          status: string
        }[]
      }
      is_book_member: { Args: { p_book_id: string }; Returns: boolean }
      library_overview: {
        Args: Record<string, never>
        Returns: {
          book_id: string
          entry_count: number
          last_entry_date: string
          last_written_at: string
          word_count: number
        }[]
      }
      on_this_day: {
        Args: { p_day: number; p_month: number }
        Returns: {
          author_id: string
          book_id: string
          entry_date: string
          id: string
          plain_text: string
          title: string
        }[]
      }
      sealed_entry_previews: {
        Args: { p_book_id: string }
        Returns: {
          author_id: string
          entry_date: string
          id: string
          sealed_until: string
        }[]
      }
      shares_book_with: { Args: { p_user_id: string }; Returns: boolean }
      storage_path_book_id: { Args: { p_name: string }; Returns: string }
    }
    Enums: {
      book_type: "personal_journal" | "shared_letter_book"
      correction_state: "original" | "gentle" | "polish"
      entry_status: "draft" | "published"
      entry_version_kind: "original" | "edit" | "proofread"
      member_role: "owner" | "editor" | "viewer"
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
      book_type: ["personal_journal", "shared_letter_book"],
      correction_state: ["original", "gentle", "polish"],
      entry_status: ["draft", "published"],
      entry_version_kind: ["original", "edit", "proofread"],
      member_role: ["owner", "editor", "viewer"],
    },
  },
} as const
