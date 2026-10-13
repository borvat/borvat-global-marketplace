/**
 * Test harness: rebuilds a real PostgreSQL schema and provides small factories.
 * Tests never mock the database, because the guarantees under test are enforced by it.
 */

import { loadConfig } from '../../src/config.ts';
import { createPool, type DbPool } from '../../src/db/pool.ts';
import { runMigrations } from '../../src/db/migrate.ts';
import {
  bootstrapPlatformAdmin,
  login,
  registerUser,
} from '../../src/domain/identity.ts';
import {
  approveVendorApplication,
  submitVendorApplication,
} from '../../src/domain/vendors.ts';
import { createProduct, type Product } from '../../src/domain/catalog.ts';
import { createOffer, type Offer } from '../../src/domain/offers.ts';
import { randomCode } from '../../src/domain/ids.ts';

export interface Harness {
  readonly admin: DbPool;
  readonly app: DbPool;
}

export async function bootstrap(): Promise<Harness> {
  await runMigrations({ reset: true });
  const config = loadConfig();
  return {
    admin: createPool(config.adminDatabaseUrl, 4),
    app: createPool(config.appDatabaseUrl, 4),
  };
}

export async function shutdown(harness: Harness): Promise<void> {
  await harness.app.end();
  await harness.admin.end();
}

export const PASSWORD = 'correct-horse-battery-staple';

export interface TestUser {
  readonly userId: string;
  readonly email: string;
  readonly token: string;
}

export async function makeUser(
  harness: Harness,
  options: { email?: string; displayName?: string; country?: string } = {},
): Promise<TestUser> {
  const email = options.email ?? `user-${randomCode(6).toLowerCase()}@example.test`;
  const user = await registerUser(harness.app, {
    email,
    password: PASSWORD,
    displayName: options.displayName ?? 'Test Person',
    country: options.country ?? 'NL',
  });
  const session = await login(harness.app, { email, password: PASSWORD, ttlSeconds: 3600 });
  return { userId: user.userId, email, token: session.token };
}

export async function makeAdmin(harness: Harness): Promise<TestUser> {
  const admin = await makeUser(harness, { email: `admin-${randomCode(6).toLowerCase()}@example.test` });
  await bootstrapPlatformAdmin(harness.app, { userId: admin.userId });
  const session = await login(harness.app, { email: admin.email, password: PASSWORD, ttlSeconds: 3600 });
  return { ...admin, token: session.token };
}

export interface TestVendor extends TestUser {
  readonly organizationId: string;
  readonly commissionBps: number;
}

export async function makeVendor(
  harness: Harness,
  admin: TestUser,
  options: { legalName?: string; commissionBps?: number; country?: string } = {},
): Promise<TestVendor> {
  const applicant = await makeUser(harness, {
    email: `seller-${randomCode(6).toLowerCase()}@example.test`,
    displayName: options.legalName ?? 'Test Seller',
    country: options.country ?? 'NL',
  });
  const application = await submitVendorApplication(harness.app, {
    userId: applicant.userId,
    legalName: options.legalName ?? `Seller ${randomCode(4)}`,
    country: options.country ?? 'NL',
  });
  const commissionBps = options.commissionBps ?? 1200;
  const approved = await approveVendorApplication(harness.app, {
    adminUserId: admin.userId,
    applicationId: application.id,
    commissionBps,
  });
  const session = await login(harness.app, { email: applicant.email, password: PASSWORD, ttlSeconds: 3600 });
  return {
    userId: applicant.userId,
    email: applicant.email,
    token: session.token,
    organizationId: approved.organizationId,
    commissionBps,
  };
}

export async function makeProduct(
  harness: Harness,
  admin: TestUser,
  options: { masterSku?: string; title?: string; brand?: string; categoryPath?: string } = {},
): Promise<Product> {
  return createProduct(harness.app, {
    actorUserId: admin.userId,
    masterSku: options.masterSku ?? `SKU-${randomCode(6)}`,
    title: options.title ?? 'Camping stove with 4 gas canisters',
    brand: options.brand ?? 'TestBrand',
    categoryPath: options.categoryPath ?? 'outdoor/camping',
    status: 'ACTIVE',
  });
}

export async function makeOffer(
  harness: Harness,
  vendor: TestVendor,
  product: Product,
  options: {
    offerRef?: string;
    priceMinor?: string;
    shippingMinor?: string;
    stockAvailable?: number;
    freeShippingThresholdMinor?: string | null;
    shipsTo?: string[];
    handlingDays?: number;
    maxPerOrder?: number;
  } = {},
): Promise<Offer> {
  return createOffer(harness.app, {
    actorUserId: vendor.userId,
    organizationId: vendor.organizationId,
    productId: product.id,
    offerRef: options.offerRef ?? `ref-${randomCode(6)}`,
    priceMinor: options.priceMinor ?? '1995',
    currency: 'EUR',
    shippingMinor: options.shippingMinor ?? '395',
    freeShippingThresholdMinor: options.freeShippingThresholdMinor ?? null,
    stockAvailable: options.stockAvailable ?? 10,
    handlingDays: options.handlingDays ?? 2,
    maxPerOrder: options.maxPerOrder ?? 10,
    shipsTo: options.shipsTo ?? ['NL', 'BE'],
    status: 'ACTIVE',
  });
}