import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORM, withApp } from '../src/db/pool.ts';
import { adjustStock, applyStockMovement, listStockLedger } from '../src/domain/inventory.ts';
import { listVendorOffers } from '../src/domain/offers.ts';
import {
  bootstrap,
  makeAdmin,
  makeOffer,
  makeProduct,
  makeVendor,
  shutdown,
  type Harness,
  type TestUser,
  type TestVendor,
} from './helpers/harness.ts';

describe('inventory integrity', () => {
  let harness: Harness;
  let admin: TestUser;
  let vendor: TestVendor;

  before(async () => {
    harness = await bootstrap();
    admin = await makeAdmin(harness);
    vendor = await makeVendor(harness, admin, { legalName: 'Stock Keeper BV', commissionBps: 1000 });
  });

  after(async () => {
    await shutdown(harness);
  });

  test('stock movements are recorded with the resulting balance', async () => {
    const product = await makeProduct(harness, admin, { masterSku: `SKU-${Date.now()}` });
    const offer = await makeOffer(harness, vendor, product, { stockAvailable: 5 });

    const increased = await adjustStock(harness.app, {
      actorUserId: vendor.userId,
      organizationId: vendor.organizationId,
      offerId: offer.id,
      delta: 7,
      reason: 'RESTOCK',
      reference: 'delivery-1',
    });
    assert.equal(increased.balanceAfter, 12);

    const decreased = await adjustStock(harness.app, {
      actorUserId: vendor.userId,
      organizationId: vendor.organizationId,
      offerId: offer.id,
      delta: -2,
      reason: 'DAMAGE',
      reference: 'damaged in transit',
    });
    assert.equal(decreased.balanceAfter, 10);

    const ledger = await listStockLedger(harness.app, {
      userId: vendor.userId,
      organizationId: vendor.organizationId,
      offerId: offer.id,
    });
    assert.equal(ledger.length, 3);
    assert.deepEqual(
      ledger.map((row) => row.balanceAfter),
      [10, 12, 5],
    );
  });

  test('stock can never be driven negative', async () => {
    const product = await makeProduct(harness, admin, { masterSku: `SKU-${Date.now()}-N` });
    const offer = await makeOffer(harness, vendor, product, { stockAvailable: 2 });
    await assert.rejects(
      () =>
        adjustStock(harness.app, {
          actorUserId: vendor.userId,
          organizationId: vendor.organizationId,
          offerId: offer.id,
          delta: -3,
          reason: 'DAMAGE',
        }),
      /no longer available/,
    );
    const offers = await listVendorOffers(harness.app, {
      userId: vendor.userId,
      organizationId: vendor.organizationId,
    });
    assert.equal(offers.find((candidate) => candidate.id === offer.id)?.stockAvailable, 2);
  });

  test('two concurrent buyers cannot oversell the last unit', async () => {
    const product = await makeProduct(harness, admin, { masterSku: `SKU-${Date.now()}-C` });
    const offer = await makeOffer(harness, vendor, product, { stockAvailable: 1 });

    const attempt = () =>
      withApp(harness.app, PLATFORM, async (client) =>
        applyStockMovement(client, { offerId: offer.id, delta: -1, reason: 'SALE', reference: 'race' }),
      );

    const results = await Promise.allSettled([attempt(), attempt()]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    const offers = await listVendorOffers(harness.app, {
      userId: vendor.userId,
      organizationId: vendor.organizationId,
    });
    assert.equal(offers.find((candidate) => candidate.id === offer.id)?.stockAvailable, 0);
  });

  test('ledgers reject updates and deletes through policy and through trigger', async () => {
    const before = await withApp(harness.app, PLATFORM, async (client) => {
      const result = await client.query<{ count: string }>('select count(*)::text as count from inventory_ledger');
      return result.rows[0]?.count;
    });
    assert.ok(Number(before) > 0);

    // First layer: no update or delete policy exists, so the statement cannot touch a row.
    const noRows = await withApp(harness.app, PLATFORM, async (client) => {
      const updated = await client.query('update inventory_ledger set delta = 1');
      const deleted = await client.query('delete from inventory_ledger');
      return { updated: updated.rowCount, deleted: deleted.rowCount };
    });
    assert.equal(noRows.updated, 0);
    assert.equal(noRows.deleted, 0);

    // Second layer: even if a policy were added, the trigger refuses the write.
    await harness.admin.query('create policy tmp_allow_update on inventory_ledger for update using (true)');
    try {
      await assert.rejects(
        () =>
          withApp(harness.app, PLATFORM, async (client) =>
            client.query('update inventory_ledger set delta = 1'),
          ),
        /append-only/,
      );
    } finally {
      await harness.admin.query('drop policy tmp_allow_update on inventory_ledger');
    }

    const after = await withApp(harness.app, PLATFORM, async (client) => {
      const result = await client.query<{ count: string }>('select count(*)::text as count from inventory_ledger');
      return result.rows[0]?.count;
    });
    assert.equal(after, before);
  });

  test('the money ledger and the audit log cannot be rewritten', async () => {
    const result = await withApp(harness.app, PLATFORM, async (client) => {
      const ledger = await client.query('delete from ledger_entries');
      const audit = await client.query("update audit_log set action = 'x'");
      return { ledger: ledger.rowCount, audit: audit.rowCount };
    });
    assert.equal(result.ledger, 0);
    assert.equal(result.audit, 0);

    await harness.admin.query('create policy tmp_allow_audit_update on audit_log for update using (true)');
    try {
      await assert.rejects(
        () =>
          withApp(harness.app, PLATFORM, async (client) =>
            client.query("update audit_log set action = 'x'"),
          ),
        /append-only/,
      );
    } finally {
      await harness.admin.query('drop policy tmp_allow_audit_update on audit_log');
    }
  });
});
