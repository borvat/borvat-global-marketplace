import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORM, withApp } from '../src/db/pool.ts';
import { login } from '../src/domain/identity.ts';
import {
  approveVendorApplication,
  getVendorProfile,
  listMyApplications,
  rejectVendorApplication,
  submitVendorApplication,
} from '../src/domain/vendors.ts';
import {
  bootstrap,
  makeAdmin,
  makeUser,
  shutdown,
  PASSWORD,
  type Harness,
  type TestUser,
} from './helpers/harness.ts';

describe('vendor onboarding', () => {
  let harness: Harness;
  let admin: TestUser;

  before(async () => {
    harness = await bootstrap();
    admin = await makeAdmin(harness);
  });

  after(async () => {
    await shutdown(harness);
  });

  test('an applicant cannot approve its own application', async () => {
    const applicant = await makeUser(harness);
    const application = await submitVendorApplication(harness.app, {
      userId: applicant.userId,
      legalName: 'Self Approving BV',
      country: 'NL',
    });
    await assert.rejects(
      () =>
        approveVendorApplication(harness.app, {
          adminUserId: applicant.userId,
          applicationId: application.id,
          commissionBps: 1200,
        }),
      /cannot approve its own/,
    );
  });

  test('the database itself refuses a self-approved vendor profile', async () => {
    const applicant = await makeUser(harness);
    const application = await submitVendorApplication(harness.app, {
      userId: applicant.userId,
      legalName: 'Constraint Check BV',
      country: 'NL',
    });
    await assert.rejects(
      () =>
        withApp(harness.app, PLATFORM, async (client) => {
          const org = await client.query<{ id: string }>(
            `insert into organizations (kind, name, slug, country, default_currency, status)
             values ('VENDOR', 'Constraint Check BV', 'constraint-check-bv', 'NL', 'EUR', 'ACTIVE')
             returning id`,
          );
          const organizationId = org.rows[0]?.id;
          await client.query(
            `insert into vendor_profiles
               (organization_id, legal_name, country, commission_bps, payout_currency, approved_by, application_id)
             values ($1, 'Constraint Check BV', 'NL', 1200, 'EUR', $2, $3)`,
            [organizationId, applicant.userId, application.id],
          );
        }),
      /cannot be approved by its own applicant/,
    );
  });

  test('a platform administrator approval creates the vendor tenant', async () => {
    const applicant = await makeUser(harness, { displayName: 'Real Seller' });
    const application = await submitVendorApplication(harness.app, {
      userId: applicant.userId,
      legalName: 'Approved Trading BV',
      country: 'NL',
    });
    const approved = await approveVendorApplication(harness.app, {
      adminUserId: admin.userId,
      applicationId: application.id,
      commissionBps: 1750,
    });
    assert.equal(approved.commissionBps, 1750);
    assert.ok(approved.slug.startsWith('approved-trading-bv'));

    const profile = await getVendorProfile(harness.app, {
      userId: applicant.userId,
      organizationId: approved.organizationId,
    });
    assert.equal(profile.commissionBps, 1750);
    assert.equal(profile.status, 'ACTIVE');

    const session = await login(harness.app, {
      email: applicant.email,
      password: PASSWORD,
      ttlSeconds: 600,
    });
    const sellerRole = session.user.roles.find((role) => role.organizationId === approved.organizationId);
    assert.equal(sellerRole?.role, 'SELLER_OWNER');
    assert.equal(session.user.platformAdmin, false);

    const applications = await listMyApplications(harness.app, applicant.userId);
    assert.equal(applications[0]?.status, 'APPROVED');

    await assert.rejects(
      () =>
        approveVendorApplication(harness.app, {
          adminUserId: admin.userId,
          applicationId: application.id,
          commissionBps: 1200,
        }),
      /cannot be approved/,
    );
  });

  test('a seller cannot open two applications at once', async () => {
    const applicant = await makeUser(harness);
    await submitVendorApplication(harness.app, {
      userId: applicant.userId,
      legalName: 'Duplicate Attempt BV',
      country: 'BE',
    });
    await assert.rejects(
      () =>
        submitVendorApplication(harness.app, {
          userId: applicant.userId,
          legalName: 'Duplicate Attempt Two BV',
          country: 'BE',
        }),
      /already exists/,
    );
  });

  test('rejection requires a reason and blocks later approval', async () => {
    const applicant = await makeUser(harness);
    const application = await submitVendorApplication(harness.app, {
      userId: applicant.userId,
      legalName: 'Rejected Seller BV',
      country: 'NL',
    });
    await assert.rejects(
      () =>
        rejectVendorApplication(harness.app, {
          adminUserId: admin.userId,
          applicationId: application.id,
          note: 'no',
        }),
      /at least 3 characters/,
    );
    await rejectVendorApplication(harness.app, {
      adminUserId: admin.userId,
      applicationId: application.id,
      note: 'Incomplete registration documents',
    });
    await assert.rejects(
      () =>
        approveVendorApplication(harness.app, {
          adminUserId: admin.userId,
          applicationId: application.id,
          commissionBps: 1200,
        }),
      /cannot be approved/,
    );
  });
});