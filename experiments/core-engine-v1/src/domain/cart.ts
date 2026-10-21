/**
 * Multi-vendor cart.
 *
 * A cart holds offers from any number of vendors. Prices are snapshotted when an
 * item is added, but the totals shown always use the live price, and each line
 * reports whether the price moved, the offer disappeared or stock ran out.
 */

import { withApp, type AppContext, type DbPool, type PoolClient } from '../db/pool.ts';
import { writeAudit } from './audit.ts';
import { conflict, notFound, validation } from './errors.ts';
import { normaliseCurrency, toMinor } from './money.ts';
import { computePricing, type PricingLine } from './pricing.ts';

export interface CartOwner {
  readonly userId?: string | null;
  readonly guestToken?: string | null;
}

export interface CartLineView {
  readonly itemId: string;
  readonly offerId: string;
  readonly productId: string;
  readonly productTitle: string;
  readonly vendorOrganizationId: string;
  readonly vendorName: string;
  readonly quantity: number;
  readonly unitPriceMinor: bigint;
  readonly liveUnitPriceMinor: bigint;
  readonly currency: string;
  readonly state: 'OK' | 'PRICE_CHANGED' | 'UNAVAILABLE' | 'OUT_OF_STOCK' | 'MARKET_EXCLUDED';
  readonly availableStock: number;
  readonly handlingDays: number;
  readonly lineTotalMinor: bigint;
}

export interface CartView {
  readonly cartId: string;
  readonly market: string;
  readonly currency: string;
  readonly status: string;
  readonly lines: CartLineView[];
  readonly itemsSubtotalMinor: bigint;
  readonly shippingMinor: bigint;
  readonly taxMinor: bigint;
  readonly totalMinor: bigint;
  readonly taxRateBps: number;
  readonly vendorCount: number;
  readonly hasBlockingIssue: boolean;
}

function ownerContext(owner: CartOwner): AppContext {
  if ((owner.userId ?? null) === null && (owner.guestToken ?? null) === null) {
    throw validation('a cart needs either an authenticated user or a guest token');
  }
  return { userId: owner.userId ?? null, guestToken: owner.guestToken ?? null, publicRead: true };
}

export async function loadTaxRateBps(client: PoolClient, country: string): Promise<number> {
  const result = await client.query<{ rate_bps: number }>(
    `select rate_bps from tax_rates
      where country = $1 and tax_kind = 'VAT'
      order by effective_from desc limit 1`,
    [country.toUpperCase()],
  );
  return result.rows[0]?.rate_bps ?? 0;
}

export async function getOrCreateOpenCart(
  pool: DbPool,
  input: { owner: CartOwner; market: string; currency: string },
): Promise<{ cartId: string; market: string; currency: string; status: string }> {
  const market = input.market.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(market)) throw validation(`invalid market: ${input.market}`);
  const currency = normaliseCurrency(input.currency);

  return withApp(pool, ownerContext(input.owner), async (client) => {
    const existing = await client.query<{ id: string; market: string; currency: string; status: string }>(
      `select id, market, currency, status from carts
        where status = 'OPEN'
          and (($1::uuid is not null and buyer_user_id = $1::uuid)
               or ($2::text is not null and guest_token = $2::text))
        order by created_at desc limit 1`,
      [input.owner.userId ?? null, input.owner.guestToken ?? null],
    );
    const found = existing.rows[0];
    if (found !== undefined) return { cartId: found.id, market: found.market, currency: found.currency, status: found.status };

    const created = await client.query<{ id: string; market: string; currency: string; status: string }>(
      `insert into carts (buyer_user_id, guest_token, market, currency)
       values ($1, $2, $3, $4)
       returning id, market, currency, status`,
      [input.owner.userId ?? null, input.owner.guestToken ?? null, market, currency],
    );
    const row = created.rows[0];
    if (row === undefined) throw notFound('cart could not be created');
    return { cartId: row.id, market: row.market, currency: row.currency, status: row.status };
  });
}

