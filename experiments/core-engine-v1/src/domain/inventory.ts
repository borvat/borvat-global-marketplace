/**
 * Inventory.
 *
 * Stock is never assigned, only moved. Every movement is an atomic guarded update
 * on the offer plus an append-only ledger row recording the resulting balance, so
 * two concurrent buyers can never oversell the same unit.
 */

import { withApp, type DbPool, type PoolClient } from '../db/pool.ts';
import { outOfStock, validation } from './errors.ts';

export type StockReason = 'RESTOCK' | 'ADJUST' | 'RESERVE' | 'RELEASE' | 'SALE' | 'RETURN' | 'DAMAGE';

export interface StockMovement {
  readonly offerId: string;
  readonly delta: number;
  readonly reason: StockReason;
  readonly reference?: string | null;
  readonly actorUserId?: string | null;
}

export interface StockMovementResult {
  readonly offerId: string;
  readonly balanceAfter: number;
}

/**
 * Applies a stock movement inside the caller's transaction.
 * The update is guarded in SQL, so it is safe under concurrency without a read-modify-write.
 */
export async function applyStockMovement(
  client: PoolClient,
  movement: StockMovement,
): Promise<StockMovementResult> {
  if (!Number.isInteger(movement.delta) || movement.delta === 0) {
    throw validation('a stock movement must be a non-zero integer');
  }
  const updated = await client.query<{ stock_available: number; vendor_organization_id: string }>(
    `update offers
        set stock_available = stock_available + $2,
            updated_at = now()
      where id = $1
        and stock_available + $2 >= 0
      returning stock_available, vendor_organization_id`,
    [movement.offerId, movement.delta],
  );
  const row = updated.rows[0];
  if (row === undefined) {
    throw outOfStock('the requested quantity is no longer available', {
      offerId: movement.offerId,
      requestedDelta: movement.delta,
    });
  }
  await client.query(
    `insert into inventory_ledger
       (offer_id, vendor_organization_id, delta, reason, balance_after, reference, actor_user_id)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      movement.offerId,
      row.vendor_organization_id,
      movement.delta,
      movement.reason,
      row.stock_available,
      movement.reference ?? null,
      movement.actorUserId ?? null,
    ],
  );
  return { offerId: movement.offerId, balanceAfter: row.stock_available };
}

export async function adjustStock(
  pool: DbPool,
  input: {
    actorUserId: string;
    organizationId: string;
    offerId: string;
    delta: number;
    reason: Exclude<StockReason, 'SALE' | 'RESERVE' | 'RELEASE'>;
    reference?: string | null;
  },
): Promise<StockMovementResult> {
  if (input.reason === 'ADJUST' && input.delta === 0) throw validation('adjustment cannot be zero');
  return withApp(pool, { userId: input.actorUserId, orgId: input.organizationId }, async (client) =>
    applyStockMovement(client, {
      offerId: input.offerId,
      delta: input.delta,
      reason: input.reason,
      reference: input.reference ?? null,
      actorUserId: input.actorUserId,
    }),
  );
}

export interface LedgerRow {
  readonly id: string;
  readonly offerId: string;
  readonly delta: number;
  readonly reason: string;
  readonly balanceAfter: number;
  readonly reference: string | null;
  readonly createdAt: string;
}

export async function listStockLedger(
  pool: DbPool,
  input: { userId: string; organizationId: string; offerId?: string | null; limit?: number },
): Promise<LedgerRow[]> {
  return withApp(pool, { userId: input.userId, orgId: input.organizationId }, async (client) => {
    const result = await client.query<{
      id: string;
      offer_id: string;
      delta: number;
      reason: string;
      balance_after: number;
      reference: string | null;
      created_at: string;
    }>(
      `select id, offer_id, delta, reason, balance_after, reference, created_at
         from inventory_ledger
        where vendor_organization_id = $1
          and ($2::uuid is null or offer_id = $2::uuid)
        order by id desc
        limit $3`,
      [input.organizationId, input.offerId ?? null, Math.min(Math.max(input.limit ?? 50, 1), 200)],
    );
    return result.rows.map((row) => ({
      id: row.id,
      offerId: row.offer_id,
      delta: row.delta,
      reason: row.reason,
      balanceAfter: row.balance_after,
      reference: row.reference,
      createdAt: row.created_at,
    }));
  });
}