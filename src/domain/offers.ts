/**
 * Vendor offers: a seller's own price, stock and delivery promise for a product.
 * Offer reads for buyers go through public-read mode, so only ACTIVE offers appear.
 */

import { PLATFORM, withApp, type DbPool } from '../db/pool.ts';
import { writeAudit } from './audit.ts';
import { conflict, notFound, validation } from './errors.ts';
import { multiply, normaliseCurrency, toMinor } from './money.ts';

export interface Offer {
  readonly id: string;
  readonly productId: string;
  readonly vendorOrganizationId: string;
  readonly offerRef: string;
  readonly condition: string;
  readonly priceMinor: bigint;
  readonly currency: string;
  readonly shippingMinor: bigint;
  readonly freeShippingThresholdMinor: bigint | null;
  readonly stockAvailable: number;
  readonly handlingDays: number;
  readonly maxPerOrder: number;
  readonly shipsTo: string[];
  readonly status: string;
  readonly version: number;
}

export interface OfferRow {
  id: string;
  product_id: string;
  vendor_organization_id: string;
  offer_ref: string;
  condition: string;
  price_minor: string;
  currency: string;
  shipping_minor: string;
  free_shipping_threshold_minor: string | null;
  stock_available: number;
  handling_days: number;
  max_per_order: number;
  ships_to: string[];
  status: string;
  version: number;
}

export const OFFER_COLUMNS = `id, product_id, vendor_organization_id, offer_ref, condition, price_minor,
  currency, shipping_minor, free_shipping_threshold_minor, stock_available, handling_days,
  max_per_order, ships_to, status, version`;

export function mapOffer(row: OfferRow): Offer {
  return {
    id: row.id,
    productId: row.product_id,
    vendorOrganizationId: row.vendor_organization_id,
    offerRef: row.offer_ref,
    condition: row.condition,
    priceMinor: toMinor(row.price_minor),
    currency: row.currency,
    shippingMinor: toMinor(row.shipping_minor),
    freeShippingThresholdMinor:
      row.free_shipping_threshold_minor === null ? null : toMinor(row.free_shipping_threshold_minor),
    stockAvailable: row.stock_available,
    handlingDays: row.handling_days,
    maxPerOrder: row.max_per_order,
    shipsTo: row.ships_to,
    status: row.status,
    version: row.version,
  };
}

function normaliseShipsTo(shipsTo: string[] | undefined): string[] {
  const list = shipsTo ?? ['NL', 'BE'];
  if (!Array.isArray(list) || list.length === 0) throw validation('ships_to must list at least one market');
  return list.map((code) => {
    const value = code.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(value)) throw validation(`invalid market code: ${code}`);
    return value;
  });
}

/** Shipping charged for a given quantity, honouring a free-shipping threshold. */
export function shippingFor(offer: Offer, quantity: number): bigint {
  const goods = multiply(offer.priceMinor, quantity);
  const threshold = offer.freeShippingThresholdMinor;
  if (threshold !== null && goods >= threshold) return 0n;
  return offer.shippingMinor;
}

export function totalFor(offer: Offer, quantity: number): bigint {
  return multiply(offer.priceMinor, quantity) + shippingFor(offer, quantity);
}

