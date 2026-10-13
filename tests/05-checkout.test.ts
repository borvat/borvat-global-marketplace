import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORM, withApp } from '../src/db/pool.ts';
import { addItem, getOrCreateOpenCart, viewCart } from '../src/domain/cart.ts';
import { getBuyerOrder, placeOrder, quoteCart } from '../src/domain/checkout.ts';
import { listVendorOffers, updateOffer } from '../src/domain/offers.ts';
import { SandboxPaymentProvider } from '../src/domain/payments.ts';
import { getVendorLedger, listVendorOrders } from '../src/domain/vendor-ops.ts';
import {
  bootstrap,
  makeAdmin,
  makeOffer,
  makeProduct,
  makeUser,
  makeVendor,
  shutdown,
  type Harness,
  type TestUser,
  type TestVendor,
} from './helpers/harness.ts';

describe('multi-vendor checkout', () => {
  let harness: Harness;
  let admin: TestUser;
  let vendorA: TestVendor;
  let vendorB: TestVendor;
  let buyer: TestUser;
  let offerA: { id: string; stockAvailable: number };
  let offerB: { id: string; stockAvailable: number };
  const provider = new SandboxPaymentProvider();

  const stockOf = async (vendor: TestVendor, offerId: string): Promise<number | undefined> => {
    const offers = await listVendorOffers(harness.app, {
      userId: vendor.userId,
      organizationId: vendor.organizationId,
    });
    return offers.find((offer) => offer.id === offerId)?.stockAvailable;
  };

  /** Each test starts from an empty basket: any cart left open by a previous test is retired. */
  const newCart = async (): Promise<string> => {
    await withApp(harness.app, PLATFORM, async (client) => {
      await client.query(
        "update carts set status = 'ABANDONED' where buyer_user_id = $1 and status = 'OPEN'",
        [buyer.userId],
      );
    });
    const cart = await getOrCreateOpenCart(harness.app, {
      owner: { userId: buyer.userId },
      market: 'NL',
      currency: 'EUR',
    });
    return cart.cartId;
  };

  before(async () => {
    harness = await bootstrap();
    admin = await makeAdmin(harness);
    vendorA = await makeVendor(harness, admin, { legalName: 'Alpha Trading', commissionBps: 2000 });
    vendorB = await makeVendor(harness, admin, { legalName: 'Beta Supplies', commissionBps: 1500 });
    buyer = await makeUser(harness, { displayName: 'Buyer One' });
    const product = await makeProduct(harness, admin, { title: 'Camping stove with 4 canisters' });
    offerA = await makeOffer(harness, vendorA, product, {
      offerRef: 'alpha-stove',
      priceMinor: '1995',
      shippingMinor: '395',
      stockAvailable: 10,
    });
    offerB = await makeOffer(harness, vendorB, product, {
      offerRef: 'beta-stove',
      priceMinor: '2150',
      shippingMinor: '0',
      stockAvailable: 5,
    });
  });

  after(async () => {
    await shutdown(harness);
  });

  test('a cart mixes offers from two vendors and prices them with tax', async () => {
    const cartId = await newCart();
    await addItem(harness.app, { owner: { userId: buyer.userId }, cartId, offerId: offerA.id, quantity: 2 });
    const view = await addItem(harness.app, {
      owner: { userId: buyer.userId },
      cartId,
      offerId: offerB.id,
      quantity: 1,
    });
    assert.equal(view.lines.length, 2);
    assert.equal(view.vendorCount, 2);
    assert.equal(view.itemsSubtotalMinor, 6140n);
    assert.equal(view.shippingMinor, 395n);
    assert.equal(view.totalMinor, 6535n);
    assert.equal(view.taxMinor, 1134n);
    assert.equal(view.taxRateBps, 2100);
    assert.equal(view.hasBlockingIssue, false);
  });

  test('the quote matches the cart total', async () => {
    const cartId = await newCart();
    await addItem(harness.app, { owner: { userId: buyer.userId }, cartId, offerId: offerA.id, quantity: 2 });
    await addItem(harness.app, { owner: { userId: buyer.userId }, cartId, offerId: offerB.id, quantity: 1 });
    const quote = await quoteCart(harness.app, { owner: { userId: buyer.userId }, cartId });
    assert.equal(quote.totalMinor, 6535n);
    assert.equal(quote.vendorCount, 2);
    assert.equal(quote.lineCount, 2);
    assert.equal(quote.contentHash.length, 64);
  });

  test('checkout splits the order per vendor and charges commission', async () => {
    const cartId = await newCart();
    await addItem(harness.app, { owner: { userId: buyer.userId }, cartId, offerId: offerA.id, quantity: 2 });
    await addItem(harness.app, { owner: { userId: buyer.userId }, cartId, offerId: offerB.id, quantity: 1 });

    const order = await placeOrder(harness.app, {
      userId: buyer.userId,
      cartId,
      idempotencyKey: 'checkout-happy-path-0001',
      provider,
      expectedTotalMinor: 6535n,
    });

    assert.equal(order.status, 'PAID');
    assert.equal(order.totalMinor, 6535n);
    assert.equal(order.itemsSubtotalMinor, 6140n);
    assert.equal(order.shippingMinor, 395n);
    assert.equal(order.taxMinor, 1134n);
    assert.equal(order.vendorOrders.length, 2);
    assert.match(order.orderNumber, /^BRV-\d{8}-[0-9A-Z]{6}$/);

    const alpha = order.vendorOrders.find((vo) => vo.vendorOrganizationId === vendorA.organizationId);
    const beta = order.vendorOrders.find((vo) => vo.vendorOrganizationId === vendorB.organizationId);
    assert.ok(alpha && beta);

    assert.equal(alpha.itemsSubtotalMinor, 3990n);
    assert.equal(alpha.shippingMinor, 395n);
    assert.equal(alpha.totalMinor, 4385n);
    assert.equal(alpha.commissionBps, 2000);
    assert.equal(alpha.commissionMinor, 877n);
    assert.equal(alpha.payoutMinor, 3508n);

    assert.equal(beta.itemsSubtotalMinor, 2150n);
    assert.equal(beta.shippingMinor, 0n);
    assert.equal(beta.totalMinor, 2150n);
    assert.equal(beta.commissionBps, 1500);
    assert.equal(beta.commissionMinor, 323n);
    assert.equal(beta.payoutMinor, 1827n);

    // payout plus commission must reconstruct exactly what the buyer paid to that vendor
    for (const vendorOrder of order.vendorOrders) {
      assert.equal(vendorOrder.payoutMinor + vendorOrder.commissionMinor, vendorOrder.totalMinor);
    }

    assert.equal(await stockOf(vendorA, offerA.id), 8);
    assert.equal(await stockOf(vendorB, offerB.id), 4);

    const vendorLedger = await getVendorLedger(harness.app, {
      userId: vendorA.userId,
      organizationId: vendorA.organizationId,
    });
    assert.equal(vendorLedger.balanceMinor, 3508n);
    assert.deepEqual(
      vendorLedger.entries.map((entry) => entry.kind).sort(),
      ['COMMISSION', 'SALE'],
    );

    const vendorOrders = await listVendorOrders(harness.app, {
      userId: vendorA.userId,
      organizationId: vendorA.organizationId,
    });
    assert.equal(vendorOrders.length, 1);
    assert.equal(vendorOrders[0]?.lines.length, 1);
    assert.equal(vendorOrders[0]?.lines[0]?.quantity, 2);

    const buyerView = await getBuyerOrder(harness.app, { userId: buyer.userId, orderId: order.orderId });
    assert.equal(buyerView.vendorOrders.length, 2);
    assert.equal(buyerView.totalMinor, 6535n);

    const payments = await withApp(harness.app, PLATFORM, async (client) =>
      client.query<{ status: string; amount_minor: string; provider_ref: string }>(
        'select status, amount_minor, provider_ref from payments where order_id = $1',
        [order.orderId],
      ),
    );
    assert.equal(payments.rows[0]?.status, 'CAPTURED');
    assert.equal(payments.rows[0]?.amount_minor, '6535');
    assert.match(payments.rows[0]?.provider_ref ?? '', /^sbx_brv-/);

    // replaying the same key returns the same order and never charges again
    const replay = await placeOrder(harness.app, {
      userId: buyer.userId,
      cartId,
      idempotencyKey: 'checkout-happy-path-0001',
      provider,
      expectedTotalMinor: 6535n,
    });
    assert.equal(replay.orderId, order.orderId);
    assert.equal(await stockOf(vendorA, offerA.id), 8);

    const orderCount = await withApp(harness.app, PLATFORM, async (client) =>
      client.query<{ count: string }>('select count(*)::text as count from orders'),
    );
    assert.equal(orderCount.rows[0]?.count, '1');
  });

  test('reusing an idempotency key for another basket is refused', async () => {
    const cartId = await newCart();
    await addItem(harness.app, { owner: { userId: buyer.userId }, cartId, offerId: offerA.id, quantity: 1 });
    await assert.rejects(
      () =>
        placeOrder(harness.app, {
          userId: buyer.userId,
          cartId,
          idempotencyKey: 'checkout-happy-path-0001',
          provider,
        }),
      /different request/,
    );
  });

  test('checkout refuses to charge a different total than the customer saw', async () => {
    const cartId = await newCart();
    await addItem(harness.app, { owner: { userId: buyer.userId }, cartId, offerId: offerA.id, quantity: 1 });
    await assert.rejects(
      () =>
        placeOrder(harness.app, {
          userId: buyer.userId,
          cartId,
          idempotencyKey: 'checkout-stale-total-0001',
          provider,
          expectedTotalMinor: 1n,
        }),
      /total changed/,
    );
  });

  test('a declined payment leaves no order and no reserved stock', async () => {
    const cartId = await newCart();
    await addItem(harness.app, { owner: { userId: buyer.userId }, cartId, offerId: offerA.id, quantity: 3 });
    const stockBefore = await stockOf(vendorA, offerA.id);

    await assert.rejects(
      () =>
        placeOrder(harness.app, {
          userId: buyer.userId,
          cartId,
          idempotencyKey: 'checkout-declined-0001',
          provider: new SandboxPaymentProvider({ alwaysDecline: true }),
        }),
      /payment was declined/,
    );

    assert.equal(await stockOf(vendorA, offerA.id), stockBefore);

    const state = await withApp(harness.app, PLATFORM, async (client) => {
      const orders = await client.query<{ count: string }>('select count(*)::text as count from orders');
      const payments = await client.query<{ count: string }>(
        "select count(*)::text as count from payments where status = 'FAILED'",
      );
      const carts = await client.query<{ status: string }>('select status from carts where id = $1', [cartId]);
      return {
        orders: orders.rows[0]?.count,
        failedPayments: payments.rows[0]?.count,
        cartStatus: carts.rows[0]?.status,
      };
    });
    assert.equal(state.orders, '1');
    assert.equal(state.failedPayments, '0');
    assert.equal(state.cartStatus, 'OPEN');

    const cart = await viewCart(harness.app, { owner: { userId: buyer.userId }, cartId });
    assert.equal(cart.status, 'OPEN');
  });

  test('a paused offer blocks checkout instead of selling something unavailable', async () => {
    const cartId = await newCart();
    await addItem(harness.app, { owner: { userId: buyer.userId }, cartId, offerId: offerB.id, quantity: 1 });
    await updateOffer(harness.app, {
      actorUserId: vendorB.userId,
      organizationId: vendorB.organizationId,
      offerId: offerB.id,
      patch: { status: 'PAUSED' },
    });
    try {
      const cart = await viewCart(harness.app, { owner: { userId: buyer.userId }, cartId });
      assert.equal(cart.lines[0]?.state, 'UNAVAILABLE');
      assert.equal(cart.hasBlockingIssue, true);

      await assert.rejects(
        () =>
          placeOrder(harness.app, {
            userId: buyer.userId,
            cartId,
            idempotencyKey: 'checkout-paused-offer-0001',
            provider,
          }),
        /no longer for sale/,
      );
    } finally {
      await updateOffer(harness.app, {
        actorUserId: vendorB.userId,
        organizationId: vendorB.organizationId,
        offerId: offerB.id,
        patch: { status: 'ACTIVE' },
      });
    }
  });

  test('a cart cannot hold more than the available stock', async () => {
    const cartId = await newCart();
    await assert.rejects(
      () =>
        addItem(harness.app, {
          owner: { userId: buyer.userId },
          cartId,
          offerId: offerB.id,
          quantity: 99,
        }),
      /not enough stock|at most/,
    );
  });
});
