/**
 * Bol outbox worker — Phase 4 M4 mode-aware dispatcher.
 *
 * Per claimed event, the worker consults `p4_dispatch_decision`:
 *   - decision starts with 'blocked' → defer_outbox_event_kill_switch
 *     (no HTTP, no attempts consumed).
 *   - decision === 'shadow'  → complete_outbox_event_shadow (no HTTP).
 *   - decision === 'live'    → adapter.dispatchLive → complete_outbox_event_live
 *     OR fail_outbox_event on BolAdapterError (transient/permanent).
 *
 * The worker keeps the counter of HTTP calls it issued through the adapter
 * so tests can prove "shadow => zero HTTP".
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BolAdapterError,
  type BolChannelAdapter,
  type EventInput,
} from "./bol-adapter";

export type DispatchDecision =
  | "blocked_no_connection"
  | "blocked_disabled"
  | "blocked_read_only"
  | "blocked_kill_switch"
  | "shadow"
  | "live";

export interface BolDispatchOutcome {
  claimed: number;
  shadow_recorded: number;
  live_delivered: number;
  deferred: number;
  failed_transient: number;
  failed_permanent: number;
  http_calls: number;
  errors: string[];
}

/** Resolves listing_id → Bol external offer id from channel_listings. */
export function makeExternalListingIdResolver(admin: SupabaseClient) {
  const cache = new Map<string, string>();
  return async (listing_id: string): Promise<string> => {
    const hit = cache.get(listing_id);
    if (hit) return hit;
    const { data, error } = await admin
      .from("channel_listings")
      .select("external_listing_id")
      .eq("id", listing_id)
      .maybeSingle();
    if (error) throw new Error(`resolve external_listing_id: ${error.message}`);
    if (!data?.external_listing_id) {
      throw new BolAdapterError(
        `channel_listings.${listing_id}.external_listing_id is null`,
        "permanent",
      );
    }
    cache.set(listing_id, String(data.external_listing_id));
    return String(data.external_listing_id);
  };
}

export async function runBolDispatchOnce(
  admin: SupabaseClient,
  adapter: BolChannelAdapter,
  channel_account_id: string,
  externalListingIdResolver: (listing_id: string) => Promise<string>,
  opts: { batch_size?: number; lease_seconds?: number } = {},
): Promise<BolDispatchOutcome> {
  const before = adapter.httpCallCount;
  const out: BolDispatchOutcome = {
    claimed: 0,
    shadow_recorded: 0,
    live_delivered: 0,
    deferred: 0,
    failed_transient: 0,
    failed_permanent: 0,
    http_calls: 0,
    errors: [],
  };

  const { data: claimed, error: claimErr } = await admin.rpc("claim_outbox_batch", {
    _channel_account_id: channel_account_id,
    _batch_size: opts.batch_size ?? 10,
    _lease_seconds: opts.lease_seconds ?? 60,
  });
  if (claimErr) throw new Error(`claim_outbox_batch: ${claimErr.message}`);
  const events = (claimed ?? []) as any[];
  out.claimed = events.length;

  for (const e of events) {
    const { data: decision, error: dErr } = await admin.rpc("p4_dispatch_decision", {
      _channel_account_id: channel_account_id,
    });
    if (dErr) {
      out.errors.push(`decision ${e.id}: ${dErr.message}`);
      continue;
    }
    const d = String(decision) as DispatchDecision;

    if (d.startsWith("blocked")) {
      const { error } = await admin.rpc("defer_outbox_event_kill_switch", {
        _event_id: e.id,
        _claim_token: e.claim_token,
        _reason: d,
      });
      if (error) out.errors.push(`defer ${e.id}: ${error.message}`);
      else out.deferred++;
      continue;
    }

    if (d === "shadow") {
      // Plan the request purely (no HTTP). This proves in code that the
      // shadow path knows exactly what would have gone to Bol, and does
      // not go there.
      try {
        adapter.plan({
          id: e.id,
          event_type: e.event_type,
          external_listing_id: await externalListingIdResolver(e.listing_id),
          payload: e.payload ?? {},
          listing_version: Number(e.listing_version),
        });
      } catch (planErr) {
        const msg = planErr instanceof Error ? planErr.message : String(planErr);
        out.errors.push(`plan ${e.id}: ${msg}`);
      }
      const { error } = await admin.rpc("complete_outbox_event_shadow", {
        _event_id: e.id,
        _claim_token: e.claim_token,
      });
      if (error) out.errors.push(`shadow ${e.id}: ${error.message}`);
      else out.shadow_recorded++;
      continue;
    }

    if (d === "live") {
      try {
        const ext = await externalListingIdResolver(e.listing_id);
        const res = await adapter.dispatchLive({
          id: e.id,
          event_type: e.event_type,
          external_listing_id: ext,
          payload: e.payload ?? {},
          listing_version: Number(e.listing_version),
        });
        const { error } = await admin.rpc("complete_outbox_event_live", {
          _event_id: e.id,
          _claim_token: e.claim_token,
          _http_status: res.http_status,
          _external_ref: res.external_ref as any,
          _bol_process_status_id: res.bol_process_status_id,
          _request_started_at: res.request_started_at,
          _request_ended_at: res.request_ended_at,
        });
        if (error) out.errors.push(`live ${e.id}: ${error.message}`);
        else out.live_delivered++;
      } catch (err) {
        const kind = err instanceof BolAdapterError ? err.kind : "transient";
        const msg = err instanceof Error ? err.message : String(err);
        const { error } = await admin.rpc("fail_outbox_event", {
          _event_id: e.id,
          _claim_token: e.claim_token,
          _error: `[${kind}] ${msg}`.slice(0, 500),
        });
        if (error) out.errors.push(`fail ${e.id}: ${error.message}`);
        else if (kind === "permanent") out.failed_permanent++;
        else out.failed_transient++;
      }
    }
  }

  out.http_calls = adapter.httpCallCount - before;
  return out;
}
