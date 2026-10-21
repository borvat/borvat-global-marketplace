/**
 * Checkout: quote, stock reservation, order split per vendor, commission and payment.
 *
 * Everything below runs in one database transaction. If payment fails, stock and
 * orders roll back together, so the marketplace never holds an unpaid order or a
 * phantom reservation. Checkout is idempotent: repeating the same key returns the
 * same order instead of charging twice.
 */

import { PLATFORM, withApp, type DbPool, type PoolClient } from '../db/pool.ts';
import { emitEvent, writeAudit } from './audit.ts';
import { loadTaxRateBps, type CartOwner } from './cart.ts';
import { hashToken, sha256Hex, stableJson } from './crypto.ts';
import { conflict, notFound, validation, DomainError } from './errors.ts';
import { orderNumber, vendorOrderNumber } from './ids.ts';
import { applyStockMovement } from './inventory.ts';
import { commissionFor, toMinor } from './money.ts';
import { computePricing, type PricingLine } from './pricing.ts';
import type { PaymentProvider } from './payments.ts';

export interface QuoteResult {
  readonly quoteId: string;
  readonly cartId: string;
  readonly market: string;
  readonly currency: string;
  readonly itemsSubtotalMinor: bigint;
  readonly shippingMinor: bigint;
  readonly taxMinor: bigint;
  readonly totalMinor: bigint;
  readonly taxRateBps: number;
  readonly lineCount: number;
  readonly vendorCount: number;
  readonly contentHash: string;
  readonly createdAt: string;
}

export interface VendorOrderResult {
  readonly vendorOrderId: string;
  readonly vendorOrderNumber: string;
  readonly vendorOrganizationId: string;
  readonly itemsSubtotalMinor: bigint;
  readonly shippingMinor: bigint;
  readonly taxMinor: bigint;
  readonly totalMinor: bigint;
  readonly commissionBps: number;
  readonly commissionMinor: bigint;
  readonly payoutMinor: bigint;
  readonly status: string;
}

export interface OrderResult {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly status: string;
  readonly market: string;
  readonly currency: string;
  readonly itemsSubtotalMinor: bigint;
  readonly shippingMinor: bigint;
  readonly taxMinor: bigint;
  readonly totalMinor: bigint;
  readonly paymentProvider: string;
  readonly paymentRef: string;
  readonly vendorOrders: VendorOrderResult[];
  readonly createdAt: string;
}

interface CheckoutLine {
  itemId: string;
  offerId: string;
  productId: string;
  productTitle: string;
  vendorOrganizationId: string;
  quantity: number;
  priceMinor: bigint;
  shippingMinor: bigint;
  freeShippingThresholdMinor: bigint | null;
  currency: string;
  stockAvailable: number;
  maxPerOrder: number;
  shipsTo: string[];
  offerStatus: string;
}

async function loadCheckoutLines(client: PoolClient, cartId: string): Promise<CheckoutLine[]> {
  const result = await client.query<{
    item_id: string;
    offer_id: string;
    quantity: number;
    price_minor: string;
    shipping_minor: string;
    free_shipping_threshold_minor: string | null;
    currency: string;
    stock_available: number;
    max_per_order: number;
    ships_to: string[];
    status: string;
    product_id: string;
    title: string;
    vendor_organization_id: string;
  }>(
    `select ci.id as item_id, ci.offer_id, ci.quantity,
            o.price_minor, o.shipping_minor, o.free_shipping_threshold_minor, o.currency,
            o.stock_available, o.max_per_order, o.ships_to, o.status,
            o.product_id, p.title, o.vendor_organization_id
       from cart_items ci
       join offers o on o.id = ci.offer_id
       join products p on p.id = o.product_id
      where ci.cart_id = $1
      order by o.vendor_organization_id, ci.id
      for update of o, ci`,
    [cartId],
  );
  return result.rows.map((row) => ({
    itemId: row.item_id,
    offerId: row.offer_id,
    productId: row.product_id,
    productTitle: row.title,
    vendorOrganizationId: row.vendor_organization_id,
    quantity: row.quantity,
    priceMinor: toMinor(row.price_minor),
    shippingMinor: toMinor(row.shipping_minor),
    freeShippingThresholdMinor:
      row.free_shipping_threshold_minor === null ? null : toMinor(row.free_shipping_threshold_minor),
    currency: row.currency,
    stockAvailable: row.stock_available,
    maxPerOrder: row.max_per_order,
    shipsTo: row.ships_to,
    offerStatus: row.status,
  }));
}