export async function addItem(
  pool: DbPool,
  input: { owner: CartOwner; cartId: string; offerId: string; quantity: number },
): Promise<CartView> {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 999) {
    throw validation('quantity must be between 1 and 999');
  }
  return withApp(pool, ownerContext(input.owner), async (client) => {
    const cart = await client.query<{ id: string; market: string; currency: string; status: string }>(
      'select id, market, currency, status from carts where id = $1 for update',
      [input.cartId],
    );
    const cartRow = cart.rows[0];
    if (cartRow === undefined) throw notFound('cart not found');
    if (cartRow.status !== 'OPEN') throw conflict(`cart is ${cartRow.status}`);

    const offerResult = await client.query<{
      id: string;
      vendor_organization_id: string;
      price_minor: string;
      currency: string;
      stock_available: number;
      max_per_order: number;
      ships_to: string[];
      status: string;
    }>(
      `select id, vendor_organization_id, price_minor, currency, stock_available, max_per_order, ships_to, status
         from offers where id = $1`,
      [input.offerId],
    );
    const offer = offerResult.rows[0];
    if (offer === undefined) throw notFound('offer not found');
    if (offer.status !== 'ACTIVE') throw conflict('this offer is not available', { offerStatus: offer.status });
    if (!offer.ships_to.includes(cartRow.market)) {
      throw conflict('this offer does not ship to the selected market', { market: cartRow.market });
    }
    if (offer.currency !== cartRow.currency) {
      throw conflict('offer currency does not match the cart currency', {
        offerCurrency: offer.currency,
        cartCurrency: cartRow.currency,
      });
    }

    const existing = await client.query<{ id: string; quantity: number }>(
      'select id, quantity from cart_items where cart_id = $1 and offer_id = $2 for update',
      [input.cartId, input.offerId],
    );
    const existingItem = existing.rows[0];
    const targetQuantity = (existingItem?.quantity ?? 0) + input.quantity;
    if (targetQuantity > offer.max_per_order) {
      throw validation(`this offer allows at most ${offer.max_per_order} units per order`);
    }
    if (targetQuantity > offer.stock_available) {
      throw conflict('not enough stock for the requested quantity', {
        available: offer.stock_available,
        requested: targetQuantity,
      });
    }

    if (existingItem === undefined) {
      await client.query(
        `insert into cart_items (cart_id, offer_id, vendor_organization_id, quantity, unit_price_minor)
         values ($1, $2, $3, $4, $5)`,
        [input.cartId, input.offerId, offer.vendor_organization_id, targetQuantity, offer.price_minor],
      );
    } else {
      await client.query(
        'update cart_items set quantity = $2, updated_at = now() where id = $1',
        [existingItem.id, targetQuantity],
      );
    }
    await client.query('update carts set updated_at = now() where id = $1', [input.cartId]);
    await writeAudit(client, {
      actorUserId: input.owner.userId ?? null,
      action: 'cart.item_added',
      entityType: 'cart',
      entityId: input.cartId,
      payload: { offerId: input.offerId, quantity: targetQuantity },
    });
    return buildCartView(client, input.cartId);
  });
}

export async function updateItemQuantity(
  pool: DbPool,
  input: { owner: CartOwner; cartId: string; itemId: string; quantity: number },
): Promise<CartView> {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 999) {
    throw validation('quantity must be between 1 and 999');
  }
  return withApp(pool, ownerContext(input.owner), async (client) => {
    const item = await client.query<{ id: string; offer_id: string }>(
      'select id, offer_id from cart_items where id = $1 and cart_id = $2 for update',
      [input.itemId, input.cartId],
    );
    if (item.rows[0] === undefined) throw notFound('cart item not found');
    const offerId = item.rows[0].offer_id;
    const offer = await client.query<{ stock_available: number; max_per_order: number }>(
      'select stock_available, max_per_order from offers where id = $1',
      [offerId],
    );
    const offerRow = offer.rows[0];
    if (offerRow === undefined) throw notFound('offer not found');
    if (input.quantity > offerRow.max_per_order) {
      throw validation(`this offer allows at most ${offerRow.max_per_order} units per order`);
    }
    if (input.quantity > offerRow.stock_available) {
      throw conflict('not enough stock for the requested quantity', {
        available: offerRow.stock_available,
        requested: input.quantity,
      });
    }
    await client.query('update cart_items set quantity = $2, updated_at = now() where id = $1', [
      input.itemId,
      input.quantity,
    ]);
    return buildCartView(client, input.cartId);
  });
}

export async function removeItem(
  pool: DbPool,
  input: { owner: CartOwner; cartId: string; itemId: string },
): Promise<CartView> {
  return withApp(pool, ownerContext(input.owner), async (client) => {
    const removed = await client.query('delete from cart_items where id = $1 and cart_id = $2', [
      input.itemId,
      input.cartId,
    ]);
    if (removed.rowCount === 0) throw notFound('cart item not found');
    return buildCartView(client, input.cartId);
  });
}

export async function viewCart(pool: DbPool, input: { owner: CartOwner; cartId: string }): Promise<CartView> {
  return withApp(pool, ownerContext(input.owner), async (client) => buildCartView(client, input.cartId));
}