export async function createOffer(
  pool: DbPool,
  input: {
    actorUserId: string;
    organizationId: string;
    productId: string;
    offerRef: string;
    priceMinor: bigint | string | number;
    currency: string;
    shippingMinor?: bigint | string | number;
    freeShippingThresholdMinor?: bigint | string | number | null;
    stockAvailable?: number;
    handlingDays?: number;
    maxPerOrder?: number;
    shipsTo?: string[];
    condition?: 'NEW' | 'REFURBISHED' | 'USED_LIKE_NEW' | 'USED_GOOD';
    status?: 'DRAFT' | 'ACTIVE' | 'PAUSED';
    correlationId?: string | null;
  },
): Promise<Offer> {
  const offerRef = input.offerRef.trim();
  if (offerRef.length < 1 || offerRef.length > 64) throw validation('offer reference must be 1 to 64 characters');
  const currency = normaliseCurrency(input.currency);
  const priceMinor = toMinor(input.priceMinor);
  if (priceMinor < 0n) throw validation('price cannot be negative');
  const shippingMinor = toMinor(input.shippingMinor ?? 0);
  if (shippingMinor < 0n) throw validation('shipping cannot be negative');
  const threshold = input.freeShippingThresholdMinor === null || input.freeShippingThresholdMinor === undefined
    ? null
    : toMinor(input.freeShippingThresholdMinor);
  const stock = input.stockAvailable ?? 0;
  if (!Number.isInteger(stock) || stock < 0) throw validation('stock must be a non-negative integer');
  const shipsTo = normaliseShipsTo(input.shipsTo);

  return withApp(
    pool,
    { userId: input.actorUserId, orgId: input.organizationId, correlationId: input.correlationId ?? null },
    async (client) => {
      const product = await client.query('select id from products where id = $1', [input.productId]);
      if (product.rowCount === 0) throw notFound('product not found');
      const inserted = await client.query<OfferRow>(
        `insert into offers (product_id, vendor_organization_id, offer_ref, condition, price_minor, currency,
                             shipping_minor, free_shipping_threshold_minor, stock_available, handling_days,
                             max_per_order, ships_to, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         on conflict (vendor_organization_id, offer_ref) do nothing
         returning ${OFFER_COLUMNS}`,
        [
          input.productId,
          input.organizationId,
          offerRef,
          input.condition ?? 'NEW',
          priceMinor.toString(),
          currency,
          shippingMinor.toString(),
          threshold === null ? null : threshold.toString(),
          stock,
          input.handlingDays ?? 1,
          input.maxPerOrder ?? 10,
          shipsTo,
          input.status ?? 'ACTIVE',
        ],
      );
      const row = inserted.rows[0];
      if (row === undefined) throw conflict('this offer reference already exists for your store', { offerRef });
      if (stock > 0) {
        await client.query(
          `insert into inventory_ledger (offer_id, vendor_organization_id, delta, reason, balance_after, actor_user_id)
           values ($1, $2, $3, 'RESTOCK', $3, $4)`,
          [row.id, input.organizationId, stock, input.actorUserId],
        );
      }
      await writeAudit(client, {
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        action: 'offer.created',
        entityType: 'offer',
        entityId: row.id,
        correlationId: input.correlationId ?? null,
        payload: { offerRef, priceMinor: priceMinor.toString(), currency },
      });
      return mapOffer(row);
    },
  );
}

export async function updateOffer(
  pool: DbPool,
  input: {
    actorUserId: string;
    organizationId: string;
    offerId: string;
    patch: {
      priceMinor?: bigint | string | number;
      shippingMinor?: bigint | string | number;
      freeShippingThresholdMinor?: bigint | string | number | null;
      handlingDays?: number;
      maxPerOrder?: number;
      shipsTo?: string[];
      status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'BLOCKED';
    };
    correlationId?: string | null;
  },
): Promise<Offer> {
  return withApp(
    pool,
    { userId: input.actorUserId, orgId: input.organizationId, correlationId: input.correlationId ?? null },
    async (client) => {
      const current = await client.query<OfferRow>(
        `select ${OFFER_COLUMNS} from offers where id = $1 for update`,
        [input.offerId],
      );
      const existing = current.rows[0];
      if (existing === undefined) throw notFound('offer not found');
      const patch = input.patch;
      const priceMinor = patch.priceMinor === undefined ? toMinor(existing.price_minor) : toMinor(patch.priceMinor);
      const shippingMinor =
        patch.shippingMinor === undefined ? toMinor(existing.shipping_minor) : toMinor(patch.shippingMinor);
      const threshold =
        patch.freeShippingThresholdMinor === undefined
          ? existing.free_shipping_threshold_minor === null
            ? null
            : toMinor(existing.free_shipping_threshold_minor)
          : patch.freeShippingThresholdMinor === null
            ? null
            : toMinor(patch.freeShippingThresholdMinor);
      const shipsTo = patch.shipsTo === undefined ? existing.ships_to : normaliseShipsTo(patch.shipsTo);

      const updated = await client.query<OfferRow>(
        `update offers
            set price_minor = $2,
                shipping_minor = $3,
                free_shipping_threshold_minor = $4,
                handling_days = $5,
                max_per_order = $6,
                ships_to = $7,
                status = $8,
                version = version + 1,
                updated_at = now()
          where id = $1
          returning ${OFFER_COLUMNS}`,
        [
          input.offerId,
          priceMinor.toString(),
          shippingMinor.toString(),
          threshold === null ? null : threshold.toString(),
          patch.handlingDays ?? existing.handling_days,
          patch.maxPerOrder ?? existing.max_per_order,
          shipsTo,
          patch.status ?? existing.status,
        ],
      );
      const row = updated.rows[0];
      if (row === undefined) throw notFound('offer not found');
      await writeAudit(client, {
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        action: 'offer.updated',
        entityType: 'offer',
        entityId: input.offerId,
        correlationId: input.correlationId ?? null,
        payload: {
          priceMinor: priceMinor.toString(),
          shippingMinor: shippingMinor.toString(),
          status: row.status,
          version: row.version,
        },
      });
      return mapOffer(row);
    },
  );
}