function assertSellable(lines: CheckoutLine[], market: string, cartCurrency: string): void {
  if (lines.length === 0) throw validation('the cart is empty');
  for (const line of lines) {
    if (line.offerStatus !== 'ACTIVE') {
      throw conflict('an item in the cart is no longer for sale', { offerId: line.offerId });
    }
    if (!line.shipsTo.includes(market)) {
      throw conflict('an item in the cart does not ship to the selected market', {
        offerId: line.offerId,
        market,
      });
    }
    if (line.currency !== cartCurrency) {
      throw conflict('an item in the cart is priced in a different currency', {
        offerId: line.offerId,
        offerCurrency: line.currency,
      });
    }
    if (line.quantity > line.maxPerOrder) {
      throw validation('an item in the cart exceeds the per-order limit', {
        offerId: line.offerId,
        maxPerOrder: line.maxPerOrder,
      });
    }
    if (line.quantity > line.stockAvailable) {
      throw conflict('an item in the cart no longer has enough stock', {
        offerId: line.offerId,
        available: line.stockAvailable,
        requested: line.quantity,
      });
    }
  }
}

function toPricingLines(lines: CheckoutLine[]): PricingLine[] {
  return lines.map((line) => ({
    offerId: line.offerId,
    vendorOrganizationId: line.vendorOrganizationId,
    unitPriceMinor: line.priceMinor,
    shippingMinor: line.shippingMinor,
    freeShippingThresholdMinor: line.freeShippingThresholdMinor,
    quantity: line.quantity,
  }));
}

export async function quoteCart(
  pool: DbPool,
  input: { owner: CartOwner; cartId: string },
): Promise<QuoteResult> {
  return withApp(pool, { ...PLATFORM, userId: input.owner.userId ?? null }, async (client) => {
    const cart = await client.query<{ id: string; market: string; currency: string; status: string; buyer_user_id: string | null }>(
      'select id, market, currency, status, buyer_user_id from carts where id = $1',
      [input.cartId],
    );
    const cartRow = cart.rows[0];
    if (cartRow === undefined) throw notFound('cart not found');
    if (cartRow.status !== 'OPEN') throw conflict(`cart is ${cartRow.status}`);

    const lines = await loadCheckoutLines(client, input.cartId);
    assertSellable(lines, cartRow.market, cartRow.currency);
    const taxRateBps = await loadTaxRateBps(client, cartRow.market);
    const pricing = computePricing(toPricingLines(lines), taxRateBps);
    const snapshot = {
      cartId: input.cartId,
      market: cartRow.market,
      currency: cartRow.currency,
      taxRateBps,
      lines: lines.map((line) => ({
        offerId: line.offerId,
        productId: line.productId,
        vendorOrganizationId: line.vendorOrganizationId,
        quantity: line.quantity,
        unitPriceMinor: line.priceMinor.toString(),
        shippingMinor: line.shippingMinor.toString(),
      })),
      totals: {
        itemsSubtotalMinor: pricing.itemsSubtotalMinor.toString(),
        shippingMinor: pricing.shippingMinor.toString(),
        taxMinor: pricing.taxMinor.toString(),
        totalMinor: pricing.totalMinor.toString(),
      },
    };
    const contentHash = sha256Hex(stableJson(snapshot));
    const inserted = await client.query<{ id: string; created_at: string }>(
      `insert into quotes (cart_id, buyer_user_id, market, currency, items_subtotal_minor, shipping_minor,
                           tax_minor, total_minor, tax_rate_bps, line_count, vendor_count, snapshot, content_hash)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
       returning id, created_at`,
      [
        input.cartId,
        cartRow.buyer_user_id,
        cartRow.market,
        cartRow.currency,
        pricing.itemsSubtotalMinor.toString(),
        pricing.shippingMinor.toString(),
        pricing.taxMinor.toString(),
        pricing.totalMinor.toString(),
        taxRateBps,
        lines.length,
        pricing.vendorGroups.length,
        JSON.stringify(snapshot),
        contentHash,
      ],
    );
    const quoteRow = inserted.rows[0];
    if (quoteRow === undefined) throw notFound('quote could not be created');
    return {
      quoteId: quoteRow.id,
      cartId: input.cartId,
      market: cartRow.market,
      currency: cartRow.currency,
      itemsSubtotalMinor: pricing.itemsSubtotalMinor,
      shippingMinor: pricing.shippingMinor,
      taxMinor: pricing.taxMinor,
      totalMinor: pricing.totalMinor,
      taxRateBps,
      lineCount: lines.length,
      vendorCount: pricing.vendorGroups.length,
      contentHash,
      createdAt: quoteRow.created_at,
    };
  });
}