interface CartLineRow {
  item_id: string;
  offer_id: string;
  quantity: number;
  unit_price_minor: string;
  currency: string;
  price_minor: string;
  shipping_minor: string;
  free_shipping_threshold_minor: string | null;
  stock_available: number;
  handling_days: number;
  ships_to: string[];
  offer_status: string;
  product_id: string;
  title: string;
  vendor_organization_id: string;
  vendor_name: string;
}

export async function buildCartView(client: PoolClient, cartId: string): Promise<CartView> {
  const cart = await client.query<{ id: string; market: string; currency: string; status: string }>(
    'select id, market, currency, status from carts where id = $1',
    [cartId],
  );
  const cartRow = cart.rows[0];
  if (cartRow === undefined) throw notFound('cart not found');

  const result = await client.query<CartLineRow>(
    `select ci.id as item_id, ci.offer_id, ci.quantity, ci.unit_price_minor,
            o.currency, o.price_minor, o.shipping_minor, o.free_shipping_threshold_minor,
            o.stock_available, o.handling_days, o.ships_to, o.status as offer_status,
            o.product_id, o.vendor_organization_id,
            p.title, org.name as vendor_name
       from cart_items ci
       join offers o on o.id = ci.offer_id
       join products p on p.id = o.product_id
       join organizations org on org.id = o.vendor_organization_id
      where ci.cart_id = $1
      order by org.name asc, p.title asc`,
    [cartId],
  );

  const lines: CartLineView[] = result.rows.map((row) => {
    const livePrice = toMinor(row.price_minor);
    const snapshotPrice = toMinor(row.unit_price_minor);
    let state: CartLineView['state'] = 'OK';
    if (row.offer_status !== 'ACTIVE') state = 'UNAVAILABLE';
    else if (!row.ships_to.includes(cartRow.market)) state = 'MARKET_EXCLUDED';
    else if (row.stock_available < row.quantity) state = 'OUT_OF_STOCK';
    else if (livePrice !== snapshotPrice) state = 'PRICE_CHANGED';
    return {
      itemId: row.item_id,
      offerId: row.offer_id,
      productId: row.product_id,
      productTitle: row.title,
      vendorOrganizationId: row.vendor_organization_id,
      vendorName: row.vendor_name,
      quantity: row.quantity,
      unitPriceMinor: snapshotPrice,
      liveUnitPriceMinor: livePrice,
      currency: row.currency,
      state,
      availableStock: row.stock_available,
      handlingDays: row.handling_days,
      lineTotalMinor: livePrice * BigInt(row.quantity),
    };
  });

  const priced = lines.filter((line) => line.state !== 'UNAVAILABLE' && line.state !== 'MARKET_EXCLUDED');
  const taxRateBps = await loadTaxRateBps(client, cartRow.market);

  if (priced.length === 0) {
    return {
      cartId,
      market: cartRow.market,
      currency: cartRow.currency,
      status: cartRow.status,
      lines,
      itemsSubtotalMinor: 0n,
      shippingMinor: 0n,
      taxMinor: 0n,
      totalMinor: 0n,
      taxRateBps,
      vendorCount: 0,
      hasBlockingIssue: lines.length > 0,
    };
  }

  const pricingLines: PricingLine[] = result.rows
    .filter((row) => {
      const line = lines.find((candidate) => candidate.itemId === row.item_id);
      return line !== undefined && line.state !== 'UNAVAILABLE' && line.state !== 'MARKET_EXCLUDED';
    })
    .map((row) => ({
      offerId: row.offer_id,
      vendorOrganizationId: row.vendor_organization_id,
      unitPriceMinor: toMinor(row.price_minor),
      shippingMinor: toMinor(row.shipping_minor),
      freeShippingThresholdMinor:
        row.free_shipping_threshold_minor === null ? null : toMinor(row.free_shipping_threshold_minor),
      quantity: row.quantity,
    }));

  const pricing = computePricing(pricingLines, taxRateBps);
  return {
    cartId,
    market: cartRow.market,
    currency: cartRow.currency,
    status: cartRow.status,
    lines,
    itemsSubtotalMinor: pricing.itemsSubtotalMinor,
    shippingMinor: pricing.shippingMinor,
    taxMinor: pricing.taxMinor,
    totalMinor: pricing.totalMinor,
    taxRateBps: pricing.taxRateBps,
    vendorCount: pricing.vendorGroups.length,
    hasBlockingIssue: lines.some(
      (line) => line.state === 'UNAVAILABLE' || line.state === 'MARKET_EXCLUDED' || line.state === 'OUT_OF_STOCK',
    ),
  };
}