export async function listVendorOffers(
  pool: DbPool,
  input: { userId: string; organizationId: string; limit?: number },
): Promise<Offer[]> {
  return withApp(pool, { userId: input.userId, orgId: input.organizationId }, async (client) => {
    const result = await client.query<OfferRow>(
      `select ${OFFER_COLUMNS} from offers where vendor_organization_id = $1 order by updated_at desc limit $2`,
      [input.organizationId, Math.min(Math.max(input.limit ?? 50, 1), 200)],
    );
    return result.rows.map(mapOffer);
  });
}

export interface RankedOffer {
  readonly offer: Offer;
  readonly vendorName: string;
  readonly goodsMinor: bigint;
  readonly shippingMinor: bigint;
  readonly totalMinor: bigint;
}

export async function listProductOffers(
  pool: DbPool,
  input: { productId: string; market: string; quantity?: number; limit?: number },
): Promise<RankedOffer[]> {
  const market = input.market.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(market)) throw validation(`invalid market: ${input.market}`);
  const quantity = input.quantity ?? 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw validation('quantity must be a positive integer');

  return withApp(pool, { publicRead: true }, async (client) => {
    const result = await client.query<OfferRow & { vendor_name: string }>(
      `select o.id, o.product_id, o.vendor_organization_id, o.offer_ref, o.condition, o.price_minor,
              o.currency, o.shipping_minor, o.free_shipping_threshold_minor, o.stock_available,
              o.handling_days, o.max_per_order, o.ships_to, o.status, o.version,
              org.name as vendor_name
         from offers o
         join organizations org on org.id = o.vendor_organization_id
        where o.product_id = $1
          and o.status = 'ACTIVE'
          and $2 = any (o.ships_to)
          and o.stock_available >= $3
        order by (o.price_minor + o.shipping_minor) asc, o.handling_days asc, o.id asc
        limit $4`,
      [input.productId, market, quantity, Math.min(Math.max(input.limit ?? 25, 1), 100)],
    );
    return result.rows.map((row) => {
      const offer = mapOffer(row);
      const goodsMinor = multiply(offer.priceMinor, quantity);
      const shipping = shippingFor(offer, quantity);
      return {
        offer,
        vendorName: row.vendor_name,
        goodsMinor,
        shippingMinor: shipping,
        totalMinor: goodsMinor + shipping,
      };
    });
  });
}

/** Used by trusted platform paths (checkout) to read any offer regardless of vendor. */
export async function loadOffersForUpdate(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: OfferRow[] }> },
  offerIds: string[],
): Promise<Map<string, Offer>> {
  if (offerIds.length === 0) return new Map();
  const result = await client.query(
    `select ${OFFER_COLUMNS} from offers where id = any ($1::uuid[]) order by id for update`,
    [offerIds],
  );
  const map = new Map<string, Offer>();
  for (const row of result.rows) {
    const offer = mapOffer(row);
    map.set(offer.id, offer);
  }
  return map;
}

export const PLATFORM_CONTEXT = PLATFORM;