export interface PlaceOrderInput {
  readonly userId: string;
  readonly cartId: string;
  readonly idempotencyKey: string;
  readonly provider: PaymentProvider;
  /** The total the customer was shown. Checkout refuses to charge a different amount. */
  readonly expectedTotalMinor?: bigint | string | number;
  readonly correlationId?: string | null;
}

export async function placeOrder(pool: DbPool, input: PlaceOrderInput): Promise<OrderResult> {
  const key = input.idempotencyKey.trim();
  if (key.length < 8 || key.length > 200) throw validation('an idempotency key of 8 to 200 characters is required');
  const expectedTotal =
    input.expectedTotalMinor === undefined ? null : toMinor(input.expectedTotalMinor);
  const requestHash = sha256Hex(
    stableJson({ cartId: input.cartId, userId: input.userId, expectedTotal: expectedTotal?.toString() ?? null }),
  );

  return withApp(
    pool,
    { ...PLATFORM, userId: input.userId, correlationId: input.correlationId ?? null },
    async (client) => {
      // 1. Idempotency gate. A repeated key returns the original order.
      const claimed = await client.query(
        `insert into idempotency_keys (key, scope, actor_user_id, request_hash)
         values ($1, 'checkout', $2, $3)
         on conflict (key) do nothing
         returning key`,
        [key, input.userId, requestHash],
      );
      if (claimed.rowCount === 0) {
        const existing = await client.query<{
          request_hash: string;
          status: string;
          response: OrderResult | null;
        }>('select request_hash, status, response from idempotency_keys where key = $1', [key]);
        const row = existing.rows[0];
        if (row === undefined) throw conflict('checkout key is in an unknown state');
        if (row.request_hash !== requestHash) {
          throw new DomainError('IDEMPOTENCY_MISMATCH', 'this checkout key was used for a different request');
        }
        if (row.status === 'COMPLETED' && row.response !== null) return reviveOrder(row.response);
        throw conflict('this checkout is already being processed', { key, status: row.status });
      }

      // 2. Cart must be open and belong to the buyer.
      const cart = await client.query<{ id: string; market: string; currency: string; status: string; buyer_user_id: string | null }>(
        'select id, market, currency, status, buyer_user_id from carts where id = $1 for update',
        [input.cartId],
      );
      const cartRow = cart.rows[0];
      if (cartRow === undefined) throw notFound('cart not found');
      if (cartRow.buyer_user_id !== input.userId) throw notFound('cart not found');
      if (cartRow.status !== 'OPEN') throw conflict(`cart is ${cartRow.status}`);

      // 3. Validate every line against live data.
      const lines = await loadCheckoutLines(client, input.cartId);
      assertSellable(lines, cartRow.market, cartRow.currency);
      const taxRateBps = await loadTaxRateBps(client, cartRow.market);
      const pricing = computePricing(toPricingLines(lines), taxRateBps);

      if (expectedTotal !== null && expectedTotal !== pricing.totalMinor) {
        throw conflict('the basket total changed since it was quoted', {
          expectedTotalMinor: expectedTotal.toString(),
          actualTotalMinor: pricing.totalMinor.toString(),
        });
      }

      // 4. Reserve stock atomically. This is the point where overselling is prevented.
      const number = orderNumber();
      for (const line of lines) {
        await applyStockMovement(client, {
          offerId: line.offerId,
          delta: -line.quantity,
          reason: 'SALE',
          reference: number,
          actorUserId: input.userId,
        });
      }

      // 5. Persist the immutable quote for this order.
      const snapshot = {
        cartId: input.cartId,
        market: cartRow.market,
        currency: cartRow.currency,
        taxRateBps,
        lines: lines.map((line) => ({
          offerId: line.offerId,
          productId: line.productId,
          vendorOrganizationId: line.vendorOrganizationId,
          quantity: line.quantity,
          unitPriceMinor: line.priceMinor.toString(),
          shippingMinor: line.shippingMinor.toString(),
        })),
        totals: {
          itemsSubtotalMinor: pricing.itemsSubtotalMinor.toString(),
          shippingMinor: pricing.shippingMinor.toString(),
          taxMinor: pricing.taxMinor.toString(),
          totalMinor: pricing.totalMinor.toString(),
        },
      };
      const contentHash = sha256Hex(stableJson(snapshot));
      const quote = await client.query<{ id: string }>(
        `insert into quotes (cart_id, buyer_user_id, market, currency, items_subtotal_minor, shipping_minor,
                             tax_minor, total_minor, tax_rate_bps, line_count, vendor_count, snapshot, content_hash)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
         returning id`,
        [
          input.cartId,
          input.userId,
          cartRow.market,
          cartRow.currency,
          pricing.itemsSubtotalMinor.toString(),
          pricing.shippingMinor.toString(),
          pricing.taxMinor.toString(),
          pricing.totalMinor.toString(),
          taxRateBps,
          lines.length,
          pricing.vendorGroups.length,
          JSON.stringify(snapshot),
          contentHash,
        ],
      );
      const quoteId = quote.rows[0]?.id;
      if (quoteId === undefined) throw notFound('quote could not be created');

      // 6. Split the order per vendor and record commission.
      const order = await client.query<{ id: string; created_at: string }>(
        `insert into orders (order_number, buyer_user_id, cart_id, quote_id, market, currency,
                             items_subtotal_minor, shipping_minor, tax_minor, total_minor, status, idempotency_key)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING_PAYMENT', $11)
         returning id, created_at`,
        [
          number,
          input.userId,
          input.cartId,
          quoteId,
          cartRow.market,
          cartRow.currency,
          pricing.itemsSubtotalMinor.toString(),
          pricing.shippingMinor.toString(),
          pricing.taxMinor.toString(),
          pricing.totalMinor.toString(),
          key,
        ],
      );
      const orderRow = order.rows[0];
      if (orderRow === undefined) throw notFound('order could not be created');

      const vendorOrders: VendorOrderResult[] = [];
      const vendorIds = pricing.vendorGroups.map((group) => group.vendorOrganizationId);
      const profiles = await client.query<{ organization_id: string; commission_bps: number }>(
        'select organization_id, commission_bps from vendor_profiles where organization_id = any ($1::uuid[])',
        [vendorIds],
      );
      const commissionByVendor = new Map(
        profiles.rows.map((row) => [row.organization_id, row.commission_bps]),
      );

      let index = 0;
      for (const group of pricing.vendorGroups) {
        index += 1;
        const commissionBps = commissionByVendor.get(group.vendorOrganizationId);
        if (commissionBps === undefined) {
          throw conflict('a vendor in this basket has no active commercial profile', {
            vendorOrganizationId: group.vendorOrganizationId,
          });
        }
        const base = group.goodsMinor + group.shippingMinor;
        const commission = commissionFor(base, commissionBps);
        const payout = base - commission;
        const vendorOrder = await client.query<{ id: string; created_at: string }>(
          `insert into vendor_orders (order_id, vendor_organization_id, vendor_order_number,
                                      items_subtotal_minor, shipping_minor, tax_minor, total_minor,
                                      commission_bps, commission_minor, payout_minor, status)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'CREATED')
           returning id, created_at`,
          [
            orderRow.id,
            group.vendorOrganizationId,
            vendorOrderNumber(number, index),
            group.goodsMinor.toString(),
            group.shippingMinor.toString(),
            group.taxMinor.toString(),
            group.totalMinor.toString(),
            commissionBps,
            commission.toString(),
            payout.toString(),
          ],
        );
        const vendorOrderId = vendorOrder.rows[0]?.id;
        if (vendorOrderId === undefined) throw notFound('vendor order could not be created');

        for (const line of lines.filter((l) => l.vendorOrganizationId === group.vendorOrganizationId)) {
          await client.query(
            `insert into vendor_order_lines (vendor_order_id, offer_id, product_id, product_title,
                                             quantity, unit_price_minor, line_total_minor)
             values ($1, $2, $3, $4, $5, $6, $7)`,
            [
              vendorOrderId,
              line.offerId,
              line.productId,
              line.productTitle,
              line.quantity,
              line.priceMinor.toString(),
              (line.priceMinor * BigInt(line.quantity)).toString(),
            ],
          );
          await client.query(
            `insert into stock_reservations (offer_id, vendor_organization_id, order_id, quantity, status, resolved_at)
             values ($1, $2, $3, $4, 'COMMITTED', now())`,
            [line.offerId, group.vendorOrganizationId, orderRow.id, line.quantity],
          );
        }

        await client.query(
          `insert into ledger_entries (vendor_organization_id, order_id, vendor_order_id, kind, amount_minor, currency, note)
           values ($1, $2, $3, 'SALE', $4, $5, $6)`,
          [
            group.vendorOrganizationId,
            orderRow.id,
            vendorOrderId,
            base.toString(),
            cartRow.currency,
            `goods and shipping for ${number}`,
          ],
        );
        await client.query(
          `insert into ledger_entries (vendor_organization_id, order_id, vendor_order_id, kind, amount_minor, currency, note)
           values ($1, $2, $3, 'COMMISSION', $4, $5, $6)`,
          [
            group.vendorOrganizationId,
            orderRow.id,
            vendorOrderId,
            (-commission).toString(),
            cartRow.currency,
            `platform commission at ${commissionBps} bps`,
          ],
        );

        vendorOrders.push({
          vendorOrderId,
          vendorOrderNumber: vendorOrderNumber(number, index),
          vendorOrganizationId: group.vendorOrganizationId,
          itemsSubtotalMinor: group.goodsMinor,
          shippingMinor: group.shippingMinor,
          taxMinor: group.taxMinor,
          totalMinor: group.totalMinor,
          commissionBps,
          commissionMinor: commission,
          payoutMinor: payout,
          status: 'CREATED',
        });
      }

      // 7. Take the money. A failure rolls the whole transaction back.
      const paymentKey = `pay_${hashToken(key).slice(0, 32)}`;
      const payment = await client.query<{ id: string }>(
        `insert into payments (order_id, provider, amount_minor, currency, status, idempotency_key)
         values ($1, $2, $3, $4, 'INITIATED', $5)
         returning id`,
        [
          orderRow.id,
          input.provider.name,
          pricing.totalMinor.toString(),
          cartRow.currency,
          paymentKey,
        ],
      );
      const paymentId = payment.rows[0]?.id;
      if (paymentId === undefined) throw notFound('payment could not be recorded');

      const result = await input.provider.capture({
        orderId: orderRow.id,
        orderNumber: number,
        amountMinor: pricing.totalMinor,
        currency: cartRow.currency,
        idempotencyKey: paymentKey,
        market: cartRow.market,
      });

      if (result.status !== 'CAPTURED') {
        await client.query(
          "update payments set status = 'FAILED', provider_ref = $2, updated_at = now() where id = $1",
          [paymentId, result.providerRef],
        );
        await writeAudit(client, {
          actorUserId: input.userId,
          action: 'payment.failed',
          entityType: 'payment',
          entityId: paymentId,
          correlationId: input.correlationId ?? null,
          payload: { orderNumber: number, reason: result.failureReason ?? 'unknown' },
        });
        throw new DomainError('PAYMENT_FAILED', 'payment was declined', {
          reason: result.failureReason ?? 'unknown',
        });
      }

      await client.query(
        "update payments set status = 'CAPTURED', provider_ref = $2, updated_at = now() where id = $1",
        [paymentId, result.providerRef],
      );
      await client.query("update orders set status = 'PAID', paid_at = now() where id = $1", [orderRow.id]);
      await client.query(
        "update vendor_orders set status = 'CONFIRMED' where order_id = $1",
        [orderRow.id],
      );
      await client.query("update carts set status = 'CHECKED_OUT', updated_at = now() where id = $1", [
        input.cartId,
      ]);

      const orderResult: OrderResult = {
        orderId: orderRow.id,
        orderNumber: number,
        status: 'PAID',
        market: cartRow.market,
        currency: cartRow.currency,
        itemsSubtotalMinor: pricing.itemsSubtotalMinor,
        shippingMinor: pricing.shippingMinor,
        taxMinor: pricing.taxMinor,
        totalMinor: pricing.totalMinor,
        paymentProvider: input.provider.name,
        paymentRef: result.providerRef,
        vendorOrders,
        createdAt: orderRow.created_at,
      };

      await writeAudit(client, {
        actorUserId: input.userId,
        action: 'order.placed',
        entityType: 'order',
        entityId: orderRow.id,
        correlationId: input.correlationId ?? null,
        payload: {
          orderNumber: number,
          totalMinor: pricing.totalMinor.toString(),
          currency: cartRow.currency,
          vendorCount: vendorOrders.length,
        },
      });
      await emitEvent(client, 'order.placed', {
        orderId: orderRow.id,
        orderNumber: number,
        vendorOrganizationIds: vendorIds,
        totalMinor: pricing.totalMinor.toString(),
      });

      await client.query(
        `update idempotency_keys
            set status = 'COMPLETED', response = $2::jsonb, completed_at = now()
          where key = $1`,
        [key, JSON.stringify(serialiseOrder(orderResult))],
      );

      return orderResult;
    },
  );
}

