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
      agent_audit_log: {
        Row: {
          client_id: string | null
          created_at: string
          error_message: string | null
          id: string
          input_summary: Json | null
          output_summary: Json | null
          role_at_time: string | null
          status: string
          tool_name: string
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_summary?: Json | null
          output_summary?: Json | null
          role_at_time?: string | null
          status: string
          tool_name: string
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_summary?: Json | null
          output_summary?: Json | null
          role_at_time?: string | null
          status?: string
          tool_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      agent_memory: {
        Row: {
          confidence: number
          created_at: string
          expires_at: string | null
          id: string
          key: string
          owner_id: string
          owner_role: string
          scope: string
          source: string
          updated_at: string
          value: Json
        }
        Insert: {
          confidence?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          key: string
          owner_id: string
          owner_role: string
          scope: string
          source: string
          updated_at?: string
          value: Json
        }
        Update: {
          confidence?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          key?: string
          owner_id?: string
          owner_role?: string
          scope?: string
          source?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      borvat_direct_listing_publications: {
        Row: {
          channel_listing_id: string
          created_at: string
          first_published_at: string | null
          last_published_at: string | null
          last_unpublished_at: string | null
          publication_status: string
          status_changed_at: string
          updated_at: string
          version: number
        }
        Insert: {
          channel_listing_id: string
          created_at?: string
          first_published_at?: string | null
          last_published_at?: string | null
          last_unpublished_at?: string | null
          publication_status?: string
          status_changed_at?: string
          updated_at?: string
          version?: number
        }
        Update: {
          channel_listing_id?: string
          created_at?: string
          first_published_at?: string | null
          last_published_at?: string | null
          last_unpublished_at?: string | null
          publication_status?: string
          status_changed_at?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "borvat_direct_listing_publications_channel_listing_id_fkey"
            columns: ["channel_listing_id"]
            isOneToOne: true
            referencedRelation: "channel_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_offer_components: {
        Row: {
          created_at: string
          id: string
          offer_id: string
          quantity_per_offer: number
          sku_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          offer_id: string
          quantity_per_offer: number
          sku_id: string
        }
        Update: {
          created_at?: string
          id?: string
          offer_id?: string
          quantity_per_offer?: number
          sku_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_offer_components_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "catalog_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_offer_components_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "catalog_skus"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_offers: {
        Row: {
          base_sku_id: string | null
          company_id: string
          created_at: string
          id: string
          offer_type: Database["public"]["Enums"]["p2_offer_type"]
          product_id: string | null
          quantity_per_offer: number
          status: Database["public"]["Enums"]["p2_lifecycle_status"]
          updated_at: string
        }
        Insert: {
          base_sku_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          offer_type: Database["public"]["Enums"]["p2_offer_type"]
          product_id?: string | null
          quantity_per_offer?: number
          status?: Database["public"]["Enums"]["p2_lifecycle_status"]
          updated_at?: string
        }
        Update: {
          base_sku_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          offer_type?: Database["public"]["Enums"]["p2_offer_type"]
          product_id?: string | null
          quantity_per_offer?: number
          status?: Database["public"]["Enums"]["p2_lifecycle_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_offers_base_sku_id_fkey"
            columns: ["base_sku_id"]
            isOneToOne: false
            referencedRelation: "catalog_skus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_offers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_product_tax_classifications: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          country_code: string
          created_at: string
          id: string
          notes: string | null
          product_id: string
          proposed_by: string | null
          status: Database["public"]["Enums"]["tax_classification_status"]
          tax_rate_band_id: string
          updated_at: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          country_code: string
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          proposed_by?: string | null
          status?: Database["public"]["Enums"]["tax_classification_status"]
          tax_rate_band_id: string
          updated_at?: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          country_code?: string
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          proposed_by?: string | null
          status?: Database["public"]["Enums"]["tax_classification_status"]
          tax_rate_band_id?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_product_tax_classifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cptc_band_country_fkey"
            columns: ["tax_rate_band_id", "country_code"]
            isOneToOne: false
            referencedRelation: "tax_rate_bands"
            referencedColumns: ["id", "country_code"]
          },
        ]
      }
      catalog_products: {
        Row: {
          brand: string | null
          category_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          status: Database["public"]["Enums"]["p2_lifecycle_status"]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand?: string | null
          category_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          status?: Database["public"]["Enums"]["p2_lifecycle_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand?: string | null
          category_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          status?: Database["public"]["Enums"]["p2_lifecycle_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_skus: {
        Row: {
          code: string
          company_id: string
          created_at: string
          id: string
          product_id: string | null
          status: Database["public"]["Enums"]["p2_lifecycle_status"]
          tracking_mode: Database["public"]["Enums"]["p2_tracking_mode"]
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          product_id?: string | null
          status?: Database["public"]["Enums"]["p2_lifecycle_status"]
          tracking_mode?: Database["public"]["Enums"]["p2_tracking_mode"]
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          product_id?: string | null
          status?: Database["public"]["Enums"]["p2_lifecycle_status"]
          tracking_mode?: Database["public"]["Enums"]["p2_tracking_mode"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_skus_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_skus_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          icon: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          icon?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      channel_accounts: {
        Row: {
          company_id: string
          control_state: Database["public"]["Enums"]["p2_channel_control_state"]
          created_at: string
          display_name: string
          external_account_id: string | null
          id: string
          merchant_store_id: string | null
          provider: string
          status: Database["public"]["Enums"]["p2_lifecycle_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          control_state?: Database["public"]["Enums"]["p2_channel_control_state"]
          created_at?: string
          display_name: string
          external_account_id?: string | null
          id?: string
          merchant_store_id?: string | null
          provider: string
          status?: Database["public"]["Enums"]["p2_lifecycle_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          control_state?: Database["public"]["Enums"]["p2_channel_control_state"]
          created_at?: string
          display_name?: string
          external_account_id?: string | null
          id?: string
          merchant_store_id?: string | null
          provider?: string
          status?: Database["public"]["Enums"]["p2_lifecycle_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_accounts_merchant_store_id_fkey"
            columns: ["merchant_store_id"]
            isOneToOne: false
            referencedRelation: "merchant_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_api_audit: {
        Row: {
          channel_account_id: string
          company_id: string
          connection_id: string
          created_at: string
          direction: string
          duration_ms: number | null
          endpoint: string
          error_code: string | null
          id: number
          meta: Json
          method: string
          rate_limit_remaining: number | null
          retry_after_ms: number | null
          run_id: string | null
          status_code: number | null
        }
        Insert: {
          channel_account_id: string
          company_id: string
          connection_id: string
          created_at?: string
          direction: string
          duration_ms?: number | null
          endpoint: string
          error_code?: string | null
          id?: number
          meta?: Json
          method: string
          rate_limit_remaining?: number | null
          retry_after_ms?: number | null
          run_id?: string | null
          status_code?: number | null
        }
        Update: {
          channel_account_id?: string
          company_id?: string
          connection_id?: string
          created_at?: string
          direction?: string
          duration_ms?: number | null
          endpoint?: string
          error_code?: string | null
          id?: number
          meta?: Json
          method?: string
          rate_limit_remaining?: number | null
          retry_after_ms?: number | null
          run_id?: string | null
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_api_audit_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_api_audit_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_api_audit_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "channel_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_connections: {
        Row: {
          auth_mode: Database["public"]["Enums"]["channel_auth_mode"]
          channel_account_id: string
          company_id: string
          created_at: string
          health: Database["public"]["Enums"]["p4_connection_health"]
          id: string
          last_error: string | null
          last_error_at: string | null
          last_health_check_at: string | null
          live_authorized_at: string | null
          live_sync_enabled: boolean
          mode: Database["public"]["Enums"]["p4_connection_mode"]
          provider: string
          secret_ref: string
          updated_at: string
        }
        Insert: {
          auth_mode?: Database["public"]["Enums"]["channel_auth_mode"]
          channel_account_id: string
          company_id: string
          created_at?: string
          health?: Database["public"]["Enums"]["p4_connection_health"]
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_health_check_at?: string | null
          live_authorized_at?: string | null
          live_sync_enabled?: boolean
          mode?: Database["public"]["Enums"]["p4_connection_mode"]
          provider: string
          secret_ref: string
          updated_at?: string
        }
        Update: {
          auth_mode?: Database["public"]["Enums"]["channel_auth_mode"]
          channel_account_id?: string
          company_id?: string
          created_at?: string
          health?: Database["public"]["Enums"]["p4_connection_health"]
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_health_check_at?: string | null
          live_authorized_at?: string | null
          live_sync_enabled?: boolean
          mode?: Database["public"]["Enums"]["p4_connection_mode"]
          provider?: string
          secret_ref?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_connections_channel_account_id_fkey"
            columns: ["channel_account_id"]
            isOneToOne: false
            referencedRelation: "channel_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_ean_map: {
        Row: {
          company_id: string
          created_at: string
          ean: string
          id: string
          sku_id: string
          source: string
        }
        Insert: {
          company_id: string
          created_at?: string
          ean: string
          id?: string
          sku_id: string
          source?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          ean?: string
          id?: string
          sku_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_ean_map_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_ean_map_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "catalog_skus"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_import_batches: {
        Row: {
          channel_account_id: string
          company_id: string
          connection_id: string
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          matched_count: number
          needs_manual_count: number
          provider: string
          started_at: string
          status: Database["public"]["Enums"]["import_batch_status"]
          total_offers: number
          updated_at: string
        }
        Insert: {
          channel_account_id: string
          company_id: string
          connection_id: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          matched_count?: number
          needs_manual_count?: number
          provider: string
          started_at?: string
          status?: Database["public"]["Enums"]["import_batch_status"]
          total_offers?: number
          updated_at?: string
        }
        Update: {
          channel_account_id?: string
          company_id?: string
          connection_id?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          matched_count?: number
          needs_manual_count?: number
          provider?: string
          started_at?: string
          status?: Database["public"]["Enums"]["import_batch_status"]
          total_offers?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_import_batches_channel_account_id_fkey"
            columns: ["channel_account_id"]
            isOneToOne: false
            referencedRelation: "channel_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_import_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_import_batches_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_import_batches_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_imported_offers: {
        Row: {
          batch_id: string
          bol_offer_id: string
          bol_status: Database["public"]["Enums"]["imported_offer_bol_status"]
          brand: string | null
          channel_account_id: string
          company_id: string
          condition: string | null
          connection_id: string
          created_at: string
          currency: string
          ean: string | null
          id: string
          imported_at: string
          linked_sku_id: string | null
          price_cents: number | null
          raw_payload: Json
          review_note: string | null
          review_status: Database["public"]["Enums"]["imported_offer_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          stock: number | null
          suggested_sku_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          batch_id: string
          bol_offer_id: string
          bol_status?: Database["public"]["Enums"]["imported_offer_bol_status"]
          brand?: string | null
          channel_account_id: string
          company_id: string
          condition?: string | null
          connection_id: string
          created_at?: string
          currency?: string
          ean?: string | null
          id?: string
          imported_at?: string
          linked_sku_id?: string | null
          price_cents?: number | null
          raw_payload?: Json
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["imported_offer_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          stock?: number | null
          suggested_sku_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          batch_id?: string
          bol_offer_id?: string
          bol_status?: Database["public"]["Enums"]["imported_offer_bol_status"]
          brand?: string | null
          channel_account_id?: string
          company_id?: string
          condition?: string | null
          connection_id?: string
          created_at?: string
          currency?: string
          ean?: string | null
          id?: string
          imported_at?: string
          linked_sku_id?: string | null
          price_cents?: number | null
          raw_payload?: Json
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["imported_offer_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          stock?: number | null
          suggested_sku_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_imported_offers_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "channel_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_imported_offers_channel_account_id_fkey"
            columns: ["channel_account_id"]
            isOneToOne: false
            referencedRelation: "channel_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_imported_offers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_imported_offers_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_imported_offers_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_imported_offers_linked_sku_id_fkey"
            columns: ["linked_sku_id"]
            isOneToOne: false
            referencedRelation: "catalog_skus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_imported_offers_suggested_sku_id_fkey"
            columns: ["suggested_sku_id"]
            isOneToOne: false
            referencedRelation: "catalog_skus"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_kill_switches: {
        Row: {
          connection_id: string | null
          id: string
          reads_disabled: boolean
          reason: string | null
          scope: string
          updated_at: string
          updated_by: string | null
          writes_disabled: boolean
        }
        Insert: {
          connection_id?: string | null
          id?: string
          reads_disabled?: boolean
          reason?: string | null
          scope: string
          updated_at?: string
          updated_by?: string | null
          writes_disabled?: boolean
        }
        Update: {
          connection_id?: string | null
          id?: string
          reads_disabled?: boolean
          reason?: string | null
          scope?: string
          updated_at?: string
          updated_by?: string | null
          writes_disabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "channel_kill_switches_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_kill_switches_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_listing_audit: {
        Row: {
          actor_user_id: string | null
          company_id: string
          created_at: string
          from_quantity: number
          from_version: number
          id: string
          listing_id: string
          metadata: Json
          reason: string
          to_quantity: number
          to_version: number
        }
        Insert: {
          actor_user_id?: string | null
          company_id: string
          created_at?: string
          from_quantity: number
          from_version: number
          id?: string
          listing_id: string
          metadata?: Json
          reason: string
          to_quantity: number
          to_version: number
        }
        Update: {
          actor_user_id?: string | null
          company_id?: string
          created_at?: string
          from_quantity?: number
          from_version?: number
          id?: string
          listing_id?: string
          metadata?: Json
          reason?: string
          to_quantity?: number
          to_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "channel_listing_audit_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_listing_audit_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "channel_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_listings: {
        Row: {
          channel_account_id: string
          channel_cap: number | null
          company_id: string
          control_state: Database["public"]["Enums"]["p2_channel_control_state"]
          created_at: string
          external_listing_id: string | null
          id: string
          last_published_at: string | null
          offer_id: string | null
          published_quantity: number
          published_version: number
          sku_id: string | null
          status: Database["public"]["Enums"]["p2_lifecycle_status"]
          units_per_offer: number
          updated_at: string
        }
        Insert: {
          channel_account_id: string
          channel_cap?: number | null
          company_id: string
          control_state?: Database["public"]["Enums"]["p2_channel_control_state"]
          created_at?: string
          external_listing_id?: string | null
          id?: string
          last_published_at?: string | null
          offer_id?: string | null
          published_quantity?: number
          published_version?: number
          sku_id?: string | null
          status?: Database["public"]["Enums"]["p2_lifecycle_status"]
          units_per_offer?: number
          updated_at?: string
        }
        Update: {
          channel_account_id?: string
          channel_cap?: number | null
          company_id?: string
          control_state?: Database["public"]["Enums"]["p2_channel_control_state"]
          created_at?: string
          external_listing_id?: string | null
          id?: string
          last_published_at?: string | null
          offer_id?: string | null
          published_quantity?: number
          published_version?: number
          sku_id?: string | null
          status?: Database["public"]["Enums"]["p2_lifecycle_status"]
          units_per_offer?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_listings_channel_account_id_fkey"
            columns: ["channel_account_id"]
            isOneToOne: false
            referencedRelation: "channel_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_listings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_listings_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "catalog_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_listings_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "catalog_skus"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_live_dispatches: {
        Row: {
          bol_process_status_id: string | null
          channel_account_id: string
          company_id: string
          connection_id: string
          created_at: string
          event_id: string
          event_type: string
          external_ref: Json
          http_status: number
          id: string
          listing_id: string
          listing_version: number
          payload: Json
          request_ended_at: string
          request_started_at: string
        }
        Insert: {
          bol_process_status_id?: string | null
          channel_account_id: string
          company_id: string
          connection_id: string
          created_at?: string
          event_id: string
          event_type: string
          external_ref?: Json
          http_status: number
          id?: string
          listing_id: string
          listing_version: number
          payload: Json
          request_ended_at: string
          request_started_at: string
        }
        Update: {
          bol_process_status_id?: string | null
          channel_account_id?: string
          company_id?: string
          connection_id?: string
          created_at?: string
          event_id?: string
          event_type?: string
          external_ref?: Json
          http_status?: number
          id?: string
          listing_id?: string
          listing_version?: number
          payload?: Json
          request_ended_at?: string
          request_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_live_dispatches_channel_account_id_fkey"
            columns: ["channel_account_id"]
            isOneToOne: false
            referencedRelation: "channel_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_live_dispatches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_live_dispatches_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_live_dispatches_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_live_dispatches_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "outbox_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_live_dispatches_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "channel_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_order_events: {
        Row: {
          actor: string
          company_id: string
          created_at: string
          event_type: string
          from_status:
            | Database["public"]["Enums"]["p4_order_line_status"]
            | null
          id: string
          order_line_id: string
          payload: Json
          to_status: Database["public"]["Enums"]["p4_order_line_status"] | null
        }
        Insert: {
          actor?: string
          company_id: string
          created_at?: string
          event_type: string
          from_status?:
            | Database["public"]["Enums"]["p4_order_line_status"]
            | null
          id?: string
          order_line_id: string
          payload?: Json
          to_status?: Database["public"]["Enums"]["p4_order_line_status"] | null
        }
        Update: {
          actor?: string
          company_id?: string
          created_at?: string
          event_type?: string
          from_status?:
            | Database["public"]["Enums"]["p4_order_line_status"]
            | null
          id?: string
          order_line_id?: string
          payload?: Json
          to_status?: Database["public"]["Enums"]["p4_order_line_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_order_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_order_events_order_line_id_fkey"
            columns: ["order_line_id"]
            isOneToOne: false
            referencedRelation: "channel_order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_order_inbox: {
        Row: {
          bol_order_id: string
          channel_account_id: string
          company_id: string
          id: string
          ingestion_run_id: string | null
          observed_at: string
          provider: string
          raw_payload: Json
        }
        Insert: {
          bol_order_id: string
          channel_account_id: string
          company_id: string
          id?: string
          ingestion_run_id?: string | null
          observed_at?: string
          provider: string
          raw_payload: Json
        }
        Update: {
          bol_order_id?: string
          channel_account_id?: string
          company_id?: string
          id?: string
          ingestion_run_id?: string | null
          observed_at?: string
          provider?: string
          raw_payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "channel_order_inbox_channel_account_id_fkey"
            columns: ["channel_account_id"]
            isOneToOne: false
            referencedRelation: "channel_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_order_inbox_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_order_inbox_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "channel_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_order_lines: {
        Row: {
          bol_offer_id: string
          bol_order_item_id: string
          channel_account_id: string
          company_id: string
          created_at: string
          ean: string | null
          exception_reason: string | null
          fulfilment_method: Database["public"]["Enums"]["p4_fulfilment_method"]
          id: string
          imported_offer_id: string | null
          order_id: string
          quantity: number
          reservation_id: string | null
          sku_id: string | null
          status: Database["public"]["Enums"]["p4_order_line_status"]
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          bol_offer_id: string
          bol_order_item_id: string
          channel_account_id: string
          company_id: string
          created_at?: string
          ean?: string | null
          exception_reason?: string | null
          fulfilment_method: Database["public"]["Enums"]["p4_fulfilment_method"]
          id?: string
          imported_offer_id?: string | null
          order_id: string
          quantity: number
          reservation_id?: string | null
          sku_id?: string | null
          status: Database["public"]["Enums"]["p4_order_line_status"]
          unit_price_cents: number
          updated_at?: string
        }
        Update: {
          bol_offer_id?: string
          bol_order_item_id?: string
          channel_account_id?: string
          company_id?: string
          created_at?: string
          ean?: string | null
          exception_reason?: string | null
          fulfilment_method?: Database["public"]["Enums"]["p4_fulfilment_method"]
          id?: string
          imported_offer_id?: string | null
          order_id?: string
          quantity?: number
          reservation_id?: string | null
          sku_id?: string | null
          status?: Database["public"]["Enums"]["p4_order_line_status"]
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_order_lines_channel_account_id_fkey"
            columns: ["channel_account_id"]
            isOneToOne: false
            referencedRelation: "channel_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_order_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_order_lines_imported_offer_id_fkey"
            columns: ["imported_offer_id"]
            isOneToOne: false
            referencedRelation: "channel_imported_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "channel_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_order_lines_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "inventory_reservation_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_order_lines_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "catalog_skus"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_orders: {
        Row: {
          bol_order_id: string
          buyer_email: string | null
          channel_account_id: string
          company_id: string
          created_at: string
          currency: string
          first_observed_at: string
          id: string
          last_observed_at: string
          order_placed_at: string
          status: Database["public"]["Enums"]["p4_order_status"]
          total_amount_cents: number
          updated_at: string
        }
        Insert: {
          bol_order_id: string
          buyer_email?: string | null
          channel_account_id: string
          company_id: string
          created_at?: string
          currency?: string
          first_observed_at?: string
          id?: string
          last_observed_at?: string
          order_placed_at: string
          status?: Database["public"]["Enums"]["p4_order_status"]
          total_amount_cents?: number
          updated_at?: string
        }
        Update: {
          bol_order_id?: string
          buyer_email?: string | null
          channel_account_id?: string
          company_id?: string
          created_at?: string
          currency?: string
          first_observed_at?: string
          id?: string
          last_observed_at?: string
          order_placed_at?: string
          status?: Database["public"]["Enums"]["p4_order_status"]
          total_amount_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_orders_channel_account_id_fkey"
            columns: ["channel_account_id"]
            isOneToOne: false
            referencedRelation: "channel_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_reconciliation_findings: {
        Row: {
          channel_account_id: string
          company_id: string
          created_at: string
          detail: Json
          external_quantity: number | null
          external_version: number | null
          finding_type: string
          id: string
          listing_id: string | null
          local_quantity: number | null
          local_version: number | null
          offer_id: string | null
          remediation_event_id: string | null
          report_id: string
          resolution: string
          resolved_at: string | null
          sku_id: string | null
        }
        Insert: {
          channel_account_id: string
          company_id: string
          created_at?: string
          detail?: Json
          external_quantity?: number | null
          external_version?: number | null
          finding_type: string
          id?: string
          listing_id?: string | null
          local_quantity?: number | null
          local_version?: number | null
          offer_id?: string | null
          remediation_event_id?: string | null
          report_id: string
          resolution?: string
          resolved_at?: string | null
          sku_id?: string | null
        }
        Update: {
          channel_account_id?: string
          company_id?: string
          created_at?: string
          detail?: Json
          external_quantity?: number | null
          external_version?: number | null
          finding_type?: string
          id?: string
          listing_id?: string | null
          local_quantity?: number | null
          local_version?: number | null
          offer_id?: string | null
          remediation_event_id?: string | null
          report_id?: string
          resolution?: string
          resolved_at?: string | null
          sku_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_reconciliation_findings_channel_account_id_fkey"
            columns: ["channel_account_id"]
            isOneToOne: false
            referencedRelation: "channel_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_reconciliation_findings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_reconciliation_findings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "channel_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_reconciliation_findings_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "catalog_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_reconciliation_findings_remediation_event_id_fkey"
            columns: ["remediation_event_id"]
            isOneToOne: false
            referencedRelation: "outbox_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_reconciliation_findings_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "channel_reconciliation_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_reconciliation_findings_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "catalog_skus"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_reconciliation_reports: {
        Row: {
          batch_id: string
          channel_account_id: string
          company_id: string
          created_at: string
          drift_quantity: number
          drift_version: number
          id: string
          matched: number
          missing_external: number
          missing_local: number
          run_at: string
          status: string
          total_listings: number
          total_snapshots: number
        }
        Insert: {
          batch_id: string
          channel_account_id: string
          company_id: string
          created_at?: string
          drift_quantity?: number
          drift_version?: number
          id?: string
          matched?: number
          missing_external?: number
          missing_local?: number
          run_at?: string
          status?: string
          total_listings?: number
          total_snapshots?: number
        }
        Update: {
          batch_id?: string
          channel_account_id?: string
          company_id?: string
          created_at?: string
          drift_quantity?: number
          drift_version?: number
          id?: string
          matched?: number
          missing_external?: number
          missing_local?: number
          run_at?: string
          status?: string
          total_listings?: number
          total_snapshots?: number
        }
        Relationships: [
          {
            foreignKeyName: "channel_reconciliation_reports_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "channel_snapshot_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_reconciliation_reports_channel_account_id_fkey"
            columns: ["channel_account_id"]
            isOneToOne: false
            referencedRelation: "channel_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_reconciliation_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_shadow_dispatches: {
        Row: {
          channel_account_id: string
          company_id: string
          connection_id: string
          connection_mode: Database["public"]["Enums"]["p4_connection_mode"]
          created_at: string
          event_id: string
          event_type: string
          id: string
          listing_id: string
          listing_version: number
          payload: Json
          reason_code: string
        }
        Insert: {
          channel_account_id: string
          company_id: string
          connection_id: string
          connection_mode: Database["public"]["Enums"]["p4_connection_mode"]
          created_at?: string
          event_id: string
          event_type: string
          id?: string
          listing_id: string
          listing_version: number
          payload: Json
          reason_code: string
        }
        Update: {
          channel_account_id?: string
          company_id?: string
          connection_id?: string
          connection_mode?: Database["public"]["Enums"]["p4_connection_mode"]
          created_at?: string
          event_id?: string
          event_type?: string
          id?: string
          listing_id?: string
          listing_version?: number
          payload?: Json
          reason_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_shadow_dispatches_channel_account_id_fkey"
            columns: ["channel_account_id"]
            isOneToOne: false
            referencedRelation: "channel_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_shadow_dispatches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_shadow_dispatches_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_shadow_dispatches_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_shadow_dispatches_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "outbox_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_shadow_dispatches_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "channel_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_shipment_events: {
        Row: {
          company_id: string
          created_at: string
          event_time: string
          from_status: string | null
          id: string
          metadata: Json
          shipment_id: string
          source: string
          to_status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          event_time?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          shipment_id: string
          source: string
          to_status: string
        }
        Update: {
          company_id?: string
          created_at?: string
          event_time?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          shipment_id?: string
          source?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_shipment_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "channel_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_shipments: {
        Row: {
          allocation_id: string
          bol_confirmed_at: string | null
          bol_process_status_id: string | null
          bol_shipment_id: string | null
          channel_account_id: string
          channel_order_line_id: string
          company_id: string
          created_at: string
          id: string
          last_error: string | null
          shipped_at: string | null
          status: string
          terminal_at: string | null
          track_and_trace: string | null
          transporter_code: string
          updated_at: string
        }
        Insert: {
          allocation_id: string
          bol_confirmed_at?: string | null
          bol_process_status_id?: string | null
          bol_shipment_id?: string | null
          channel_account_id: string
          channel_order_line_id: string
          company_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          shipped_at?: string | null
          status?: string
          terminal_at?: string | null
          track_and_trace?: string | null
          transporter_code: string
          updated_at?: string
        }
        Update: {
          allocation_id?: string
          bol_confirmed_at?: string | null
          bol_process_status_id?: string | null
          bol_shipment_id?: string | null
          channel_account_id?: string
          channel_order_line_id?: string
          company_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          shipped_at?: string | null
          status?: string
          terminal_at?: string | null
          track_and_trace?: string | null
          transporter_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_shipments_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "inventory_reservation_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_shipments_channel_account_id_fkey"
            columns: ["channel_account_id"]
            isOneToOne: false
            referencedRelation: "channel_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_shipments_channel_order_line_id_fkey"
            columns: ["channel_order_line_id"]
            isOneToOne: false
            referencedRelation: "channel_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_shipments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_snapshot_batches: {
        Row: {
          channel_account_id: string
          closed_at: string | null
          company_id: string
          created_at: string
          id: string
          note: string | null
          source: string
          status: string
          taken_at: string
        }
        Insert: {
          channel_account_id: string
          closed_at?: string | null
          company_id: string
          created_at?: string
          id?: string
          note?: string | null
          source: string
          status?: string
          taken_at?: string
        }
        Update: {
          channel_account_id?: string
          closed_at?: string | null
          company_id?: string
          created_at?: string
          id?: string
          note?: string | null
          source?: string
          status?: string
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_snapshot_batches_channel_account_id_fkey"
            columns: ["channel_account_id"]
            isOneToOne: false
            referencedRelation: "channel_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_snapshot_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_snapshots: {
        Row: {
          batch_id: string
          channel_account_id: string
          company_id: string
          created_at: string
          external_quantity: number
          external_ref: Json
          external_version: number | null
          id: string
          observed_at: string
          offer_id: string | null
          sku_id: string | null
        }
        Insert: {
          batch_id: string
          channel_account_id: string
          company_id: string
          created_at?: string
          external_quantity: number
          external_ref?: Json
          external_version?: number | null
          id?: string
          observed_at?: string
          offer_id?: string | null
          sku_id?: string | null
        }
        Update: {
          batch_id?: string
          channel_account_id?: string
          company_id?: string
          created_at?: string
          external_quantity?: number
          external_ref?: Json
          external_version?: number | null
          id?: string
          observed_at?: string
          offer_id?: string | null
          sku_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_snapshots_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "channel_snapshot_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_snapshots_channel_account_id_fkey"
            columns: ["channel_account_id"]
            isOneToOne: false
            referencedRelation: "channel_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_snapshots_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "catalog_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_snapshots_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "catalog_skus"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_sync_cursors: {
        Row: {
          connection_id: string
          cursor_key: string
          cursor_ts: string | null
          cursor_value: string | null
          updated_at: string
        }
        Insert: {
          connection_id: string
          cursor_key: string
          cursor_ts?: string | null
          cursor_value?: string | null
          updated_at?: string
        }
        Update: {
          connection_id?: string
          cursor_key?: string
          cursor_ts?: string | null
          cursor_value?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_sync_cursors_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_sync_cursors_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_sync_runs: {
        Row: {
          channel_account_id: string
          company_id: string
          connection_id: string
          error_code: string | null
          finished_at: string | null
          id: string
          items_seen: number
          items_written: number
          kind: Database["public"]["Enums"]["p4_sync_kind"]
          metadata: Json
          started_at: string
          status: Database["public"]["Enums"]["p4_sync_status"]
        }
        Insert: {
          channel_account_id: string
          company_id: string
          connection_id: string
          error_code?: string | null
          finished_at?: string | null
          id?: string
          items_seen?: number
          items_written?: number
          kind: Database["public"]["Enums"]["p4_sync_kind"]
          metadata?: Json
          started_at?: string
          status?: Database["public"]["Enums"]["p4_sync_status"]
        }
        Update: {
          channel_account_id?: string
          company_id?: string
          connection_id?: string
          error_code?: string | null
          finished_at?: string | null
          id?: string
          items_seen?: number
          items_written?: number
          kind?: Database["public"]["Enums"]["p4_sync_kind"]
          metadata?: Json
          started_at?: string
          status?: Database["public"]["Enums"]["p4_sync_status"]
        }
        Relationships: [
          {
            foreignKeyName: "channel_sync_runs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_sync_runs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_legal_identifiers: {
        Row: {
          company_id: string
          country_code: string
          created_at: string
          display_value: string
          id: string
          identifier_type: string
          normalized_value: string
          status: string
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          company_id: string
          country_code: string
          created_at?: string
          display_value: string
          id?: string
          identifier_type: string
          normalized_value: string
          status?: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          company_id?: string
          country_code?: string
          created_at?: string
          display_value?: string
          id?: string
          identifier_type?: string
          normalized_value?: string
          status?: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_legal_identifiers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_legal_identities: {
        Row: {
          address_country: string | null
          address_line1: string | null
          address_line2: string | null
          business_email: string | null
          business_phone: string | null
          city: string | null
          company_id: string
          created_at: string
          created_by: string | null
          legal_entity_type: string
          legal_name: string
          postal_code: string | null
          region: string | null
          registration_country: string
          rejected_at: string | null
          rejection_reason: string | null
          review_started_at: string | null
          submitted_at: string | null
          suspended_at: string | null
          suspension_reason: string | null
          updated_at: string
          updated_by: string | null
          verification_status: string
          verified_at: string | null
          verified_by: string | null
          website_url: string | null
        }
        Insert: {
          address_country?: string | null
          address_line1?: string | null
          address_line2?: string | null
          business_email?: string | null
          business_phone?: string | null
          city?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          legal_entity_type: string
          legal_name: string
          postal_code?: string | null
          region?: string | null
          registration_country: string
          rejected_at?: string | null
          rejection_reason?: string | null
          review_started_at?: string | null
          submitted_at?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
          updated_by?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
          website_url?: string | null
        }
        Update: {
          address_country?: string | null
          address_line1?: string | null
          address_line2?: string | null
          business_email?: string | null
          business_phone?: string | null
          city?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          legal_entity_type?: string
          legal_name?: string
          postal_code?: string | null
          region?: string | null
          registration_country?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          review_started_at?: string | null
          submitted_at?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
          updated_by?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_legal_identities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_member_roles: {
        Row: {
          created_at: string
          member_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          member_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          member_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_member_roles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "company_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_member_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "system_company_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_tax_profiles: {
        Row: {
          company_id: string
          created_at: string
          legal_name: string | null
          updated_at: string
          vat_country: string | null
          vat_number: string | null
          verified: boolean
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          legal_name?: string | null
          updated_at?: string
          vat_country?: string | null
          vat_number?: string | null
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          legal_name?: string | null
          updated_at?: string
          vat_country?: string | null
          vat_number?: string | null
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_tax_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_delivery_destination_versions: {
        Row: {
          address_unit: string | null
          buyer_principal_id: string
          city: string
          country_code: string
          created_at: string
          customer_delivery_destination_id: string
          delivery_appointment_requirement: string
          destination_type: string
          elevator_access: string
          floor_level: number | null
          house_number: string | null
          id: string
          lift_gate_requirement: string
          postal_code: string
          postal_code_normalized: string
          precision_level: string
          region: string | null
          status: string
          street_name: string | null
          supersedes_version_id: string | null
          updated_at: string
          version_number: number
        }
        Insert: {
          address_unit?: string | null
          buyer_principal_id: string
          city: string
          country_code: string
          created_at?: string
          customer_delivery_destination_id: string
          delivery_appointment_requirement?: string
          destination_type: string
          elevator_access?: string
          floor_level?: number | null
          house_number?: string | null
          id?: string
          lift_gate_requirement?: string
          postal_code: string
          postal_code_normalized: string
          precision_level: string
          region?: string | null
          status?: string
          street_name?: string | null
          supersedes_version_id?: string | null
          updated_at?: string
          version_number: number
        }
        Update: {
          address_unit?: string | null
          buyer_principal_id?: string
          city?: string
          country_code?: string
          created_at?: string
          customer_delivery_destination_id?: string
          delivery_appointment_requirement?: string
          destination_type?: string
          elevator_access?: string
          floor_level?: number | null
          house_number?: string | null
          id?: string
          lift_gate_requirement?: string
          postal_code?: string
          postal_code_normalized?: string
          precision_level?: string
          region?: string | null
          status?: string
          street_name?: string | null
          supersedes_version_id?: string | null
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "cddv_parent_tenancy_fk"
            columns: ["customer_delivery_destination_id", "buyer_principal_id"]
            isOneToOne: false
            referencedRelation: "customer_delivery_destinations"
            referencedColumns: ["id", "buyer_principal_id"]
          },
          {
            foreignKeyName: "customer_delivery_destination_versio_supersedes_version_id_fkey"
            columns: ["supersedes_version_id"]
            isOneToOne: false
            referencedRelation: "customer_delivery_destination_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_delivery_destinations: {
        Row: {
          buyer_principal_id: string
          created_at: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          buyer_principal_id: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          buyer_principal_id?: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_delivery_destinations_buyer_principal_id_fkey"
            columns: ["buyer_principal_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_promise_profiles: {
        Row: {
          company_id: string | null
          created_at: string
          customer_date_selection_enabled: boolean
          display_name: string
          handling_business_days: number
          id: string
          merchant_store_id: string | null
          profile_code: string
          scope_type: string
          status: string
          supersedes_profile_id: string | null
          timezone_name: string
          updated_at: string
          version_number: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          customer_date_selection_enabled?: boolean
          display_name: string
          handling_business_days: number
          id?: string
          merchant_store_id?: string | null
          profile_code: string
          scope_type: string
          status?: string
          supersedes_profile_id?: string | null
          timezone_name: string
          updated_at?: string
          version_number: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          customer_date_selection_enabled?: boolean
          display_name?: string
          handling_business_days?: number
          id?: string
          merchant_store_id?: string | null
          profile_code?: string
          scope_type?: string
          status?: string
          supersedes_profile_id?: string | null
          timezone_name?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_promise_profiles_supersedes_profile_id_fkey"
            columns: ["supersedes_profile_id"]
            isOneToOne: false
            referencedRelation: "delivery_promise_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dpp_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dpp_store_company_fk"
            columns: ["merchant_store_id", "company_id"]
            isOneToOne: false
            referencedRelation: "merchant_stores"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      delivery_promise_weekly_schedules: {
        Row: {
          accepts_orders: boolean
          created_at: string
          delivery_promise_profile_id: string
          handover_enabled: boolean
          id: string
          order_cutoff_local_time: string | null
          updated_at: string
          weekday_iso: number
        }
        Insert: {
          accepts_orders: boolean
          created_at?: string
          delivery_promise_profile_id: string
          handover_enabled?: boolean
          id?: string
          order_cutoff_local_time?: string | null
          updated_at?: string
          weekday_iso: number
        }
        Update: {
          accepts_orders?: boolean
          created_at?: string
          delivery_promise_profile_id?: string
          handover_enabled?: boolean
          id?: string
          order_cutoff_local_time?: string | null
          updated_at?: string
          weekday_iso?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_promise_weekly_schedu_delivery_promise_profile_id_fkey"
            columns: ["delivery_promise_profile_id"]
            isOneToOne: false
            referencedRelation: "delivery_promise_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_balances: {
        Row: {
          company_id: string
          disposition: string
          id: string
          location_id: string | null
          lot_id: string | null
          quantity: number
          serial_id: string | null
          sku_id: string
          updated_at: string
          version: number
          warehouse_id: string
        }
        Insert: {
          company_id: string
          disposition: string
          id?: string
          location_id?: string | null
          lot_id?: string | null
          quantity?: number
          serial_id?: string | null
          sku_id: string
          updated_at?: string
          version?: number
          warehouse_id: string
        }
        Update: {
          company_id?: string
          disposition?: string
          id?: string
          location_id?: string | null
          lot_id?: string | null
          quantity?: number
          serial_id?: string | null
          sku_id?: string
          updated_at?: string
          version?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_balances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_disposition_fkey"
            columns: ["disposition"]
            isOneToOne: false
            referencedRelation: "inventory_dispositions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "inventory_balances_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_serial_id_fkey"
            columns: ["serial_id"]
            isOneToOne: false
            referencedRelation: "inventory_serials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "catalog_skus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_dispositions: {
        Row: {
          description: string
          is_physical: boolean
          key: string
          sort_order: number
        }
        Insert: {
          description: string
          is_physical?: boolean
          key: string
          sort_order?: number
        }
        Update: {
          description?: string
          is_physical?: boolean
          key?: string
          sort_order?: number
        }
        Relationships: []
      }
      inventory_lots: {
        Row: {
          code: string
          company_id: string
          created_at: string
          expiry: string | null
          id: string
          sku_id: string
          status: Database["public"]["Enums"]["p2_lifecycle_status"]
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          expiry?: string | null
          id?: string
          sku_id: string
          status?: Database["public"]["Enums"]["p2_lifecycle_status"]
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          expiry?: string | null
          id?: string
          sku_id?: string
          status?: Database["public"]["Enums"]["p2_lifecycle_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "catalog_skus"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reservation_allocations: {
        Row: {
          allocated_quantity: number
          consumed_quantity: number
          created_at: string
          id: string
          line_id: string
          location_id: string | null
          packed_quantity: number
          released_quantity: number
          shipped_quantity: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          allocated_quantity: number
          consumed_quantity?: number
          created_at?: string
          id?: string
          line_id: string
          location_id?: string | null
          packed_quantity?: number
          released_quantity?: number
          shipped_quantity?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          allocated_quantity?: number
          consumed_quantity?: number
          created_at?: string
          id?: string
          line_id?: string
          location_id?: string | null
          packed_quantity?: number
          released_quantity?: number
          shipped_quantity?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservation_allocations_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "inventory_reservation_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservation_allocations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservation_allocations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reservation_headers: {
        Row: {
          company_id: string
          created_at: string
          id: string
          source_id: string
          source_kind: Database["public"]["Enums"]["p2_reservation_source_kind"]
          status: Database["public"]["Enums"]["p2_reservation_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          source_id: string
          source_kind: Database["public"]["Enums"]["p2_reservation_source_kind"]
          status?: Database["public"]["Enums"]["p2_reservation_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          source_id?: string
          source_kind?: Database["public"]["Enums"]["p2_reservation_source_kind"]
          status?: Database["public"]["Enums"]["p2_reservation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservation_headers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reservation_lines: {
        Row: {
          consumed_quantity: number
          created_at: string
          id: string
          packed_quantity: number
          released_quantity: number
          required_base_quantity: number
          reservation_id: string
          shipped_quantity: number
          sku_id: string
          updated_at: string
        }
        Insert: {
          consumed_quantity?: number
          created_at?: string
          id?: string
          packed_quantity?: number
          released_quantity?: number
          required_base_quantity: number
          reservation_id: string
          shipped_quantity?: number
          sku_id: string
          updated_at?: string
        }
        Update: {
          consumed_quantity?: number
          created_at?: string
          id?: string
          packed_quantity?: number
          released_quantity?: number
          required_base_quantity?: number
          reservation_id?: string
          shipped_quantity?: number
          sku_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservation_lines_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "inventory_reservation_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservation_lines_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "catalog_skus"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_serials: {
        Row: {
          code: string
          company_id: string
          created_at: string
          id: string
          sku_id: string
          status: Database["public"]["Enums"]["p2_lifecycle_status"]
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          sku_id: string
          status?: Database["public"]["Enums"]["p2_lifecycle_status"]
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          sku_id?: string
          status?: Database["public"]["Enums"]["p2_lifecycle_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_serials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_serials_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "catalog_skus"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transaction_entries: {
        Row: {
          company_id: string
          created_at: string
          disposition: string
          id: string
          location_id: string | null
          lot_id: string | null
          quantity: number
          serial_id: string | null
          sku_id: string
          transaction_id: string
          warehouse_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          disposition: string
          id?: string
          location_id?: string | null
          lot_id?: string | null
          quantity: number
          serial_id?: string | null
          sku_id: string
          transaction_id: string
          warehouse_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          disposition?: string
          id?: string
          location_id?: string | null
          lot_id?: string | null
          quantity?: number
          serial_id?: string | null
          sku_id?: string
          transaction_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transaction_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transaction_entries_disposition_fkey"
            columns: ["disposition"]
            isOneToOne: false
            referencedRelation: "inventory_dispositions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "inventory_transaction_entries_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transaction_entries_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transaction_entries_serial_id_fkey"
            columns: ["serial_id"]
            isOneToOne: false
            referencedRelation: "inventory_serials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transaction_entries_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "catalog_skus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transaction_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "inventory_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transaction_entries_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          actor_user_id: string | null
          company_id: string
          created_at: string
          id: string
          idempotency_key: string | null
          metadata: Json
          posted_at: string
          reason: Database["public"]["Enums"]["p2_tx_reason"]
          reversal_of: string | null
          reversed_at: string | null
          reversed_by: string | null
          source_id: string | null
          source_type: string | null
          status: Database["public"]["Enums"]["p2_tx_status"]
        }
        Insert: {
          actor_user_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          posted_at?: string
          reason: Database["public"]["Enums"]["p2_tx_reason"]
          reversal_of?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["p2_tx_status"]
        }
        Update: {
          actor_user_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          posted_at?: string
          reason?: Database["public"]["Enums"]["p2_tx_reason"]
          reversal_of?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["p2_tx_status"]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "inventory_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "inventory_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_shipping_quote_acceptances: {
        Row: {
          accepted_at: string
          accepted_by_actor_type: string
          accepted_by_buyer_principal_id: string | null
          accepted_shipping_charge_minor: number
          buyer_principal_id: string
          carrier_code: string | null
          company_id: string
          created_at: string
          currency_code: string
          delivery_destination_version_id: string
          delivery_max_calendar_days_after_acceptance: number
          delivery_min_calendar_days_after_acceptance: number
          fulfillment_origin_id: string
          id: string
          manual_shipping_quote_offer_id: string
          manual_shipping_quote_request_id: string
          merchant_store_id: string
          offer_expires_at: string
          offer_offered_at: string
          offer_version_number: number
          quote_source: string
          request_family_id: string
          responsible_party: string
          service_code: string | null
          shipment_form: string
        }
        Insert: {
          accepted_at?: string
          accepted_by_actor_type: string
          accepted_by_buyer_principal_id?: string | null
          accepted_shipping_charge_minor: number
          buyer_principal_id: string
          carrier_code?: string | null
          company_id: string
          created_at?: string
          currency_code: string
          delivery_destination_version_id: string
          delivery_max_calendar_days_after_acceptance: number
          delivery_min_calendar_days_after_acceptance: number
          fulfillment_origin_id: string
          id?: string
          manual_shipping_quote_offer_id: string
          manual_shipping_quote_request_id: string
          merchant_store_id: string
          offer_expires_at: string
          offer_offered_at: string
          offer_version_number: number
          quote_source: string
          request_family_id: string
          responsible_party: string
          service_code?: string | null
          shipment_form: string
        }
        Update: {
          accepted_at?: string
          accepted_by_actor_type?: string
          accepted_by_buyer_principal_id?: string | null
          accepted_shipping_charge_minor?: number
          buyer_principal_id?: string
          carrier_code?: string | null
          company_id?: string
          created_at?: string
          currency_code?: string
          delivery_destination_version_id?: string
          delivery_max_calendar_days_after_acceptance?: number
          delivery_min_calendar_days_after_acceptance?: number
          fulfillment_origin_id?: string
          id?: string
          manual_shipping_quote_offer_id?: string
          manual_shipping_quote_request_id?: string
          merchant_store_id?: string
          offer_expires_at?: string
          offer_offered_at?: string
          offer_version_number?: number
          quote_source?: string
          request_family_id?: string
          responsible_party?: string
          service_code?: string | null
          shipment_form?: string
        }
        Relationships: [
          {
            foreignKeyName: "msqa_buyer_fk"
            columns: ["buyer_principal_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "msqa_destination_buyer_fk"
            columns: ["delivery_destination_version_id", "buyer_principal_id"]
            isOneToOne: false
            referencedRelation: "customer_delivery_destination_versions"
            referencedColumns: ["id", "buyer_principal_id"]
          },
          {
            foreignKeyName: "msqa_offer_binding_fk"
            columns: [
              "manual_shipping_quote_offer_id",
              "manual_shipping_quote_request_id",
              "buyer_principal_id",
              "company_id",
              "merchant_store_id",
              "currency_code",
            ]
            isOneToOne: false
            referencedRelation: "manual_shipping_quote_offers"
            referencedColumns: [
              "id",
              "manual_shipping_quote_request_id",
              "buyer_principal_id",
              "company_id",
              "merchant_store_id",
              "currency_code",
            ]
          },
          {
            foreignKeyName: "msqa_origin_tenancy_fk"
            columns: [
              "fulfillment_origin_id",
              "company_id",
              "merchant_store_id",
            ]
            isOneToOne: false
            referencedRelation: "merchant_fulfillment_origins"
            referencedColumns: ["id", "company_id", "merchant_store_id"]
          },
          {
            foreignKeyName: "msqa_request_family_fk"
            columns: ["manual_shipping_quote_request_id", "request_family_id"]
            isOneToOne: false
            referencedRelation: "manual_shipping_quote_requests"
            referencedColumns: ["id", "request_family_id"]
          },
        ]
      }
      manual_shipping_quote_offer_conditions: {
        Row: {
          condition_code: string
          condition_number: number
          condition_text: string | null
          created_at: string
          id: string
          manual_shipping_quote_offer_id: string
        }
        Insert: {
          condition_code: string
          condition_number: number
          condition_text?: string | null
          created_at?: string
          id?: string
          manual_shipping_quote_offer_id: string
        }
        Update: {
          condition_code?: string
          condition_number?: number
          condition_text?: string | null
          created_at?: string
          id?: string
          manual_shipping_quote_offer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_shipping_quote_offer_c_manual_shipping_quote_offer__fkey"
            columns: ["manual_shipping_quote_offer_id"]
            isOneToOne: false
            referencedRelation: "manual_shipping_quote_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_shipping_quote_offers: {
        Row: {
          buyer_principal_id: string
          carrier_code: string | null
          company_id: string
          created_at: string
          currency_code: string
          customer_shipping_charge_minor: number | null
          delivery_max_calendar_days_after_acceptance: number | null
          delivery_min_calendar_days_after_acceptance: number | null
          expires_at: string | null
          id: string
          manual_shipping_quote_request_id: string
          merchant_store_id: string
          offered_at: string | null
          quote_source: string
          responsible_party: string
          service_code: string | null
          status: string
          supersedes_offer_id: string | null
          updated_at: string
          version_number: number
        }
        Insert: {
          buyer_principal_id: string
          carrier_code?: string | null
          company_id: string
          created_at?: string
          currency_code: string
          customer_shipping_charge_minor?: number | null
          delivery_max_calendar_days_after_acceptance?: number | null
          delivery_min_calendar_days_after_acceptance?: number | null
          expires_at?: string | null
          id?: string
          manual_shipping_quote_request_id: string
          merchant_store_id: string
          offered_at?: string | null
          quote_source: string
          responsible_party: string
          service_code?: string | null
          status?: string
          supersedes_offer_id?: string | null
          updated_at?: string
          version_number: number
        }
        Update: {
          buyer_principal_id?: string
          carrier_code?: string | null
          company_id?: string
          created_at?: string
          currency_code?: string
          customer_shipping_charge_minor?: number | null
          delivery_max_calendar_days_after_acceptance?: number | null
          delivery_min_calendar_days_after_acceptance?: number | null
          expires_at?: string | null
          id?: string
          manual_shipping_quote_request_id?: string
          merchant_store_id?: string
          offered_at?: string | null
          quote_source?: string
          responsible_party?: string
          service_code?: string | null
          status?: string
          supersedes_offer_id?: string | null
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "msqo_request_binding_fk"
            columns: [
              "manual_shipping_quote_request_id",
              "buyer_principal_id",
              "company_id",
              "merchant_store_id",
              "currency_code",
            ]
            isOneToOne: false
            referencedRelation: "manual_shipping_quote_requests"
            referencedColumns: [
              "id",
              "buyer_principal_id",
              "company_id",
              "merchant_store_id",
              "currency_code",
            ]
          },
          {
            foreignKeyName: "msqo_supersedes_binding_fk"
            columns: [
              "supersedes_offer_id",
              "manual_shipping_quote_request_id",
              "buyer_principal_id",
              "company_id",
              "merchant_store_id",
              "currency_code",
            ]
            isOneToOne: false
            referencedRelation: "manual_shipping_quote_offers"
            referencedColumns: [
              "id",
              "manual_shipping_quote_request_id",
              "buyer_principal_id",
              "company_id",
              "merchant_store_id",
              "currency_code",
            ]
          },
        ]
      }
      manual_shipping_quote_request_items: {
        Row: {
          company_id: string
          created_at: string
          id: string
          line_number: number
          manual_shipping_quote_request_id: string
          merchant_store_id: string
          quantity: number
          shipping_profile_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          line_number: number
          manual_shipping_quote_request_id: string
          merchant_store_id: string
          quantity: number
          shipping_profile_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          line_number?: number
          manual_shipping_quote_request_id?: string
          merchant_store_id?: string
          quantity?: number
          shipping_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "msqri_profile_tenancy_fk"
            columns: ["shipping_profile_id", "company_id", "merchant_store_id"]
            isOneToOne: false
            referencedRelation: "merchant_store_sku_shipping_profiles"
            referencedColumns: ["id", "company_id", "merchant_store_id"]
          },
          {
            foreignKeyName: "msqri_request_tenancy_fk"
            columns: [
              "manual_shipping_quote_request_id",
              "company_id",
              "merchant_store_id",
            ]
            isOneToOne: false
            referencedRelation: "manual_shipping_quote_requests"
            referencedColumns: ["id", "company_id", "merchant_store_id"]
          },
        ]
      }
      manual_shipping_quote_request_packages: {
        Row: {
          created_at: string
          height_mm: number
          id: string
          length_mm: number
          manual_shipping_quote_request_id: string
          package_count: number
          package_number: number
          source_shipping_package_id: string | null
          weight_grams: number
          width_mm: number
        }
        Insert: {
          created_at?: string
          height_mm: number
          id?: string
          length_mm: number
          manual_shipping_quote_request_id: string
          package_count: number
          package_number: number
          source_shipping_package_id?: string | null
          weight_grams: number
          width_mm: number
        }
        Update: {
          created_at?: string
          height_mm?: number
          id?: string
          length_mm?: number
          manual_shipping_quote_request_id?: string
          package_count?: number
          package_number?: number
          source_shipping_package_id?: string | null
          weight_grams?: number
          width_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "manual_shipping_quote_request_manual_shipping_quote_reques_fkey"
            columns: ["manual_shipping_quote_request_id"]
            isOneToOne: false
            referencedRelation: "manual_shipping_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_shipping_quote_request_p_source_shipping_package_id_fkey"
            columns: ["source_shipping_package_id"]
            isOneToOne: false
            referencedRelation: "merchant_store_sku_shipping_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_shipping_quote_requests: {
        Row: {
          buyer_principal_id: string
          company_id: string
          created_at: string
          currency_code: string
          delivery_destination_version_id: string
          expires_at: string | null
          fulfillment_origin_id: string | null
          id: string
          merchant_store_id: string
          request_family_id: string
          requested_at: string | null
          shipment_form: string
          status: string
          supersedes_request_id: string | null
          updated_at: string
          version_number: number
        }
        Insert: {
          buyer_principal_id: string
          company_id: string
          created_at?: string
          currency_code: string
          delivery_destination_version_id: string
          expires_at?: string | null
          fulfillment_origin_id?: string | null
          id?: string
          merchant_store_id: string
          request_family_id?: string
          requested_at?: string | null
          shipment_form: string
          status?: string
          supersedes_request_id?: string | null
          updated_at?: string
          version_number?: number
        }
        Update: {
          buyer_principal_id?: string
          company_id?: string
          created_at?: string
          currency_code?: string
          delivery_destination_version_id?: string
          expires_at?: string | null
          fulfillment_origin_id?: string | null
          id?: string
          merchant_store_id?: string
          request_family_id?: string
          requested_at?: string | null
          shipment_form?: string
          status?: string
          supersedes_request_id?: string | null
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "manual_shipping_quote_requests_buyer_principal_id_fkey"
            columns: ["buyer_principal_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_shipping_quote_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_shipping_quote_requests_supersedes_request_id_fkey"
            columns: ["supersedes_request_id"]
            isOneToOne: false
            referencedRelation: "manual_shipping_quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "msqr_destination_buyer_fk"
            columns: ["delivery_destination_version_id", "buyer_principal_id"]
            isOneToOne: false
            referencedRelation: "customer_delivery_destination_versions"
            referencedColumns: ["id", "buyer_principal_id"]
          },
          {
            foreignKeyName: "msqr_origin_tenancy_fk"
            columns: [
              "fulfillment_origin_id",
              "company_id",
              "merchant_store_id",
            ]
            isOneToOne: false
            referencedRelation: "merchant_fulfillment_origins"
            referencedColumns: ["id", "company_id", "merchant_store_id"]
          },
          {
            foreignKeyName: "msqr_store_company_fk"
            columns: ["merchant_store_id", "company_id"]
            isOneToOne: false
            referencedRelation: "merchant_stores"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      manual_shipping_quote_state_events: {
        Row: {
          actor_principal_id: string | null
          actor_type: string
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          manual_shipping_quote_offer_id: string | null
          manual_shipping_quote_request_id: string
          occurred_at: string
          reason_code: string | null
          request_family_id: string
          subject: string
          to_status: string | null
        }
        Insert: {
          actor_principal_id?: string | null
          actor_type: string
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          manual_shipping_quote_offer_id?: string | null
          manual_shipping_quote_request_id: string
          occurred_at?: string
          reason_code?: string | null
          request_family_id: string
          subject: string
          to_status?: string | null
        }
        Update: {
          actor_principal_id?: string | null
          actor_type?: string
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          manual_shipping_quote_offer_id?: string | null
          manual_shipping_quote_request_id?: string
          occurred_at?: string
          reason_code?: string | null
          request_family_id?: string
          subject?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "msqse_offer_fk"
            columns: ["manual_shipping_quote_offer_id"]
            isOneToOne: false
            referencedRelation: "manual_shipping_quote_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "msqse_request_family_fk"
            columns: ["manual_shipping_quote_request_id", "request_family_id"]
            isOneToOne: false
            referencedRelation: "manual_shipping_quote_requests"
            referencedColumns: ["id", "request_family_id"]
          },
        ]
      }
      merchant_fulfillment_origins: {
        Row: {
          company_id: string
          country_code: string
          created_at: string
          id: string
          label: string
          merchant_store_id: string
          origin_type: string
          postal_code: string | null
          status: string
          updated_at: string
          warehouse_id: string | null
          warehouse_location_id: string | null
        }
        Insert: {
          company_id: string
          country_code: string
          created_at?: string
          id?: string
          label: string
          merchant_store_id: string
          origin_type: string
          postal_code?: string | null
          status?: string
          updated_at?: string
          warehouse_id?: string | null
          warehouse_location_id?: string | null
        }
        Update: {
          company_id?: string
          country_code?: string
          created_at?: string
          id?: string
          label?: string
          merchant_store_id?: string
          origin_type?: string
          postal_code?: string | null
          status?: string
          updated_at?: string
          warehouse_id?: string | null
          warehouse_location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mfo_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mfo_location_warehouse_fk"
            columns: ["warehouse_location_id", "warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouse_locations"
            referencedColumns: ["id", "warehouse_id"]
          },
          {
            foreignKeyName: "mfo_store_company_fk"
            columns: ["merchant_store_id", "company_id"]
            isOneToOne: false
            referencedRelation: "merchant_stores"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "mfo_warehouse_company_fk"
            columns: ["warehouse_id", "company_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      merchant_store_offer_prices: {
        Row: {
          catalog_sku_id: string
          created_at: string
          created_by: string | null
          currency_code: string
          destination_country_code: string
          gross_amount_minor: number
          id: string
          merchant_store_id: string
          status: string
          supersedes_price_id: string | null
          tax_rate_version_id: string | null
          updated_at: string
          updated_by: string | null
          valid_from: string
          valid_to: string | null
          version: number
        }
        Insert: {
          catalog_sku_id: string
          created_at?: string
          created_by?: string | null
          currency_code: string
          destination_country_code: string
          gross_amount_minor: number
          id?: string
          merchant_store_id: string
          status?: string
          supersedes_price_id?: string | null
          tax_rate_version_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_from: string
          valid_to?: string | null
          version?: number
        }
        Update: {
          catalog_sku_id?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          destination_country_code?: string
          gross_amount_minor?: number
          id?: string
          merchant_store_id?: string
          status?: string
          supersedes_price_id?: string | null
          tax_rate_version_id?: string | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string
          valid_to?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "merchant_store_offer_prices_catalog_sku_id_fkey"
            columns: ["catalog_sku_id"]
            isOneToOne: false
            referencedRelation: "catalog_skus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_store_offer_prices_merchant_store_id_fkey"
            columns: ["merchant_store_id"]
            isOneToOne: false
            referencedRelation: "merchant_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_store_offer_prices_supersedes_price_id_fkey"
            columns: ["supersedes_price_id"]
            isOneToOne: false
            referencedRelation: "merchant_store_offer_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_store_offer_prices_tax_rate_version_id_fkey"
            columns: ["tax_rate_version_id"]
            isOneToOne: false
            referencedRelation: "tax_rate_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_store_public_profile_categories: {
        Row: {
          category_code: string
          created_at: string
          merchant_store_id: string
          position: number
        }
        Insert: {
          category_code: string
          created_at?: string
          merchant_store_id: string
          position?: number
        }
        Update: {
          category_code?: string
          created_at?: string
          merchant_store_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "merchant_store_public_profile_categories_merchant_store_id_fkey"
            columns: ["merchant_store_id"]
            isOneToOne: false
            referencedRelation: "merchant_store_public_profiles"
            referencedColumns: ["merchant_store_id"]
          },
        ]
      }
      merchant_store_public_profile_shipping_countries: {
        Row: {
          country_code: string
          created_at: string
          merchant_store_id: string
        }
        Insert: {
          country_code: string
          created_at?: string
          merchant_store_id: string
        }
        Update: {
          country_code?: string
          created_at?: string
          merchant_store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_store_public_profile_shipping_c_merchant_store_id_fkey"
            columns: ["merchant_store_id"]
            isOneToOne: false
            referencedRelation: "merchant_store_public_profiles"
            referencedColumns: ["merchant_store_id"]
          },
        ]
      }
      merchant_store_public_profiles: {
        Row: {
          company_id: string
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          customer_service_summary: string | null
          display_name: string
          full_description: string | null
          logo_url: string | null
          merchant_store_id: string
          public_slug: string
          published_at: string | null
          published_by: string | null
          return_policy_summary: string | null
          seller_since: string | null
          short_description: string | null
          suspended_at: string | null
          suspension_reason: string | null
          updated_at: string
          updated_by: string | null
          visibility_status: string
          warranty_summary: string | null
        }
        Insert: {
          company_id: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          customer_service_summary?: string | null
          display_name: string
          full_description?: string | null
          logo_url?: string | null
          merchant_store_id: string
          public_slug: string
          published_at?: string | null
          published_by?: string | null
          return_policy_summary?: string | null
          seller_since?: string | null
          short_description?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
          updated_by?: string | null
          visibility_status?: string
          warranty_summary?: string | null
        }
        Update: {
          company_id?: string
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          customer_service_summary?: string | null
          display_name?: string
          full_description?: string | null
          logo_url?: string | null
          merchant_store_id?: string
          public_slug?: string
          published_at?: string | null
          published_by?: string | null
          return_policy_summary?: string | null
          seller_since?: string | null
          short_description?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
          updated_by?: string | null
          visibility_status?: string
          warranty_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mspp_store_company_fk"
            columns: ["merchant_store_id", "company_id"]
            isOneToOne: false
            referencedRelation: "merchant_stores"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      merchant_store_sku_delivery_promise_assignments: {
        Row: {
          company_id: string
          created_at: string
          delivery_promise_profile_id: string
          fulfillment_mode: string
          fulfillment_origin_id: string
          id: string
          merchant_store_id: string
          promise_company_id: string | null
          promise_scope_type: string | null
          promise_store_id: string | null
          shipping_profile_id: string
          status: string
          supersedes_assignment_id: string | null
          updated_at: string
          version_number: number
        }
        Insert: {
          company_id: string
          created_at?: string
          delivery_promise_profile_id: string
          fulfillment_mode: string
          fulfillment_origin_id: string
          id?: string
          merchant_store_id: string
          promise_company_id?: string | null
          promise_scope_type?: string | null
          promise_store_id?: string | null
          shipping_profile_id: string
          status?: string
          supersedes_assignment_id?: string | null
          updated_at?: string
          version_number: number
        }
        Update: {
          company_id?: string
          created_at?: string
          delivery_promise_profile_id?: string
          fulfillment_mode?: string
          fulfillment_origin_id?: string
          id?: string
          merchant_store_id?: string
          promise_company_id?: string | null
          promise_scope_type?: string | null
          promise_store_id?: string | null
          shipping_profile_id?: string
          status?: string
          supersedes_assignment_id?: string | null
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "mssdpa_origin_eligibility_fk"
            columns: ["shipping_profile_id", "fulfillment_origin_id"]
            isOneToOne: false
            referencedRelation: "merchant_store_sku_fulfillment_origins"
            referencedColumns: ["shipping_profile_id", "fulfillment_origin_id"]
          },
          {
            foreignKeyName: "mssdpa_origin_tenancy_fk"
            columns: [
              "fulfillment_origin_id",
              "company_id",
              "merchant_store_id",
            ]
            isOneToOne: false
            referencedRelation: "merchant_fulfillment_origins"
            referencedColumns: ["id", "company_id", "merchant_store_id"]
          },
          {
            foreignKeyName: "mssdpa_profile_tenancy_fk"
            columns: ["shipping_profile_id", "company_id", "merchant_store_id"]
            isOneToOne: false
            referencedRelation: "merchant_store_sku_shipping_profiles"
            referencedColumns: ["id", "company_id", "merchant_store_id"]
          },
          {
            foreignKeyName: "mssdpa_promise_scope_fk"
            columns: ["delivery_promise_profile_id", "promise_scope_type"]
            isOneToOne: false
            referencedRelation: "delivery_promise_profiles"
            referencedColumns: ["id", "scope_type"]
          },
          {
            foreignKeyName: "mssdpa_promise_tenancy_fk"
            columns: [
              "delivery_promise_profile_id",
              "promise_company_id",
              "promise_store_id",
            ]
            isOneToOne: false
            referencedRelation: "delivery_promise_profiles"
            referencedColumns: ["id", "company_id", "merchant_store_id"]
          },
          {
            foreignKeyName: "mssdpa_supersedes_fk"
            columns: ["supersedes_assignment_id"]
            isOneToOne: false
            referencedRelation: "merchant_store_sku_delivery_promise_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_store_sku_fulfillment_origins: {
        Row: {
          company_id: string
          created_at: string
          fulfillment_origin_id: string
          id: string
          is_default: boolean
          merchant_store_id: string
          priority: number
          shipping_profile_id: string
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          fulfillment_origin_id: string
          id?: string
          is_default?: boolean
          merchant_store_id: string
          priority: number
          shipping_profile_id: string
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          fulfillment_origin_id?: string
          id?: string
          is_default?: boolean
          merchant_store_id?: string
          priority?: number
          shipping_profile_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "msfo_origin_tenancy_fk"
            columns: [
              "fulfillment_origin_id",
              "company_id",
              "merchant_store_id",
            ]
            isOneToOne: false
            referencedRelation: "merchant_fulfillment_origins"
            referencedColumns: ["id", "company_id", "merchant_store_id"]
          },
          {
            foreignKeyName: "msfo_profile_tenancy_fk"
            columns: ["shipping_profile_id", "company_id", "merchant_store_id"]
            isOneToOne: false
            referencedRelation: "merchant_store_sku_shipping_profiles"
            referencedColumns: ["id", "company_id", "merchant_store_id"]
          },
        ]
      }
      merchant_store_sku_shipping_packages: {
        Row: {
          company_id: string
          created_at: string
          height_mm: number
          id: string
          length_mm: number
          merchant_store_id: string
          package_number: number
          quantity_per_package: number
          requires_original_packaging: boolean
          shipping_profile_id: string
          stackable: boolean
          weight_grams: number
          width_mm: number
        }
        Insert: {
          company_id: string
          created_at?: string
          height_mm: number
          id?: string
          length_mm: number
          merchant_store_id: string
          package_number: number
          quantity_per_package: number
          requires_original_packaging?: boolean
          shipping_profile_id: string
          stackable?: boolean
          weight_grams: number
          width_mm: number
        }
        Update: {
          company_id?: string
          created_at?: string
          height_mm?: number
          id?: string
          length_mm?: number
          merchant_store_id?: string
          package_number?: number
          quantity_per_package?: number
          requires_original_packaging?: boolean
          shipping_profile_id?: string
          stackable?: boolean
          weight_grams?: number
          width_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "msspkg_profile_tenancy_fk"
            columns: ["shipping_profile_id", "company_id", "merchant_store_id"]
            isOneToOne: false
            referencedRelation: "merchant_store_sku_shipping_profiles"
            referencedColumns: ["id", "company_id", "merchant_store_id"]
          },
        ]
      }
      merchant_store_sku_shipping_profiles: {
        Row: {
          can_combine_with_other_items: boolean
          catalog_sku_id: string
          company_id: string
          created_at: string
          dangerous_goods: boolean
          handling_class: string
          id: string
          merchant_store_id: string
          oversized: boolean
          pickup_only: boolean
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          can_combine_with_other_items?: boolean
          catalog_sku_id: string
          company_id: string
          created_at?: string
          dangerous_goods?: boolean
          handling_class?: string
          id?: string
          merchant_store_id: string
          oversized?: boolean
          pickup_only?: boolean
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          can_combine_with_other_items?: boolean
          catalog_sku_id?: string
          company_id?: string
          created_at?: string
          dangerous_goods?: boolean
          handling_class?: string
          id?: string
          merchant_store_id?: string
          oversized?: boolean
          pickup_only?: boolean
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "mssp_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mssp_sku_company_fk"
            columns: ["catalog_sku_id", "company_id"]
            isOneToOne: false
            referencedRelation: "catalog_skus"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "mssp_store_company_fk"
            columns: ["merchant_store_id", "company_id"]
            isOneToOne: false
            referencedRelation: "merchant_stores"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      merchant_stores: {
        Row: {
          banner_url: string | null
          branding: Json
          company_id: string
          country_code: string
          create_idempotency_key: string | null
          created_at: string
          created_by: string | null
          customer_facing_settings: Json
          default_currency: string
          default_locale: string
          description: string | null
          display_name: string
          id: string
          is_primary: boolean
          logo_url: string | null
          returns_policy_url: string | null
          sales_terms_url: string | null
          slug: string
          status: string
          support_email: string | null
          support_phone: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          banner_url?: string | null
          branding?: Json
          company_id: string
          country_code?: string
          create_idempotency_key?: string | null
          created_at?: string
          created_by?: string | null
          customer_facing_settings?: Json
          default_currency?: string
          default_locale?: string
          description?: string | null
          display_name: string
          id?: string
          is_primary?: boolean
          logo_url?: string | null
          returns_policy_url?: string | null
          sales_terms_url?: string | null
          slug: string
          status?: string
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          banner_url?: string | null
          branding?: Json
          company_id?: string
          country_code?: string
          create_idempotency_key?: string | null
          created_at?: string
          created_by?: string | null
          customer_facing_settings?: Json
          default_currency?: string
          default_locale?: string
          description?: string | null
          display_name?: string
          id?: string
          is_primary?: boolean
          logo_url?: string | null
          returns_policy_url?: string | null
          sales_terms_url?: string | null
          slug?: string
          status?: string
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_stores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          cancelled_at: string | null
          delivered_at: string | null
          id: string
          order_id: string
          price_cents: number
          processing_at: string | null
          product_id: string
          quantity: number
          seller_id: string
          shipped_at: string | null
          status: string
          title: string
          tracking_carrier: string | null
          tracking_code: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          delivered_at?: string | null
          id?: string
          order_id: string
          price_cents: number
          processing_at?: string | null
          product_id: string
          quantity: number
          seller_id: string
          shipped_at?: string | null
          status?: string
          title: string
          tracking_carrier?: string | null
          tracking_code?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          delivered_at?: string | null
          id?: string
          order_id?: string
          price_cents?: number
          processing_at?: string | null
          product_id?: string
          quantity?: number
          seller_id?: string
          shipped_at?: string | null
          status?: string
          title?: string
          tracking_carrier?: string | null
          tracking_code?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          id: string
          shipping_address: Json | null
          status: string
          total_cents: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          shipping_address?: Json | null
          status?: string
          total_cents: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          shipping_address?: Json | null
          status?: string
          total_cents?: number
          user_id?: string
        }
        Relationships: []
      }
      outbox_dead_letters: {
        Row: {
          attempts: number
          channel_account_id: string
          company_id: string
          created_at: string
          event_id: string
          id: string
          last_error: string | null
          listing_id: string
          listing_version: number
          reason: string
        }
        Insert: {
          attempts: number
          channel_account_id: string
          company_id: string
          created_at?: string
          event_id: string
          id?: string
          last_error?: string | null
          listing_id: string
          listing_version: number
          reason: string
        }
        Update: {
          attempts?: number
          channel_account_id?: string
          company_id?: string
          created_at?: string
          event_id?: string
          id?: string
          last_error?: string | null
          listing_id?: string
          listing_version?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbox_dead_letters_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "outbox_events"
            referencedColumns: ["id"]
          },
        ]
      }
      outbox_events: {
        Row: {
          attempts: number
          channel_account_id: string
          claim_token: string | null
          claimed_at: string | null
          company_id: string
          created_at: string
          delivered_at: string | null
          event_type: string
          id: string
          last_error: string | null
          lease_expires_at: string | null
          listing_id: string
          listing_version: number
          max_attempts: number
          next_attempt_at: string | null
          offer_id: string | null
          payload: Json
          sku_id: string | null
          status: string
        }
        Insert: {
          attempts?: number
          channel_account_id: string
          claim_token?: string | null
          claimed_at?: string | null
          company_id: string
          created_at?: string
          delivered_at?: string | null
          event_type: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          listing_id: string
          listing_version: number
          max_attempts?: number
          next_attempt_at?: string | null
          offer_id?: string | null
          payload?: Json
          sku_id?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          channel_account_id?: string
          claim_token?: string | null
          claimed_at?: string | null
          company_id?: string
          created_at?: string
          delivered_at?: string | null
          event_type?: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          listing_id?: string
          listing_version?: number
          max_attempts?: number
          next_attempt_at?: string | null
          offer_id?: string | null
          payload?: Json
          sku_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbox_events_channel_account_id_fkey"
            columns: ["channel_account_id"]
            isOneToOne: false
            referencedRelation: "channel_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbox_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbox_events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "channel_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbox_events_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "catalog_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbox_events_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "catalog_skus"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
        }
        Relationships: []
      }
      product_suggestions: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          applied_value: Json | null
          before_value: Json | null
          created_at: string
          current_value: Json | null
          decided_at: string | null
          decided_by: string | null
          feedback: string | null
          id: string
          product_id: string | null
          product_updated_at_at_suggestion: string | null
          reasoning: string | null
          seller_id: string
          status: string
          suggested_value: Json
          suggestion_type: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          applied_value?: Json | null
          before_value?: Json | null
          created_at?: string
          current_value?: Json | null
          decided_at?: string | null
          decided_by?: string | null
          feedback?: string | null
          id?: string
          product_id?: string | null
          product_updated_at_at_suggestion?: string | null
          reasoning?: string | null
          seller_id: string
          status?: string
          suggested_value: Json
          suggestion_type: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          applied_value?: Json | null
          before_value?: Json | null
          created_at?: string
          current_value?: Json | null
          decided_at?: string | null
          decided_by?: string | null
          feedback?: string | null
          id?: string
          product_id?: string | null
          product_updated_at_at_suggestion?: string | null
          reasoning?: string | null
          seller_id?: string
          status?: string
          suggested_value?: Json
          suggestion_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_suggestions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category_id: string | null
          created_at: string
          description: string | null
          gallery: string[]
          highlights: string[]
          id: string
          image_url: string | null
          is_active: boolean
          is_draft: boolean
          original_price_cents: number | null
          price_cents: number
          rating: number | null
          review_count: number | null
          seller_id: string
          specs: Json
          stock: number
          title: string
          updated_at: string
        }
        Insert: {
          brand?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          gallery?: string[]
          highlights?: string[]
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_draft?: boolean
          original_price_cents?: number | null
          price_cents: number
          rating?: number | null
          review_count?: number | null
          seller_id: string
          specs?: Json
          stock?: number
          title: string
          updated_at?: string
        }
        Update: {
          brand?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          gallery?: string[]
          highlights?: string[]
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_draft?: boolean
          original_price_cents?: number | null
          price_cents?: number
          rating?: number | null
          review_count?: number | null
          seller_id?: string
          specs?: Json
          stock?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          seller_shop_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          seller_shop_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          seller_shop_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "system_company_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_application_events: {
        Row: {
          actor_role: string
          actor_user_id: string | null
          application_id: string
          company_id: string
          event_type: string
          from_status: string | null
          id: string
          occurred_at: string
          reason: string | null
          to_status: string | null
        }
        Insert: {
          actor_role: string
          actor_user_id?: string | null
          application_id: string
          company_id: string
          event_type: string
          from_status?: string | null
          id?: string
          occurred_at?: string
          reason?: string | null
          to_status?: string | null
        }
        Update: {
          actor_role?: string
          actor_user_id?: string | null
          application_id?: string
          company_id?: string
          event_type?: string
          from_status?: string | null
          id?: string
          occurred_at?: string
          reason?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "seller_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_application_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_applications: {
        Row: {
          approved_at: string | null
          business_summary: string | null
          company_id: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          decided_by: string | null
          expected_monthly_orders: number | null
          id: string
          information_requested_at: string | null
          information_required_reason: string | null
          intended_categories: string[]
          rejected_at: string | null
          rejection_reason: string | null
          review_started_at: string | null
          reviewer_note: string | null
          seller_note: string | null
          status: string
          store_id: string | null
          submitted_at: string | null
          suspended_at: string | null
          suspension_reason: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          business_summary?: string | null
          company_id: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          decided_by?: string | null
          expected_monthly_orders?: number | null
          id?: string
          information_requested_at?: string | null
          information_required_reason?: string | null
          intended_categories?: string[]
          rejected_at?: string | null
          rejection_reason?: string | null
          review_started_at?: string | null
          reviewer_note?: string | null
          seller_note?: string | null
          status?: string
          store_id?: string | null
          submitted_at?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          business_summary?: string | null
          company_id?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          decided_by?: string | null
          expected_monthly_orders?: number | null
          id?: string
          information_requested_at?: string | null
          information_required_reason?: string | null
          intended_categories?: string[]
          rejected_at?: string | null
          rejection_reason?: string | null
          review_started_at?: string | null
          reviewer_note?: string | null
          seller_note?: string | null
          status?: string
          store_id?: string | null
          submitted_at?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_applications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_applications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "merchant_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_bol_credentials: {
        Row: {
          client_id_ciphertext: string
          client_secret_ciphertext: string
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id_ciphertext: string
          client_secret_ciphertext: string
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id_ciphertext?: string
          client_secret_ciphertext?: string
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      seller_verification_events: {
        Row: {
          actor_role: string
          actor_user_id: string | null
          company_id: string
          event_type: string
          from_status: string | null
          id: string
          occurred_at: string
          reason: string | null
          scope: string
          to_status: string | null
        }
        Insert: {
          actor_role: string
          actor_user_id?: string | null
          company_id: string
          event_type: string
          from_status?: string | null
          id?: string
          occurred_at?: string
          reason?: string | null
          scope: string
          to_status?: string | null
        }
        Update: {
          actor_role?: string
          actor_user_id?: string | null
          company_id?: string
          event_type?: string
          from_status?: string | null
          id?: string
          occurred_at?: string
          reason?: string | null
          scope?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_verification_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_outbox_dead_letters: {
        Row: {
          attempts: number
          channel_account_id: string
          channel_shipment_id: string
          company_id: string
          event_kind: string
          id: string
          last_error: string | null
          moved_at: string
          original_event_id: string
          payload: Json
        }
        Insert: {
          attempts: number
          channel_account_id: string
          channel_shipment_id: string
          company_id: string
          event_kind: string
          id?: string
          last_error?: string | null
          moved_at?: string
          original_event_id: string
          payload: Json
        }
        Update: {
          attempts?: number
          channel_account_id?: string
          channel_shipment_id?: string
          company_id?: string
          event_kind?: string
          id?: string
          last_error?: string | null
          moved_at?: string
          original_event_id?: string
          payload?: Json
        }
        Relationships: []
      }
      shipment_outbox_events: {
        Row: {
          attempt_count: number
          channel_account_id: string
          channel_shipment_id: string
          company_id: string
          created_at: string
          event_kind: string
          external_ref: Json | null
          id: string
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          max_attempts: number
          next_visible_at: string
          payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          channel_account_id: string
          channel_shipment_id: string
          company_id: string
          created_at?: string
          event_kind: string
          external_ref?: Json | null
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          max_attempts?: number
          next_visible_at?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          channel_account_id?: string
          channel_shipment_id?: string
          company_id?: string
          created_at?: string
          event_kind?: string
          external_ref?: Json | null
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          max_attempts?: number
          next_visible_at?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_outbox_events_channel_shipment_id_fkey"
            columns: ["channel_shipment_id"]
            isOneToOne: false
            referencedRelation: "channel_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_calendar_blackout_dates: {
        Row: {
          blackout_date: string
          created_at: string
          description: string | null
          id: string
          reason_code: string
          shipping_calendar_profile_id: string
        }
        Insert: {
          blackout_date: string
          created_at?: string
          description?: string | null
          id?: string
          reason_code: string
          shipping_calendar_profile_id: string
        }
        Update: {
          blackout_date?: string
          created_at?: string
          description?: string | null
          id?: string
          reason_code?: string
          shipping_calendar_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scbd_calendar_fk"
            columns: ["shipping_calendar_profile_id"]
            isOneToOne: false
            referencedRelation: "shipping_calendar_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_calendar_profiles: {
        Row: {
          calendar_code: string
          calendar_type: string
          company_id: string | null
          country_code: string | null
          created_at: string
          id: string
          merchant_store_id: string | null
          scope_type: string
          status: string
          supersedes_calendar_id: string | null
          timezone_name: string
          updated_at: string
          version_number: number
        }
        Insert: {
          calendar_code: string
          calendar_type: string
          company_id?: string | null
          country_code?: string | null
          created_at?: string
          id?: string
          merchant_store_id?: string | null
          scope_type: string
          status?: string
          supersedes_calendar_id?: string | null
          timezone_name: string
          updated_at?: string
          version_number: number
        }
        Update: {
          calendar_code?: string
          calendar_type?: string
          company_id?: string | null
          country_code?: string | null
          created_at?: string
          id?: string
          merchant_store_id?: string | null
          scope_type?: string
          status?: string
          supersedes_calendar_id?: string | null
          timezone_name?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scp_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scp_store_company_fk"
            columns: ["merchant_store_id", "company_id"]
            isOneToOne: false
            referencedRelation: "merchant_stores"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "scp_supersedes_fk"
            columns: ["supersedes_calendar_id"]
            isOneToOne: false
            referencedRelation: "shipping_calendar_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_rate_cards: {
        Row: {
          carrier_code: string
          company_id: string | null
          created_at: string
          currency_code: string
          customer_charge_tax_basis: string
          id: string
          merchant_store_id: string | null
          scope_type: string
          service_code: string
          status: string
          supersedes_card_id: string | null
          updated_at: string
          valid_from: string
          valid_to: string | null
          volumetric_divisor: number | null
        }
        Insert: {
          carrier_code: string
          company_id?: string | null
          created_at?: string
          currency_code: string
          customer_charge_tax_basis?: string
          id?: string
          merchant_store_id?: string | null
          scope_type: string
          service_code: string
          status?: string
          supersedes_card_id?: string | null
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
          volumetric_divisor?: number | null
        }
        Update: {
          carrier_code?: string
          company_id?: string | null
          created_at?: string
          currency_code?: string
          customer_charge_tax_basis?: string
          id?: string
          merchant_store_id?: string | null
          scope_type?: string
          service_code?: string
          status?: string
          supersedes_card_id?: string | null
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
          volumetric_divisor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "src_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "src_store_company_fk"
            columns: ["merchant_store_id", "company_id"]
            isOneToOne: false
            referencedRelation: "merchant_stores"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "src_supersedes_fk"
            columns: ["supersedes_card_id"]
            isOneToOne: false
            referencedRelation: "shipping_rate_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_rate_lane_transit_profile_bindings: {
        Row: {
          created_at: string
          id: string
          shipping_rate_lane_id: string
          shipping_transit_time_profile_id: string
          status: string
          supersedes_binding_id: string | null
          updated_at: string
          version_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          shipping_rate_lane_id: string
          shipping_transit_time_profile_id: string
          status?: string
          supersedes_binding_id?: string | null
          updated_at?: string
          version_number: number
        }
        Update: {
          created_at?: string
          id?: string
          shipping_rate_lane_id?: string
          shipping_transit_time_profile_id?: string
          status?: string
          supersedes_binding_id?: string | null
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "shipping_rate_lane_transit_pr_shipping_transit_time_profil_fkey"
            columns: ["shipping_transit_time_profile_id"]
            isOneToOne: false
            referencedRelation: "shipping_transit_time_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_rate_lane_transit_profile_b_shipping_rate_lane_id_fkey"
            columns: ["shipping_rate_lane_id"]
            isOneToOne: false
            referencedRelation: "shipping_rate_lanes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "srltpb_supersedes_same_lane_fk"
            columns: ["supersedes_binding_id", "shipping_rate_lane_id"]
            isOneToOne: false
            referencedRelation: "shipping_rate_lane_transit_profile_bindings"
            referencedColumns: ["id", "shipping_rate_lane_id"]
          },
        ]
      }
      shipping_rate_lanes: {
        Row: {
          card_company_id: string | null
          card_merchant_store_id: string | null
          created_at: string
          destination_country_code: string
          fulfillment_origin_id: string | null
          id: string
          origin_country_code: string
          origin_scope_type: string
          shipping_rate_card_id: string
          status: string
        }
        Insert: {
          card_company_id?: string | null
          card_merchant_store_id?: string | null
          created_at?: string
          destination_country_code: string
          fulfillment_origin_id?: string | null
          id?: string
          origin_country_code: string
          origin_scope_type: string
          shipping_rate_card_id: string
          status?: string
        }
        Update: {
          card_company_id?: string | null
          card_merchant_store_id?: string | null
          created_at?: string
          destination_country_code?: string
          fulfillment_origin_id?: string | null
          id?: string
          origin_country_code?: string
          origin_scope_type?: string
          shipping_rate_card_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "srl_card_tenancy_fk"
            columns: [
              "shipping_rate_card_id",
              "card_company_id",
              "card_merchant_store_id",
            ]
            isOneToOne: false
            referencedRelation: "shipping_rate_cards"
            referencedColumns: ["id", "company_id", "merchant_store_id"]
          },
          {
            foreignKeyName: "srl_origin_fk"
            columns: ["fulfillment_origin_id"]
            isOneToOne: false
            referencedRelation: "merchant_fulfillment_origins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "srl_origin_tenancy_fk"
            columns: [
              "fulfillment_origin_id",
              "card_company_id",
              "card_merchant_store_id",
            ]
            isOneToOne: false
            referencedRelation: "merchant_fulfillment_origins"
            referencedColumns: ["id", "company_id", "merchant_store_id"]
          },
        ]
      }
      shipping_rate_rules: {
        Row: {
          billable_weight_from_grams: number
          billable_weight_range: unknown
          billable_weight_to_grams: number
          created_at: string
          customer_charge_amount_minor: number
          free_above_merchandise_amount_minor: number | null
          handling_class: string
          id: string
          max_height_mm: number | null
          max_length_mm: number | null
          max_width_mm: number | null
          parcel_count_from: number
          parcel_count_range: unknown
          parcel_count_to: number
          shipping_rate_lane_id: string
        }
        Insert: {
          billable_weight_from_grams: number
          billable_weight_range?: unknown
          billable_weight_to_grams: number
          created_at?: string
          customer_charge_amount_minor: number
          free_above_merchandise_amount_minor?: number | null
          handling_class: string
          id?: string
          max_height_mm?: number | null
          max_length_mm?: number | null
          max_width_mm?: number | null
          parcel_count_from?: number
          parcel_count_range?: unknown
          parcel_count_to?: number
          shipping_rate_lane_id: string
        }
        Update: {
          billable_weight_from_grams?: number
          billable_weight_range?: unknown
          billable_weight_to_grams?: number
          created_at?: string
          customer_charge_amount_minor?: number
          free_above_merchandise_amount_minor?: number | null
          handling_class?: string
          id?: string
          max_height_mm?: number | null
          max_length_mm?: number | null
          max_width_mm?: number | null
          parcel_count_from?: number
          parcel_count_range?: unknown
          parcel_count_to?: number
          shipping_rate_lane_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "srr_lane_fk"
            columns: ["shipping_rate_lane_id"]
            isOneToOne: false
            referencedRelation: "shipping_rate_lanes"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_transit_delivery_weekdays: {
        Row: {
          created_at: string
          delivery_enabled: boolean
          delivery_weekday_iso: number
          id: string
          shipping_transit_time_profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_enabled: boolean
          delivery_weekday_iso: number
          id?: string
          shipping_transit_time_profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_enabled?: boolean
          delivery_weekday_iso?: number
          id?: string
          shipping_transit_time_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stdw_profile_fk"
            columns: ["shipping_transit_time_profile_id"]
            isOneToOne: false
            referencedRelation: "shipping_transit_time_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_transit_time_profile_calendars: {
        Row: {
          calendar_role: string
          created_at: string
          id: string
          shipping_calendar_profile_id: string
          shipping_transit_time_profile_id: string
        }
        Insert: {
          calendar_role: string
          created_at?: string
          id?: string
          shipping_calendar_profile_id: string
          shipping_transit_time_profile_id: string
        }
        Update: {
          calendar_role?: string
          created_at?: string
          id?: string
          shipping_calendar_profile_id?: string
          shipping_transit_time_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sttpc_calendar_role_fk"
            columns: ["shipping_calendar_profile_id", "calendar_role"]
            isOneToOne: false
            referencedRelation: "shipping_calendar_profiles"
            referencedColumns: ["id", "calendar_type"]
          },
          {
            foreignKeyName: "sttpc_profile_fk"
            columns: ["shipping_transit_time_profile_id"]
            isOneToOne: false
            referencedRelation: "shipping_transit_time_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_transit_time_profiles: {
        Row: {
          carrier_code: string
          company_id: string | null
          created_at: string
          destination_country_code: string
          fulfillment_origin_id: string | null
          id: string
          merchant_store_id: string | null
          origin_country_code: string
          origin_scope_type: string
          profile_code: string
          scope_type: string
          service_code: string
          status: string
          supersedes_profile_id: string | null
          updated_at: string
          version_number: number
        }
        Insert: {
          carrier_code: string
          company_id?: string | null
          created_at?: string
          destination_country_code: string
          fulfillment_origin_id?: string | null
          id?: string
          merchant_store_id?: string | null
          origin_country_code: string
          origin_scope_type: string
          profile_code: string
          scope_type: string
          service_code: string
          status?: string
          supersedes_profile_id?: string | null
          updated_at?: string
          version_number: number
        }
        Update: {
          carrier_code?: string
          company_id?: string | null
          created_at?: string
          destination_country_code?: string
          fulfillment_origin_id?: string | null
          id?: string
          merchant_store_id?: string | null
          origin_country_code?: string
          origin_scope_type?: string
          profile_code?: string
          scope_type?: string
          service_code?: string
          status?: string
          supersedes_profile_id?: string | null
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "sttp_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sttp_origin_tenancy_fk"
            columns: [
              "fulfillment_origin_id",
              "company_id",
              "merchant_store_id",
            ]
            isOneToOne: false
            referencedRelation: "merchant_fulfillment_origins"
            referencedColumns: ["id", "company_id", "merchant_store_id"]
          },
          {
            foreignKeyName: "sttp_store_company_fk"
            columns: ["merchant_store_id", "company_id"]
            isOneToOne: false
            referencedRelation: "merchant_stores"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "sttp_supersedes_fk"
            columns: ["supersedes_profile_id"]
            isOneToOne: false
            referencedRelation: "shipping_transit_time_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_transit_time_weekday_rules: {
        Row: {
          created_at: string
          handover_supported: boolean
          handover_weekday_iso: number
          id: string
          shipping_transit_time_profile_id: string
          transit_max_business_days: number | null
          transit_min_business_days: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          handover_supported: boolean
          handover_weekday_iso: number
          id?: string
          shipping_transit_time_profile_id: string
          transit_max_business_days?: number | null
          transit_min_business_days?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          handover_supported?: boolean
          handover_weekday_iso?: number
          id?: string
          shipping_transit_time_profile_id?: string
          transit_max_business_days?: number | null
          transit_min_business_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sttwr_profile_fk"
            columns: ["shipping_transit_time_profile_id"]
            isOneToOne: false
            referencedRelation: "shipping_transit_time_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_company_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          key: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      tax_categories: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          label: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          label: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      tax_rate_bands: {
        Row: {
          band_code: string
          country_code: string
          created_at: string
          description: string | null
          display_name: string
          id: string
          status: string
          tax_category_id: string
          updated_at: string
          version: number
        }
        Insert: {
          band_code: string
          country_code: string
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          status?: string
          tax_category_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          band_code?: string
          country_code?: string
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          status?: string
          tax_category_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_rate_bands_tax_category_id_fkey"
            columns: ["tax_category_id"]
            isOneToOne: false
            referencedRelation: "tax_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rate_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          country_code: string
          created_at: string
          created_by: string | null
          id: string
          legal_effective_date_status: string
          legal_effective_from: string | null
          legal_effective_to: string | null
          legal_source_reference: string | null
          notes: string | null
          platform_valid_from: string
          platform_valid_to: string | null
          rate_basis_points: number
          status: Database["public"]["Enums"]["tax_rate_status"]
          tax_rate_band_id: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          country_code: string
          created_at?: string
          created_by?: string | null
          id?: string
          legal_effective_date_status?: string
          legal_effective_from?: string | null
          legal_effective_to?: string | null
          legal_source_reference?: string | null
          notes?: string | null
          platform_valid_from: string
          platform_valid_to?: string | null
          rate_basis_points: number
          status?: Database["public"]["Enums"]["tax_rate_status"]
          tax_rate_band_id: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          legal_effective_date_status?: string
          legal_effective_from?: string | null
          legal_effective_to?: string | null
          legal_source_reference?: string | null
          notes?: string | null
          platform_valid_from?: string
          platform_valid_to?: string | null
          rate_basis_points?: number
          status?: Database["public"]["Enums"]["tax_rate_status"]
          tax_rate_band_id?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_rate_versions_tax_rate_band_id_fkey"
            columns: ["tax_rate_band_id"]
            isOneToOne: false
            referencedRelation: "tax_rate_bands"
            referencedColumns: ["id"]
          },
        ]
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
      warehouse_locations: {
        Row: {
          code: string
          created_at: string
          id: string
          status: Database["public"]["Enums"]["p2_lifecycle_status"]
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["p2_lifecycle_status"]
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["p2_lifecycle_status"]
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_locations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          code: string
          company_id: string
          created_at: string
          id: string
          name: string
          requires_location: boolean
          status: Database["public"]["Enums"]["p2_lifecycle_status"]
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          id?: string
          name: string
          requires_location?: boolean
          status?: Database["public"]["Enums"]["p2_lifecycle_status"]
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          requires_location?: boolean
          status?: Database["public"]["Enums"]["p2_lifecycle_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      channel_connections_safe: {
        Row: {
          auth_mode: Database["public"]["Enums"]["channel_auth_mode"] | null
          channel_account_id: string | null
          company_id: string | null
          created_at: string | null
          health: Database["public"]["Enums"]["p4_connection_health"] | null
          id: string | null
          last_error_at: string | null
          last_error_code: string | null
          last_health_check_at: string | null
          live_sync_enabled: boolean | null
          mode: Database["public"]["Enums"]["p4_connection_mode"] | null
          provider: string | null
          updated_at: string | null
        }
        Insert: {
          auth_mode?: Database["public"]["Enums"]["channel_auth_mode"] | null
          channel_account_id?: string | null
          company_id?: string | null
          created_at?: string | null
          health?: Database["public"]["Enums"]["p4_connection_health"] | null
          id?: string | null
          last_error_at?: string | null
          last_error_code?: never
          last_health_check_at?: string | null
          live_sync_enabled?: boolean | null
          mode?: Database["public"]["Enums"]["p4_connection_mode"] | null
          provider?: string | null
          updated_at?: string | null
        }
        Update: {
          auth_mode?: Database["public"]["Enums"]["channel_auth_mode"] | null
          channel_account_id?: string | null
          company_id?: string | null
          created_at?: string | null
          health?: Database["public"]["Enums"]["p4_connection_health"] | null
          id?: string | null
          last_error_at?: string | null
          last_error_code?: never
          last_health_check_at?: string | null
          live_sync_enabled?: boolean | null
          mode?: Database["public"]["Enums"]["p4_connection_mode"] | null
          provider?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_connections_channel_account_id_fkey"
            columns: ["channel_account_id"]
            isOneToOne: false
            referencedRelation: "channel_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _merchant_store_can_manage: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      _p4_enqueue_bol_write: {
        Args: {
          _event_type: string
          _expected_version: number
          _listing_id: string
          _payload: Json
          _reason: string
        }
        Returns: Json
      }
      _p4_resolve_initial_line_state: {
        Args: {
          _bol_offer_id: string
          _channel_account_id: string
          _company_id: string
          _fulfilment: Database["public"]["Enums"]["p4_fulfilment_method"]
        }
        Returns: Record<string, unknown>
      }
      _refresh_reservation_status: {
        Args: { _reservation_id: string }
        Returns: undefined
      }
      admin_get_seller_application: {
        Args: { p_application_id: string }
        Returns: Json
      }
      admin_list_borvat_direct_accounts: {
        Args: {
          _after_created_at?: string
          _after_id?: string
          _page_size?: number
          _search?: string
          _status?: string
        }
        Returns: {
          channel_account_id: string
          company_id: string
          company_name: string
          control_state: string
          created_at: string
          display_name: string
          merchant_store_id: string
          provider: string
          status: string
          store_name: string
          updated_at: string
        }[]
      }
      admin_list_borvat_direct_draft_listings: {
        Args: {
          _after_created_at?: string
          _after_id?: string
          _page_size?: number
          _search?: string
          _status?: string
        }
        Returns: {
          brand: string
          channel_account_id: string
          company_id: string
          company_name: string
          control_state: string
          created_at: string
          listing_id: string
          listing_status: string
          merchant_store_id: string
          product_id: string
          product_title: string
          published_quantity: number
          sku_code: string
          sku_id: string
          store_name: string
          updated_at: string
        }[]
      }
      admin_list_merchant_stores: {
        Args: {
          _after_created_at?: string
          _after_id?: string
          _page_size?: number
          _search?: string
          _status?: string
        }
        Returns: {
          company_id: string
          company_name: string
          country_code: string
          created_at: string
          default_locale: string
          display_name: string
          is_primary: boolean
          slug: string
          store_id: string
          store_status: string
          updated_at: string
        }[]
      }
      admin_list_seller_applications: {
        Args: { p_limit?: number; p_offset?: number; p_status?: string }
        Returns: {
          application_id: string
          company_id: string
          company_name: string
          contact_name: string
          created_at: string
          legal_name: string
          legal_status: string
          registration_country: string
          review_started_at: string
          status: string
          store_id: string
          store_name: string
          submitted_at: string
          updated_at: string
        }[]
      }
      admin_review_seller_application: {
        Args: { p_action: string; p_application_id: string; p_reason?: string }
        Returns: Json
      }
      authorize_channel_live: {
        Args: {
          _channel_account_id: string
          _company_id: string
          _note: string
        }
        Returns: undefined
      }
      begin_offer_import_batch: {
        Args: {
          _channel_account_id: string
          _company_id: string
          _connection_id: string
        }
        Returns: string
      }
      begin_sync_run: {
        Args: { _connection_id: string; _kind: string; _metadata?: Json }
        Returns: string
      }
      bol_enqueue_offer_delivery_promise_set: {
        Args: {
          _expected_version?: number
          _listing_id: string
          _promise: Json
          _reason: string
        }
        Returns: Json
      }
      bol_enqueue_offer_fulfilment_set: {
        Args: {
          _expected_version?: number
          _listing_id: string
          _method: string
          _reason: string
        }
        Returns: Json
      }
      bol_enqueue_offer_price_set: {
        Args: {
          _currency: string
          _expected_version?: number
          _listing_id: string
          _price_cents: number
          _reason: string
        }
        Returns: Json
      }
      bol_enqueue_offer_resync: {
        Args: {
          _expected_version?: number
          _listing_id: string
          _reason: string
        }
        Returns: Json
      }
      bol_enqueue_offer_stock_set: {
        Args: {
          _expected_version?: number
          _listing_id: string
          _quantity: number
          _reason: string
        }
        Returns: Json
      }
      cancel_bol_order_line: {
        Args: { _line_id: string; _reason?: string }
        Returns: Json
      }
      cancel_reservation: { Args: { _reservation_id: string }; Returns: Json }
      claim_outbox_batch: {
        Args: {
          _batch_size?: number
          _channel_account_id: string
          _lease_seconds?: number
        }
        Returns: {
          attempts: number
          channel_account_id: string
          claim_token: string | null
          claimed_at: string | null
          company_id: string
          created_at: string
          delivered_at: string | null
          event_type: string
          id: string
          last_error: string | null
          lease_expires_at: string | null
          listing_id: string
          listing_version: number
          max_attempts: number
          next_attempt_at: string | null
          offer_id: string | null
          payload: Json
          sku_id: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "outbox_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_shipment_outbox_batch: {
        Args: {
          _batch_size: number
          _lease_ttl_seconds: number
          _worker_id: string
        }
        Returns: {
          attempt_count: number
          channel_account_id: string
          channel_shipment_id: string
          company_id: string
          created_at: string
          event_kind: string
          external_ref: Json | null
          id: string
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          max_attempts: number
          next_visible_at: string
          payload: Json
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "shipment_outbox_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      close_offer_import_batch: {
        Args: {
          _batch_id: string
          _error_code?: string
          _error_message?: string
          _outcome: Database["public"]["Enums"]["import_batch_status"]
        }
        Returns: undefined
      }
      close_reconciliation_batch: {
        Args: { _batch_id: string }
        Returns: undefined
      }
      company_member_has_permission: {
        Args: { _company_id: string; _permission: string; _user_id: string }
        Returns: boolean
      }
      complete_outbox_event: {
        Args: { _claim_token: string; _event_id: string; _external_ref?: Json }
        Returns: Json
      }
      complete_outbox_event_live: {
        Args: {
          _bol_process_status_id?: string
          _claim_token: string
          _event_id: string
          _external_ref?: Json
          _http_status: number
          _request_ended_at?: string
          _request_started_at?: string
        }
        Returns: Json
      }
      complete_outbox_event_shadow: {
        Args: { _claim_token: string; _event_id: string }
        Returns: Json
      }
      complete_shipment_outbox_event: {
        Args: { _event_id: string; _external_ref?: Json }
        Returns: undefined
      }
      create_borvat_direct_account: {
        Args: { _display_name?: string; _merchant_store_id: string }
        Returns: string
      }
      create_borvat_direct_draft_listing: {
        Args: {
          _catalog_sku_id: string
          _idempotency_key?: string
          _merchant_store_id: string
        }
        Returns: string
      }
      create_merchant_store: {
        Args: {
          _company_id: string
          _country_code?: string
          _default_currency?: string
          _default_locale?: string
          _description?: string
          _display_name: string
          _idempotency_key?: string
          _is_primary?: boolean
          _slug: string
        }
        Returns: string
      }
      create_reservation: {
        Args: {
          _company_id: string
          _lines: Json
          _source_id: string
          _source_kind: string
        }
        Returns: Json
      }
      decide_product_suggestion: {
        Args: { _accept: boolean; _feedback?: string; _suggestion_id: string }
        Returns: Json
      }
      defer_outbox_event_kill_switch: {
        Args: { _claim_token: string; _event_id: string; _reason?: string }
        Returns: Json
      }
      end_sync_run: {
        Args: {
          _error_code?: string
          _items_seen?: number
          _items_written?: number
          _run_id: string
          _status: string
        }
        Returns: undefined
      }
      enqueue_outbox_event: {
        Args: {
          _event_type: string
          _listing_id: string
          _listing_version: number
          _payload?: Json
        }
        Returns: string
      }
      fail_outbox_event: {
        Args: { _claim_token: string; _error: string; _event_id: string }
        Returns: Json
      }
      fail_shipment_outbox_event: {
        Args: { _error: string; _event_id: string; _transient: boolean }
        Returns: Json
      }
      grant_seller_role_from_approved_application: {
        Args: never
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      ingest_bol_order: {
        Args: {
          _bol_order_id: string
          _buyer_email: string
          _channel_account_id: string
          _currency: string
          _lines: Json
          _order_placed_at: string
          _raw_payload: Json
          _run_id?: string
          _total_amount_cents: number
        }
        Returns: Json
      }
      ingest_bol_shipment_status: {
        Args: {
          _bol_shipment_id: string
          _channel_account_id: string
          _company_id: string
          _event_time: string
          _status: string
        }
        Returns: Json
      }
      ingest_imported_offer: {
        Args: {
          _batch_id: string
          _bol_offer_id: string
          _bol_status: Database["public"]["Enums"]["imported_offer_bol_status"]
          _brand: string
          _condition: string
          _currency: string
          _ean: string
          _price_cents: number
          _raw: Json
          _stock: number
          _title: string
        }
        Returns: string
      }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_company_owner: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      link_imported_offer_to_sku: {
        Args: {
          _imported_offer_id: string
          _note?: string
          _reviewer: string
          _sku_id: string
        }
        Returns: undefined
      }
      m1c1ec_guard_submission_integrity: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      m1c1ed_guard_publication_integrity: {
        Args: { p_offer_id: string }
        Returns: undefined
      }
      m1c1ee_guard_family_lock: {
        Args: { p_request_family_id: string }
        Returns: undefined
      }
      m1c1ee_guard_offer_acceptability: {
        Args: { p_at?: string; p_offer_id: string }
        Returns: string
      }
      m1v1d_application_json: { Args: { p_company_id: string }; Returns: Json }
      m1v1d_require_admin: { Args: never; Returns: string }
      m1v1da_require_reviewer: {
        Args: never
        Returns: {
          actor_role: string
          uid: string
        }[]
      }
      open_reconciliation_batch: {
        Args: { _channel_account_id: string; _note?: string; _source: string }
        Returns: string
      }
      p4_dispatch_decision: {
        Args: { _channel_account_id: string }
        Returns: string
      }
      p4_writes_allowed: { Args: { _connection_id: string }; Returns: boolean }
      pack_reservation_allocation: {
        Args: {
          _allocation_id: string
          _idempotency_key?: string
          _lot_id?: string
          _quantity: number
          _serial_id?: string
        }
        Returns: Json
      }
      pick_reservation_allocation: {
        Args: {
          _allocation_id: string
          _location_id?: string
          _lot_id?: string
          _quantity: number
          _serial_id?: string
        }
        Returns: Json
      }
      place_order: {
        Args: {
          p_shipping_address: Json
          p_total_cents: number
          p_user_id: string
        }
        Returns: string
      }
      post_inventory_transaction: {
        Args: {
          _company_id: string
          _entries: Json
          _idempotency_key?: string
          _metadata?: Json
          _reason: string
          _reversal_of?: string
          _source_id?: string
          _source_type?: string
        }
        Returns: Json
      }
      provision_channel_connection: {
        Args: {
          _channel_account_id: string
          _company_id: string
          _provider: string
          _secret_ref: string
        }
        Returns: string
      }
      public_get_store_profile: { Args: { p_slug: string }; Returns: Json }
      rebuild_inventory_balances: {
        Args: { _company_id: string }
        Returns: Json
      }
      record_channel_api_call: {
        Args: {
          _connection_id: string
          _direction: string
          _duration_ms: number
          _endpoint: string
          _error_code?: string
          _meta?: Json
          _method: string
          _rate_limit_remaining?: number
          _retry_after_ms?: number
          _run_id: string
          _status_code: number
        }
        Returns: number
      }
      record_channel_shipment_accepted: {
        Args: {
          _bol_shipment_id?: string
          _process_status_id: string
          _shipment_id: string
        }
        Returns: undefined
      }
      record_channel_shipment_bol_confirmed: {
        Args: { _external_ref?: Json; _shipment_id: string }
        Returns: Json
      }
      record_channel_shipment_bol_failure: {
        Args: { _error: string; _shipment_id: string }
        Returns: undefined
      }
      record_channel_snapshot: {
        Args: {
          _batch_id: string
          _external_quantity: number
          _external_ref?: Json
          _external_version?: number
          _offer_id: string
          _sku_id: string
        }
        Returns: string
      }
      record_connection_health: {
        Args: {
          _connection_id: string
          _error_code?: string
          _healthy: boolean
        }
        Returns: undefined
      }
      record_internal_ship_and_enqueue_confirmation: {
        Args: {
          _allocation_id: string
          _channel_account_id: string
          _channel_order_line_id: string
          _company_id: string
          _track_and_trace?: string
          _transporter_code: string
        }
        Returns: Json
      }
      recover_expired_leases: {
        Args: { _channel_account_id?: string; _limit?: number }
        Returns: number
      }
      recover_expired_shipment_leases: { Args: never; Returns: number }
      reenqueue_drift_finding: {
        Args: { _finding_id: string }
        Returns: string
      }
      reject_imported_offer: {
        Args: {
          _imported_offer_id: string
          _reason?: string
          _reviewer: string
        }
        Returns: undefined
      }
      release_reservation: {
        Args: {
          _cancel?: boolean
          _release_lines?: Json
          _reservation_id: string
        }
        Returns: Json
      }
      reserve_bol_order_line: { Args: { _line_id: string }; Returns: Json }
      resolve_bol_order_line_link: { Args: { _line_id: string }; Returns: Json }
      reverse_inventory_transaction: {
        Args: { _note?: string; _tx_id: string }
        Returns: Json
      }
      reverse_pack_allocation: {
        Args: {
          _allocation_id: string
          _idempotency_key?: string
          _quantity: number
        }
        Returns: Json
      }
      run_reconciliation: { Args: { _batch_id: string }; Returns: string }
      seller_get_application: { Args: { p_company_id: string }; Returns: Json }
      seller_get_legal_identity: {
        Args: { p_company_id: string }
        Returns: Json
      }
      seller_get_store_profile: {
        Args: { p_company_id: string; p_store_id: string }
        Returns: {
          banner_url: string
          company_id: string
          company_name: string
          country_code: string
          created_at: string
          default_currency: string
          default_locale: string
          description: string
          display_name: string
          is_primary: boolean
          logo_url: string
          returns_policy_url: string
          sales_terms_url: string
          slug: string
          status: string
          store_id: string
          updated_at: string
        }[]
      }
      seller_get_store_public_profile: {
        Args: { p_company_id: string; p_store_id: string }
        Returns: Json
      }
      seller_list_catalog: {
        Args: {
          p_company_id: string
          p_limit?: number
          p_offset?: number
          p_store_id?: string
        }
        Returns: {
          action_reason: string
          available: number
          brand: string
          currency_code: string
          delivery_promise: string
          fulfillment_origin: string
          price_minor: number
          product_id: string
          product_status: string
          publication_status: string
          reserved: number
          sku_code: string
          sku_id: string
          sku_status: string
          tax_classification: string
          title: string
        }[]
      }
      seller_list_inventory: {
        Args: {
          p_company_id: string
          p_limit?: number
          p_offset?: number
          p_store_id?: string
        }
        Returns: {
          available: number
          last_movement_at: string
          location_code: string
          on_hand: number
          published_quantity: number
          reserved: number
          sku_code: string
          sku_id: string
          title: string
          warehouse_code: string
          warehouse_name: string
        }[]
      }
      seller_list_workspaces: {
        Args: never
        Returns: {
          company_id: string
          company_name: string
          store_id: string
          store_name: string
          store_slug: string
          store_status: string
        }[]
      }
      seller_store_overview: {
        Args: { p_company_id: string; p_store_id?: string }
        Returns: {
          action_required: number
          active_listings: number
          draft_listings: number
          fulfillment_origins: number
          live_channels: number
          low_stock_items: number
          products_no_stock: number
          total_available: number
          total_reserved: number
        }[]
      }
      seller_submit_application: {
        Args: { p_company_id: string }
        Returns: Json
      }
      seller_submit_legal_identity: {
        Args: { p_company_id: string }
        Returns: Json
      }
      seller_upsert_application: {
        Args: {
          p_business_summary?: string
          p_company_id: string
          p_contact_email?: string
          p_contact_name?: string
          p_contact_phone?: string
          p_expected_monthly_orders?: number
          p_intended_categories?: string[]
          p_seller_note?: string
          p_store_id?: string
        }
        Returns: Json
      }
      seller_upsert_legal_identifier: {
        Args: {
          p_company_id: string
          p_country_code: string
          p_display_value: string
          p_identifier_type: string
        }
        Returns: Json
      }
      seller_upsert_legal_identity: {
        Args: {
          p_address_country?: string
          p_address_line1?: string
          p_address_line2?: string
          p_business_email?: string
          p_business_phone?: string
          p_city?: string
          p_company_id: string
          p_legal_entity_type: string
          p_legal_name: string
          p_postal_code?: string
          p_region?: string
          p_registration_country: string
          p_website_url?: string
        }
        Returns: Json
      }
      seller_upsert_store_public_profile: {
        Args: {
          p_company_id: string
          p_cover_image_url?: string
          p_customer_service_summary?: string
          p_display_name: string
          p_full_description?: string
          p_logo_url?: string
          p_public_slug: string
          p_return_policy_summary?: string
          p_seller_since?: string
          p_short_description?: string
          p_store_id: string
          p_warranty_summary?: string
        }
        Returns: Json
      }
      set_channel_kill_switch: {
        Args: {
          _connection_id: string
          _reads_disabled?: boolean
          _reason?: string
          _scope: string
          _writes_disabled: boolean
        }
        Returns: undefined
      }
      set_channel_published_quantity: {
        Args: {
          _expected_version?: number
          _listing_id: string
          _metadata?: Json
          _new_quantity: number
          _reason: string
        }
        Returns: Json
      }
      ship_reservation_allocation: {
        Args: {
          _allocation_id: string
          _carrier?: string
          _idempotency_key?: string
          _lot_id?: string
          _quantity: number
          _serial_id?: string
          _tracking_code?: string
        }
        Returns: Json
      }
      sku_active_reserved: {
        Args: { _company_id: string; _sku_id: string }
        Returns: number
      }
      sku_sellable_quantity: {
        Args: { _company_id: string; _sku_id: string }
        Returns: number
      }
      transfer_company_ownership: {
        Args: { _company_id: string; _new_owner_user_id: string }
        Returns: Json
      }
      update_merchant_store_profile: {
        Args: {
          _banner_url?: string
          _branding?: Json
          _customer_facing_settings?: Json
          _description?: string
          _display_name?: string
          _logo_url?: string
          _returns_policy_url?: string
          _sales_terms_url?: string
          _store_id: string
          _support_email?: string
          _support_phone?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "buyer" | "seller" | "admin" | "seller_verification_reviewer"
      channel_auth_mode: "client_credentials" | "intermediary_oauth"
      import_batch_status: "running" | "succeeded" | "failed" | "cancelled"
      imported_offer_bol_status: "active" | "not_published" | "unknown"
      imported_offer_review_status:
        | "pending"
        | "suggested_match"
        | "needs_manual"
        | "linked"
        | "rejected"
      p2_channel_control_state:
        | "read_only_import"
        | "shadow"
        | "active"
        | "paused"
      p2_lifecycle_status: "draft" | "active" | "inactive" | "archived"
      p2_offer_type: "simple" | "pack" | "bundle"
      p2_reservation_source_kind:
        | "order_line"
        | "auction_lot_item"
        | "manual_hold"
      p2_reservation_status:
        | "active"
        | "fully_consumed"
        | "fully_released"
        | "cancelled"
      p2_tracking_mode: "none" | "lot" | "serial"
      p2_tx_reason:
        | "stock_receipt"
        | "stock_adjustment"
        | "pick"
        | "pack"
        | "ship"
        | "pick_reversal"
        | "pack_reversal"
        | "return_receipt"
        | "return_restock"
        | "return_quarantine"
        | "damage_classification"
        | "disposal"
        | "transfer_out"
        | "transfer_in"
        | "reservation_consume"
        | "reservation_release"
        | "reversal"
      p2_tx_status: "posted" | "reversed"
      p4_connection_health: "unknown" | "healthy" | "degraded" | "error"
      p4_connection_mode: "disabled" | "read_only" | "shadow" | "live"
      p4_fulfilment_method: "FBR" | "FBB"
      p4_order_line_status:
        | "exception_offer_not_linked"
        | "exception_fbb"
        | "pending_reservation"
        | "reserved"
        | "shipped"
        | "cancelled"
      p4_order_status:
        | "open"
        | "partially_shipped"
        | "shipped"
        | "partially_cancelled"
        | "cancelled"
        | "mixed"
      p4_sync_kind:
        | "test_connection"
        | "offer_import"
        | "order_poll"
        | "stock_get"
        | "price_get"
        | "shipment_confirm"
      p4_sync_status: "running" | "succeeded" | "failed"
      tax_classification_status:
        | "proposed"
        | "approved"
        | "superseded"
        | "withdrawn"
      tax_rate_status: "draft" | "approved" | "superseded" | "withdrawn"
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
    Enums: {
      app_role: ["buyer", "seller", "admin", "seller_verification_reviewer"],
      channel_auth_mode: ["client_credentials", "intermediary_oauth"],
      import_batch_status: ["running", "succeeded", "failed", "cancelled"],
      imported_offer_bol_status: ["active", "not_published", "unknown"],
      imported_offer_review_status: [
        "pending",
        "suggested_match",
        "needs_manual",
        "linked",
        "rejected",
      ],
      p2_channel_control_state: [
        "read_only_import",
        "shadow",
        "active",
        "paused",
      ],
      p2_lifecycle_status: ["draft", "active", "inactive", "archived"],
      p2_offer_type: ["simple", "pack", "bundle"],
      p2_reservation_source_kind: [
        "order_line",
        "auction_lot_item",
        "manual_hold",
      ],
      p2_reservation_status: [
        "active",
        "fully_consumed",
        "fully_released",
        "cancelled",
      ],
      p2_tracking_mode: ["none", "lot", "serial"],
      p2_tx_reason: [
        "stock_receipt",
        "stock_adjustment",
        "pick",
        "pack",
        "ship",
        "pick_reversal",
        "pack_reversal",
        "return_receipt",
        "return_restock",
        "return_quarantine",
        "damage_classification",
        "disposal",
        "transfer_out",
        "transfer_in",
        "reservation_consume",
        "reservation_release",
        "reversal",
      ],
      p2_tx_status: ["posted", "reversed"],
      p4_connection_health: ["unknown", "healthy", "degraded", "error"],
      p4_connection_mode: ["disabled", "read_only", "shadow", "live"],
      p4_fulfilment_method: ["FBR", "FBB"],
      p4_order_line_status: [
        "exception_offer_not_linked",
        "exception_fbb",
        "pending_reservation",
        "reserved",
        "shipped",
        "cancelled",
      ],
      p4_order_status: [
        "open",
        "partially_shipped",
        "shipped",
        "partially_cancelled",
        "cancelled",
        "mixed",
      ],
      p4_sync_kind: [
        "test_connection",
        "offer_import",
        "order_poll",
        "stock_get",
        "price_get",
        "shipment_confirm",
      ],
      p4_sync_status: ["running", "succeeded", "failed"],
      tax_classification_status: [
        "proposed",
        "approved",
        "superseded",
        "withdrawn",
      ],
      tax_rate_status: ["draft", "approved", "superseded", "withdrawn"],
    },
  },
} as const
