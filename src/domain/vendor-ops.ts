/**
 * Vendor-facing operational reads: their own orders, their money ledger and balance.
 * Row level security restricts every query here to the acting vendor organization.
 */

import { withApp, type DbPool } from '../db/pool.ts';
import { toMinor } from './money.ts';

export interface VendorOrderView {
  readonly vendorOrderId: string;
  readonly vendorOrderNumber: string;
  readonly orderNumber: string;
  readonly status: string;
  readonly currency: string;
  readonly itemsSubtotalMinor: bigint;
  readonly shippingMinor: bigint;
  readonly taxMinor: bigint;
  readonly totalMinor: bigint;
  readonly commissionMinor: bigint;
  readonly payoutMinor: bigint;
  readonly createdAt: string;
  readonly lines: {
    readonly productTitle: string;
    readonly quantity: number;
    readonly unitPriceMinor: bigint;
    readonly lineTotalMinor: bigint;
  }[];
}

export async function listVendorOrders(
  pool: DbPool,
  input: { userId: string; organizationId: string; limit?: number },
): Promise<VendorOrderView[]> {
  return withApp(pool, { userId: input.userId, orgId: input.organizationId }, async (client) => {
    const orders = await client.query<{
      id: string;
      vendor_order_number: string;
      order_number: string;
      status: string;
      currency: string;
      items_subtotal_minor: string;
      shipping_minor: string;
      tax_minor: string;
      total_minor: string;
      commission_minor: string;
      payout_minor: string;
      created_at: string;
    }>(
      `select vo.id, vo.vendor_order_number, o.order_number, vo.status, o.currency,
              vo.items_subtotal_minor, vo.shipping_minor, vo.tax_minor, vo.total_minor,
              vo.commission_minor, vo.payout_minor, vo.created_at
         from vendor_orders vo
         join orders o on o.id = vo.order_id
        where vo.vendor_organization_id = $1
        order by vo.created_at desc
        limit $2`,
      [input.organizationId, Math.min(Math.max(input.limit ?? 50, 1), 200)],
    );
    if (orders.rows.length === 0) return [];

    const ids = orders.rows.map((row) => row.id);
    const lines = await client.query<{
      vendor_order_id: string;
      product_title: string;
      quantity: number;
      unit_price_minor: string;
      line_total_minor: string;
    }>(
      `select vendor_order_id, product_title, quantity, unit_price_minor, line_total_minor
         from vendor_order_lines where vendor_order_id = any ($1::uuid[])
        order by created_at`,
      [ids],
    );

    return orders.rows.map((row) => ({
      vendorOrderId: row.id,
      vendorOrderNumber: row.vendor_order_number,
      orderNumber: row.order_number,
      status: row.status,
      currency: row.currency,
      itemsSubtotalMinor: toMinor(row.items_subtotal_minor),
      shippingMinor: toMinor(row.shipping_minor),
      taxMinor: toMinor(row.tax_minor),
      totalMinor: toMinor(row.total_minor),
      commissionMinor: toMinor(row.commission_minor),
      payoutMinor: toMinor(row.payout_minor),
      createdAt: row.created_at,
      lines: lines.rows
        .filter((line) => line.vendor_order_id === row.id)
        .map((line) => ({
          productTitle: line.product_title,
          quantity: line.quantity,
          unitPriceMinor: toMinor(line.unit_price_minor),
          lineTotalMinor: toMinor(line.line_total_minor),
        })),
    }));
  });
}

export interface LedgerView {
  readonly entries: {
    readonly id: string;
    readonly kind: string;
    readonly amountMinor: bigint;
    readonly currency: string;
    readonly note: string | null;
    readonly createdAt: string;
  }[];
  readonly balanceMinor: bigint;
  readonly currency: string | null;
}

export async function getVendorLedger(
  pool: DbPool,
  input: { userId: string; organizationId: string; limit?: number },
): Promise<LedgerView> {
  return withApp(pool, { userId: input.userId, orgId: input.organizationId }, async (client) => {
    const entries = await client.query<{
      id: string;
      kind: string;
      amount_minor: string;
      currency: string;
      note: string | null;
      created_at: string;
    }>(
      `select id, kind, amount_minor, currency, note, created_at
         from ledger_entries
        where vendor_organization_id = $1
        order by id desc
        limit $2`,
      [input.organizationId, Math.min(Math.max(input.limit ?? 100, 1), 500)],
    );
    const totals = await client.query<{ balance: string | null; currency: string | null }>(
      `select sum(amount_minor)::text as balance, min(currency) as currency
         from ledger_entries where vendor_organization_id = $1`,
      [input.organizationId],
    );
    return {
      entries: entries.rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        amountMinor: toMinor(row.amount_minor),
        currency: row.currency,
        note: row.note,
        createdAt: row.created_at,
      })),
      balanceMinor: toMinor(totals.rows[0]?.balance ?? '0'),
      currency: totals.rows[0]?.currency ?? null,
    };
  });
}