function serialiseOrder(order: OrderResult): Record<string, unknown> {
  return {
    ...order,
    itemsSubtotalMinor: order.itemsSubtotalMinor.toString(),
    shippingMinor: order.shippingMinor.toString(),
    taxMinor: order.taxMinor.toString(),
    totalMinor: order.totalMinor.toString(),
    vendorOrders: order.vendorOrders.map((vendorOrder) => ({
      ...vendorOrder,
      itemsSubtotalMinor: vendorOrder.itemsSubtotalMinor.toString(),
      shippingMinor: vendorOrder.shippingMinor.toString(),
      taxMinor: vendorOrder.taxMinor.toString(),
      totalMinor: vendorOrder.totalMinor.toString(),
      commissionMinor: vendorOrder.commissionMinor.toString(),
      payoutMinor: vendorOrder.payoutMinor.toString(),
    })),
  };
}

function reviveOrder(stored: OrderResult): OrderResult {
  return {
    ...stored,
    itemsSubtotalMinor: toMinor(stored.itemsSubtotalMinor),
    shippingMinor: toMinor(stored.shippingMinor),
    taxMinor: toMinor(stored.taxMinor),
    totalMinor: toMinor(stored.totalMinor),
    vendorOrders: stored.vendorOrders.map((vendorOrder) => ({
      ...vendorOrder,
      itemsSubtotalMinor: toMinor(vendorOrder.itemsSubtotalMinor),
      shippingMinor: toMinor(vendorOrder.shippingMinor),
      taxMinor: toMinor(vendorOrder.taxMinor),
      totalMinor: toMinor(vendorOrder.totalMinor),
      commissionMinor: toMinor(vendorOrder.commissionMinor),
      payoutMinor: toMinor(vendorOrder.payoutMinor),
    })),
  };
}

