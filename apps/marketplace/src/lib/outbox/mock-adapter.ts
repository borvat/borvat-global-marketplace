/**
 * Mock outbox transport adapter — Phase 3 M2.
 *
 * Contracts under test:
 *  - Idempotent by event_id: replays of the same event return the same result
 *    (same external_ref), without duplicating side-effects.
 *  - Deterministic external_ref derived from event_id + listing_version.
 *  - Failure injection knobs for test-only paths.
 */

export interface OutboxEventLike {
  id: string;
  listing_id: string;
  listing_version: number | string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
}

export interface AdapterResult {
  ok: true;
  external_ref: {
    external_id: string;      // stable per event_id
    channel_version: number;  // echoes listing_version
    delivered_at: string;
    replay: boolean;
  };
}

export class AdapterError extends Error {
  constructor(message: string, public readonly kind: "transient" | "permanent") {
    super(message);
    this.name = "AdapterError";
  }
}

type ReplayEntry = { result: AdapterResult; sent_at: number };

export class MockChannelAdapter {
  private readonly ledger = new Map<string, ReplayEntry>();
  private readonly failNext = new Map<string, { kind: "transient" | "permanent"; remaining: number }>();
  public callCount = 0;

  /** Program a controlled failure for the next N deliveries of event_id. */
  injectFailure(event_id: string, kind: "transient" | "permanent", times = 1) {
    this.failNext.set(event_id, { kind, remaining: times });
  }

  reset() {
    this.ledger.clear();
    this.failNext.clear();
    this.callCount = 0;
  }

  /** Return the recorded result for an event, if it was ever delivered. */
  peek(event_id: string): AdapterResult | undefined {
    return this.ledger.get(event_id)?.result;
  }

  async send(event: OutboxEventLike): Promise<AdapterResult> {
    this.callCount += 1;

    // Idempotency: same event_id -> same result, replay flag flipped.
    const prev = this.ledger.get(event.id);
    if (prev) {
      return {
        ok: true,
        external_ref: { ...prev.result.external_ref, replay: true },
      };
    }

    // Programmed failure path.
    const f = this.failNext.get(event.id);
    if (f && f.remaining > 0) {
      f.remaining -= 1;
      if (f.remaining === 0) this.failNext.delete(event.id);
      else this.failNext.set(event.id, f);
      throw new AdapterError(
        `mock ${f.kind} failure on event ${event.id}`,
        f.kind,
      );
    }

    const result: AdapterResult = {
      ok: true,
      external_ref: {
        external_id: `mock-${event.id}`,
        channel_version: Number(event.listing_version),
        delivered_at: new Date().toISOString(),
        replay: false,
      },
    };
    this.ledger.set(event.id, { result, sent_at: Date.now() });
    return result;
  }
}
