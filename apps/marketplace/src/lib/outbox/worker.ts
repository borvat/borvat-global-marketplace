/**
 * Outbox worker (test-facing driver). Phase 3 M2.
 *
 * A single dispatch pass:
 *   1. claim_outbox_batch(channel_account_id, ...)
 *   2. For each claimed event: adapter.send(event)
 *        - success  -> complete_outbox_event(event_id, claim_token, external_ref)
 *        - transient -> fail_outbox_event(event_id, claim_token, error)
 *        - permanent -> fail_outbox_event(event_id, claim_token, error)
 *          (dead_letter transition is handled server-side on max_attempts)
 *
 * The worker is intentionally a pure function of (adapter, admin client,
 * channel_account_id) so tests can drive it deterministically.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { AdapterError, MockChannelAdapter, type OutboxEventLike } from "./mock-adapter";

export interface DispatchResult {
  claimed: number;
  delivered: number;
  failed_transient: number;
  failed_permanent: number;
  errors: string[];
}

export async function runDispatchOnce(
  admin: SupabaseClient,
  adapter: MockChannelAdapter,
  channel_account_id: string,
  opts: { batch_size?: number; lease_seconds?: number } = {},
): Promise<DispatchResult> {
  const batch_size = opts.batch_size ?? 10;
  const lease_seconds = opts.lease_seconds ?? 60;

  const { data: claimed, error: claimErr } = await admin.rpc("claim_outbox_batch", {
    _channel_account_id: channel_account_id,
    _batch_size: batch_size,
    _lease_seconds: lease_seconds,
  });
  if (claimErr) throw new Error(`claim_outbox_batch: ${claimErr.message}`);

  const events = (claimed ?? []) as (OutboxEventLike & { claim_token: string })[];
  const out: DispatchResult = {
    claimed: events.length,
    delivered: 0,
    failed_transient: 0,
    failed_permanent: 0,
    errors: [],
  };

  for (const e of events) {
    try {
      const result = await adapter.send(e);
      const { error } = await admin.rpc("complete_outbox_event", {
        _event_id: e.id,
        _claim_token: e.claim_token,
        _external_ref: result.external_ref as unknown as Record<string, unknown>,
      });
      if (error) {
        out.errors.push(`complete ${e.id}: ${error.message}`);
      } else {
        out.delivered += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const kind = err instanceof AdapterError ? err.kind : "transient";
      const { error } = await admin.rpc("fail_outbox_event", {
        _event_id: e.id,
        _claim_token: e.claim_token,
        _error: message,
      });
      if (error) {
        out.errors.push(`fail ${e.id}: ${error.message}`);
      } else if (kind === "permanent") {
        out.failed_permanent += 1;
      } else {
        out.failed_transient += 1;
      }
    }
  }

  return out;
}
