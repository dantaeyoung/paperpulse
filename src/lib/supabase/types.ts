export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          token: string;
          email: string;
          name: string | null;
          field_context: string | null;
          digest_day: number;
          digest_hour: number;
          timezone: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          token: string;
          email: string;
          name?: string | null;
          field_context?: string | null;
          digest_day?: number;
          digest_hour?: number;
          timezone?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          token?: string;
          email?: string;
          name?: string | null;
          field_context?: string | null;
          digest_day?: number;
          digest_hour?: number;
          timezone?: string;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      keywords: {
        Row: {
          id: string;
          user_id: string;
          keyword: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          keyword: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          keyword?: string;
          is_active?: boolean;
        };
      };
      sources: {
        Row: {
          id: string;
          user_id: string | null;
          type: 'kci' | 'riss' | 'journal' | 'custom';
          name: string;
          url: string | null;
          config: Record<string, unknown>;
          is_active: boolean;
          is_global: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          type: 'kci' | 'riss' | 'journal' | 'custom';
          name: string;
          url?: string | null;
          config?: Record<string, unknown>;
          is_active?: boolean;
          is_global?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          type?: 'kci' | 'riss' | 'journal' | 'custom';
          name?: string;
          url?: string | null;
          config?: Record<string, unknown>;
          is_active?: boolean;
          is_global?: boolean;
        };
      };
      papers: {
        Row: {
          id: string;
          source_id: string;
          external_id: string;
          title: string;
          title_en: string | null;
          authors: { name: string; affiliation?: string }[];
          abstract: string | null;
          abstract_en: string | null;
          full_text: string | null;
          url: string;
          doi: string | null;
          journal_name: string | null;
          volume: string | null;
          issue: string | null;
          pages: string | null;
          published_at: string | null;
          collected_at: string;
        };
        Insert: {
          id?: string;
          source_id: string;
          external_id: string;
          title: string;
          title_en?: string | null;
          authors?: { name: string; affiliation?: string }[];
          abstract?: string | null;
          abstract_en?: string | null;
          full_text?: string | null;
          url: string;
          doi?: string | null;
          journal_name?: string | null;
          volume?: string | null;
          issue?: string | null;
          pages?: string | null;
          published_at?: string | null;
          collected_at?: string;
        };
        Update: {
          id?: string;
          source_id?: string;
          external_id?: string;
          title?: string;
          title_en?: string | null;
          authors?: { name: string; affiliation?: string }[];
          abstract?: string | null;
          abstract_en?: string | null;
          full_text?: string | null;
          url?: string;
          doi?: string | null;
          journal_name?: string | null;
          volume?: string | null;
          issue?: string | null;
          pages?: string | null;
          published_at?: string | null;
        };
      };
      summaries: {
        Row: {
          id: string;
          paper_id: string;
          user_id: string;
          content: string;
          model: string;
          tokens_used: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          paper_id: string;
          user_id: string;
          content: string;
          model?: string;
          tokens_used?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          paper_id?: string;
          user_id?: string;
          content?: string;
          model?: string;
          tokens_used?: number | null;
        };
      };
      email_logs: {
        Row: {
          id: string;
          user_id: string;
          paper_count: number;
          status: 'sent' | 'failed' | 'skipped';
          error_message: string | null;
          sent_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          paper_count: number;
          status: 'sent' | 'failed' | 'skipped';
          error_message?: string | null;
          sent_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          paper_count?: number;
          status?: 'sent' | 'failed' | 'skipped';
          error_message?: string | null;
        };
      };
      issue_summaries: {
        Row: {
          id: string;
          scraper_key: string;
          issue_id: string;
          summary_content: string;
          extractions: Record<string, unknown>[] | null;
          paper_count: number;
          custom_prompt: string | null;
          user_id: string | null;
          field_context: string | null;
          model_extraction: string;
          model_synthesis: string;
          tokens_used_extraction: number | null;
          tokens_used_synthesis: number | null;
          cost_estimate: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          scraper_key: string;
          issue_id: string;
          summary_content: string;
          extractions?: Record<string, unknown>[] | null;
          paper_count: number;
          custom_prompt?: string | null;
          user_id?: string | null;
          field_context?: string | null;
          model_extraction?: string;
          model_synthesis?: string;
          tokens_used_extraction?: number | null;
          tokens_used_synthesis?: number | null;
          cost_estimate?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          scraper_key?: string;
          issue_id?: string;
          summary_content?: string;
          extractions?: Record<string, unknown>[] | null;
          paper_count?: number;
          custom_prompt?: string | null;
          user_id?: string | null;
          field_context?: string | null;
          model_extraction?: string;
          model_synthesis?: string;
          tokens_used_extraction?: number | null;
          tokens_used_synthesis?: number | null;
          cost_estimate?: number | null;
        };
      };
    };
  };
}

// Convenience types
export type User = Database['public']['Tables']['users']['Row'];
export type Keyword = Database['public']['Tables']['keywords']['Row'];
export type Source = Database['public']['Tables']['sources']['Row'];
export type Paper = Database['public']['Tables']['papers']['Row'];
export type Summary = Database['public']['Tables']['summaries']['Row'];
export type EmailLog = Database['public']['Tables']['email_logs']['Row'];
export type IssueSummary = Database['public']['Tables']['issue_summaries']['Row'];
