import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORM, withApp } from '../src/db/pool.ts';
import { addItem, getOrCreateOpenCart } from '../src/domain/cart.ts';
import { updateOffer } from '../src/domain/offers.ts';
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

describe('row level security and tenant isolation', () => {
  let harness: Harness;
  let admin: TestUser;
  let vendorA: TestVendor;
  let vendorB: TestVendor;
  let buyer1: TestUser;
  let buyer2: TestUser;
  let offerA: { id: string };
  let offerB: { id: string };

  before(async () => {
    harness = await bootstrap();
    admin = await makeAdmin(harness);
    vendorA = await makeVendor(harness, admin, { legalName: 'Alpha Trading', commissionBps: 2000 });
    vendorB = await makeVendor(harness, admin, { legalName: 'Beta Supplies', commissionBps: 1500 });
    buyer1 = await makeUser(harness);
    buyer2 = await makeUser(harness);
    const product = await makeProduct(harness, admin);
    offerA = await makeOffer(harness, vendorA, product, { priceMinor: '1995', shippingMinor: '395' });
    offerB = await makeOffer(harness, vendorB, product, { priceMinor: '2150', shippingMinor: '0' });
  });

  after(async () => {
    await shutdown(harness);
  });

  test('a vendor sees only its own offers', async () => {
    const rows = await withApp(harness.app, { orgId: vendorA.organizationId }, async (client) => {
      const result = await client.query<{ id: string }>('select id from offers');
      return result.rows.map((row) => row.id);
    });
    assert.deepEqual(rows, [offerA.id]);
  });

  test('without tenant context no offer is visible at all', async () => {
    const count = await withApp(harness.app, {}, async (client) => {
      const result = await client.query('select id from offers');
      return result.rowCount;
    });
    assert.equal(count, 0);
  });

  test('a vendor cannot update another vendor offer', async () => {
    const result = await withApp(harness.app, { orgId: vendorA.organizationId }, async (client) =>
      client.query('update offers set price_minor = 1 where id = $1', [offerB.id]),
    );
    assert.equal(result.rowCount, 0);
  });

  test('a vendor cannot insert an offer owned by another vendor', async () => {
    await assert.rejects(
      () =>
        withApp(harness.app, { orgId: vendorA.organizationId }, async (client) =>
          client.query(
            `insert into offers (product_id, vendor_organization_id, offer_ref, price_minor, currency, ships_to)
             values ((select product_id from offers where id = $1), $2, 'forged', 100, 'EUR', '{NL}')`,
            [offerA.id, vendorB.organizationId],
          ),
        ),
      /row-level security|violates/i,
    );
  });

  test('the vendor-facing offer update refuses a foreign offer', async () => {
    await assert.rejects(
      () =>
        updateOffer(harness.app, {
          actorUserId: vendorA.userId,
          organizationId: vendorA.organizationId,
          offerId: offerB.id,
          patch: { priceMinor: '100' },
        }),
      /offer not found/,
    );
  });

  test('public read exposes active offers only', async () => {
    const before = await withApp(harness.app, { publicRead: true }, async (client) =>
      (await client.query<{ id: string }>('select id from offers order by id')).rows.map((row) => row.id),
    );
    assert.equal(before.length, 2);

    await updateOffer(harness.app, {
      actorUserId: vendorB.userId,
      organizationId: vendorB.organizationId,
      offerId: offerB.id,
      patch: { status: 'PAUSED' },
    });

    const afterPause = await withApp(harness.app, { publicRead: true }, async (client) =>
      (await client.query<{ id: string }>('select id from offers order by id')).rows.map((row) => row.id),
    );
    assert.deepEqual(afterPause, [offerA.id]);

    await updateOffer(harness.app, {
      actorUserId: vendorB.userId,
      organizationId: vendorB.organizationId,
      offerId: offerB.id,
      patch: { status: 'ACTIVE' },
    });
  });

  test('a buyer cannot read another buyer cart', async () => {
    const cart = await getOrCreateOpenCart(harness.app, {
      owner: { userId: buyer1.userId },
      market: 'NL',
      currency: 'EUR',
    });
    await addItem(harness.app, {
      owner: { userId: buyer1.userId },
      cartId: cart.cartId,
      offerId: offerA.id,
      quantity: 1,
    });

    const visibleToOwner = await withApp(harness.app, { userId: buyer1.userId }, async (client) => {
      const result = await client.query('select id from carts');
      return result.rowCount;
    });
    const visibleToOther = await withApp(harness.app, { userId: buyer2.userId }, async (client) => {
      const carts = await client.query('select id from carts');
      const items = await client.query('select id from cart_items');
      return { carts: carts.rowCount, items: items.rowCount };
    });

    assert.equal(visibleToOwner, 1);
    assert.equal(visibleToOther.carts, 0);
    assert.equal(visibleToOther.items, 0);
  });

  test('a vendor cannot read another vendor inventory ledger', async () => {
    const rowsA = await withApp(harness.app, { orgId: vendorA.organizationId }, async (client) =>
      (await client.query<{ vendor_organization_id: string }>('select vendor_organization_id from inventory_ledger')).rows,
    );
    assert.ok(rowsA.length > 0);
    assert.ok(rowsA.every((row) => row.vendor_organization_id === vendorA.organizationId));

    const rowsB = await withApp(harness.app, { orgId: vendorB.organizationId }, async (client) =>
      (await client.query<{ vendor_organization_id: string }>('select vendor_organization_id from inventory_ledger')).rows,
    );
    assert.ok(rowsB.every((row) => row.vendor_organization_id === vendorB.organizationId));
  });

  test('platform mode sees every tenant', async () => {
    const rows = await withApp(harness.app, PLATFORM, async (client) =>
      (await client.query<{ vendor_organization_id: string }>('select vendor_organization_id from inventory_ledger')).rows,
    );
    const vendors = new Set(rows.map((row) => row.vendor_organization_id));
    assert.ok(vendors.has(vendorA.organizationId));
    assert.ok(vendors.has(vendorB.organizationId));
  });
});