export interface BuyerOrderView {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly status: string;
  readonly currency: string;
  readonly totalMinor: bigint;
  readonly createdAt: string;
  readonly vendorOrders: VendorOrderResult[];
}

export async function getBuyerOrder(
  pool: DbPool,
  input: { userId: string; orderId: string },
): Promise<BuyerOrderView> {
  return withApp(pool, { userId: input.userId, platform: true }, async (client) => {
    const order = await client.query<{
      id: string;
      order_number: string;
      status: string;
      currency: string;
      total_minor: string;
      created_at: string;
    }>(
      `select id, order_number, status, currency, total_minor, created_at
         from orders where id = $1 and buyer_user_id = $2`,
      [input.orderId, input.userId],
    );
    const orderRow = order.rows[0];
    if (orderRow === undefined) throw notFound('order not found');
    const vendorOrders = await client.query<{
      id: string;
      vendor_order_number: string;
      vendor_organization_id: string;
      items_subtotal_minor: string;
      shipping_minor: string;
      tax_minor: string;
      total_minor: string;
      commission_bps: number;
      commission_minor: string;
      payout_minor: string;
      status: string;
    }>(
      `select id, vendor_order_number, vendor_organization_id, items_subtotal_minor, shipping_minor,
              tax_minor, total_minor, commission_bps, commission_minor, payout_minor, status
         from vendor_orders where order_id = $1 order by vendor_order_number`,
      [input.orderId],
    );
    return {
      orderId: orderRow.id,
      orderNumber: orderRow.order_number,
      status: orderRow.status,
      currency: orderRow.currency,
      totalMinor: toMinor(orderRow.total_minor),
      createdAt: orderRow.created_at,
      vendorOrders: vendorOrders.rows.map((row) => ({
        vendorOrderId: row.id,
        vendorOrderNumber: row.vendor_order_number,
        vendorOrganizationId: row.vendor_organization_id,
        itemsSubtotalMinor: toMinor(row.items_subtotal_minor),
        shippingMinor: toMinor(row.shipping_minor),
        taxMinor: toMinor(row.tax_minor),
        totalMinor: toMinor(row.total_minor),
        commissionBps: row.commission_bps,
        commissionMinor: toMinor(row.commission_minor),
        payoutMinor: toMinor(row.payout_minor),
        status: row.status,
      })),
    };
  });
}