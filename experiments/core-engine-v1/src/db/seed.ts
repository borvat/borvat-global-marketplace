/**
 * Seed a working marketplace: one platform administrator, two approved vendors,
 * a small catalogue and competing offers for the same products.
 * Running it twice is safe: existing records are reused instead of duplicated.
 */

import { loadConfig } from '../config.ts';
import { createPool, type DbPool } from './pool.ts';
import { bootstrapPlatformAdmin, login, registerUser } from '../domain/identity.ts';
import {
  approveVendorApplication,
  listMyApplications,
  submitVendorApplication,
} from '../domain/vendors.ts';
import { createProduct } from '../domain/catalog.ts';
import { createOffer } from '../domain/offers.ts';

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'borvat-demo-password';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@borvat.test';

interface VendorSpec {
  readonly email: string;
  readonly legalName: string;
  readonly commissionBps: number;
}

const VENDORS: VendorSpec[] = [
  { email: 'alpha@borvat.test', legalName: 'Alpha Trading BV', commissionBps: 2000 },
  { email: 'beta@borvat.test', legalName: 'Beta Supplies BV', commissionBps: 1500 },
];

const CATALOGUE = [
  {
    masterSku: 'STOVE-4CAN',
    title: 'Camping stove with 4 gas canisters',
    brand: 'CampPro',
    categoryPath: 'outdoor/camping',
    offers: [
      { vendor: 0, offerRef: 'alpha-stove', priceMinor: '1995', shippingMinor: '395', stock: 25, handlingDays: 2 },
      { vendor: 1, offerRef: 'beta-stove', priceMinor: '2150', shippingMinor: '0', stock: 12, handlingDays: 4 },
    ],
  },
  {
    masterSku: 'TENT-2P',
    title: 'Two person dome tent',
    brand: 'TrailLine',
    categoryPath: 'outdoor/camping',
    offers: [
      { vendor: 0, offerRef: 'alpha-tent', priceMinor: '8995', shippingMinor: '0', stock: 8, handlingDays: 3 },
      { vendor: 1, offerRef: 'beta-tent', priceMinor: '9450', shippingMinor: '495', stock: 5, handlingDays: 2 },
    ],
  },
  {
    masterSku: 'LAMP-LED',
    title: 'Rechargeable LED lantern',
    brand: 'GlowPro',
    categoryPath: 'outdoor/lighting',
    offers: [
      { vendor: 0, offerRef: 'alpha-lamp', priceMinor: '1299', shippingMinor: '395', stock: 40, handlingDays: 1 },
      { vendor: 1, offerRef: 'beta-lamp', priceMinor: '1195', shippingMinor: '450', stock: 30, handlingDays: 1 },
    ],
  },
];

async function registerOrLogin(
  pool: DbPool,
  email: string,
  displayName: string,
): Promise<{ userId: string; token: string; created: boolean }> {
  try {
    const created = await registerUser(pool, {
      email,
      password: SEED_PASSWORD,
      displayName,
      country: 'NL',
    });
    const session = await login(pool, { email, password: SEED_PASSWORD, ttlSeconds: 600 });
    return { userId: created.userId, token: session.token, created: true };
  } catch {
    const session = await login(pool, { email, password: SEED_PASSWORD, ttlSeconds: 600 });
    return { userId: session.user.userId, token: session.token, created: false };
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.appDatabaseUrl, 4);
  try {
    const admin = await registerOrLogin(pool, ADMIN_EMAIL, 'Platform Administrator');
    await bootstrapPlatformAdmin(pool, { userId: admin.userId });
    console.log(`${admin.created ? 'created' : 'reused '} platform admin ${ADMIN_EMAIL}`);

    const vendorSessions: { organizationId: string; userId: string; email: string }[] = [];
    for (const spec of VENDORS) {
      const account = await registerOrLogin(pool, spec.email, spec.legalName);
      const session = await login(pool, { email: spec.email, password: SEED_PASSWORD, ttlSeconds: 600 });
      const existing = session.user.roles.find((role) => role.organizationKind === 'VENDOR');
      if (existing !== undefined) {
        vendorSessions.push({
          organizationId: existing.organizationId,
          userId: account.userId,
          email: spec.email,
        });
        console.log(`reused  vendor ${spec.legalName}`);
        continue;
      }
      const applications = await listMyApplications(pool, account.userId);
      const open = applications.find((application) => application.status === 'SUBMITTED');
      const applicationId =
        open?.id ??
        (
          await submitVendorApplication(pool, {
            userId: account.userId,
            legalName: spec.legalName,
            country: 'NL',
          })
        ).id;
      const approved = await approveVendorApplication(pool, {
        adminUserId: admin.userId,
        applicationId,
        commissionBps: spec.commissionBps,
      });
      vendorSessions.push({
        organizationId: approved.organizationId,
        userId: account.userId,
        email: spec.email,
      });
      console.log(`approved vendor ${spec.legalName} (${approved.slug}, ${spec.commissionBps} bps)`);
    }

    for (const item of CATALOGUE) {
      let productId: string | null = null;
      try {
        const product = await createProduct(pool, {
          actorUserId: admin.userId,
          masterSku: item.masterSku,
          title: item.title,
          brand: item.brand,
          categoryPath: item.categoryPath,
          status: 'ACTIVE',
        });
        productId = product.id;
        console.log(`created product ${item.masterSku}`);
      } catch {
        console.log(`reused  product ${item.masterSku}`);
      }
      if (productId === null) continue;

      for (const offer of item.offers) {
        const vendor = vendorSessions[offer.vendor];
        if (vendor === undefined) continue;
        await createOffer(pool, {
          actorUserId: vendor.userId,
          organizationId: vendor.organizationId,
          productId,
          offerRef: offer.offerRef,
          priceMinor: offer.priceMinor,
          currency: 'EUR',
          shippingMinor: offer.shippingMinor,
          stockAvailable: offer.stock,
          handlingDays: offer.handlingDays,
          shipsTo: ['NL', 'BE'],
          status: 'ACTIVE',
        });
        console.log(`  offer ${offer.offerRef} at ${offer.priceMinor} minor units`);
      }
    }

    console.log('\nseed complete');
    console.log(`admin   ${ADMIN_EMAIL} / ${SEED_PASSWORD}`);
    for (const spec of VENDORS) console.log(`vendor  ${spec.email} / ${SEED_PASSWORD}`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});