/**
 * Vendor onboarding.
 *
 * A seller applies, a platform administrator decides. The database itself refuses
 * an approval recorded by the applicant, and refuses a decision without a reviewer,
 * so a bug in the API cannot create a self-approved seller.
 */

import { PLATFORM, withApp, type DbPool } from '../db/pool.ts';
import { emitEvent, writeAudit } from './audit.ts';
import { conflict, forbidden, notFound, validation } from './errors.ts';
import { slugify } from './ids.ts';

const COUNTRY_RE = /^[A-Z]{2}$/;

export interface VendorApplication {
  readonly id: string;
  readonly applicantUserId: string;
  readonly legalName: string;
  readonly country: string;
  readonly status: string;
  readonly createdAt: string;
}

export interface ApproveInput {
  readonly adminUserId: string;
  readonly applicationId: string;
  readonly commissionBps: number;
  readonly payoutCurrency?: string;
  readonly correlationId?: string | null;
}

export interface ApprovedVendor {
  readonly organizationId: string;
  readonly slug: string;
  readonly legalName: string;
  readonly commissionBps: number;
}

export async function submitVendorApplication(
  pool: DbPool,
  input: {
    userId: string;
    legalName: string;
    country: string;
    companyRegistration?: string | null;
    vatNumber?: string | null;
    correlationId?: string | null;
  },
): Promise<VendorApplication> {
  const legalName = input.legalName.trim();
  if (legalName.length < 2 || legalName.length > 200) {
    throw validation('legal name must be between 2 and 200 characters');
  }
  const country = input.country.trim().toUpperCase();
  if (!COUNTRY_RE.test(country)) throw validation(`invalid country code: ${input.country}`);

  return withApp(
    pool,
    { userId: input.userId, correlationId: input.correlationId ?? null },
    async (client) => {
      const open = await client.query<{ id: string }>(
        `select id from vendor_applications
          where applicant_user_id = $1 and status in ('DRAFT', 'SUBMITTED')
          limit 1`,
        [input.userId],
      );
      if (open.rows[0] !== undefined) {
        throw conflict('an open vendor application already exists', { applicationId: open.rows[0].id });
      }
      const created = await client.query<{
        id: string;
        applicant_user_id: string;
        legal_name: string;
        country: string;
        status: string;
        created_at: string;
      }>(
        `insert into vendor_applications
           (applicant_user_id, legal_name, country, company_registration, vat_number, status, submitted_at)
         values ($1, $2, $3, $4, $5, 'SUBMITTED', now())
         returning id, applicant_user_id, legal_name, country, status, created_at`,
        [
          input.userId,
          legalName,
          country,
          input.companyRegistration ?? null,
          input.vatNumber ?? null,
        ],
      );
      const row = created.rows[0];
      if (row === undefined) throw notFound('application was not created');
      await writeAudit(client, {
        actorUserId: input.userId,
        action: 'vendor_application.submitted',
        entityType: 'vendor_application',
        entityId: row.id,
        correlationId: input.correlationId ?? null,
        payload: { legalName, country },
      });
      await emitEvent(client, 'vendor_application.submitted', { applicationId: row.id });
      return {
        id: row.id,
        applicantUserId: row.applicant_user_id,
        legalName: row.legal_name,
        country: row.country,
        status: row.status,
        createdAt: row.created_at,
      };
    },
  );
}

export async function listMyApplications(pool: DbPool, userId: string): Promise<VendorApplication[]> {
  return withApp(pool, { userId }, async (client) => {
    const result = await client.query<{
      id: string;
      applicant_user_id: string;
      legal_name: string;
      country: string;
      status: string;
      created_at: string;
    }>(
      `select id, applicant_user_id, legal_name, country, status, created_at
         from vendor_applications where applicant_user_id = $1 order by created_at desc`,
      [userId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      applicantUserId: row.applicant_user_id,
      legalName: row.legal_name,
      country: row.country,
      status: row.status,
      createdAt: row.created_at,
    }));
  });
}

export async function listPendingApplications(pool: DbPool): Promise<VendorApplication[]> {
  return withApp(pool, PLATFORM, async (client) => {
    const result = await client.query<{
      id: string;
      applicant_user_id: string;
      legal_name: string;
      country: string;
      status: string;
      created_at: string;
    }>(
      `select id, applicant_user_id, legal_name, country, status, created_at
         from vendor_applications where status = 'SUBMITTED' order by created_at`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      applicantUserId: row.applicant_user_id,
      legalName: row.legal_name,
      country: row.country,
      status: row.status,
      createdAt: row.created_at,
    }));
  });
}

export async function approveVendorApplication(
  pool: DbPool,
  input: ApproveInput,
): Promise<ApprovedVendor> {
  if (!Number.isInteger(input.commissionBps) || input.commissionBps < 0 || input.commissionBps > 5000) {
    throw validation(`invalid commission in basis points: ${input.commissionBps}`);
  }
  return withApp(
    pool,
    { ...PLATFORM, userId: input.adminUserId, correlationId: input.correlationId ?? null },
    async (client) => {
      const found = await client.query<{
        id: string;
        applicant_user_id: string;
        legal_name: string;
        country: string;
        status: string;
      }>(
        `select id, applicant_user_id, legal_name, country, status
           from vendor_applications where id = $1 for update`,
        [input.applicationId],
      );
      const application = found.rows[0];
      if (application === undefined) throw notFound('vendor application not found');
      if (application.applicant_user_id === input.adminUserId) {
        throw forbidden('an applicant cannot approve its own vendor application');
      }
      if (application.status !== 'SUBMITTED') {
        throw conflict(`application is ${application.status} and cannot be approved`, {
          status: application.status,
        });
      }

      const slug = slugify(application.legal_name);
      const organization = await client.query<{ id: string; slug: string }>(
        `insert into organizations (kind, name, slug, country, default_currency, status)
         values ('VENDOR', $1, $2, $3, $4, 'ACTIVE')
         returning id, slug`,
        [
          application.legal_name,
          slug,
          application.country,
          (input.payoutCurrency ?? 'EUR').toUpperCase(),
        ],
      );
      const organizationRow = organization.rows[0];
      if (organizationRow === undefined) throw notFound('vendor organization was not created');

      await client.query(
        `insert into vendor_profiles
           (organization_id, legal_name, country, commission_bps, payout_currency, status, application_id, approved_by)
         values ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7)`,
        [
          organizationRow.id,
          application.legal_name,
          application.country,
          input.commissionBps,
          (input.payoutCurrency ?? 'EUR').toUpperCase(),
          application.id,
          input.adminUserId,
        ],
      );

      await client.query(
        `insert into memberships (user_id, organization_id, role, status)
         values ($1, $2, 'SELLER_OWNER', 'ACTIVE')
         on conflict (user_id, organization_id, role) do nothing`,
        [application.applicant_user_id, organizationRow.id],
      );

      await client.query(
        `update vendor_applications
            set status = 'APPROVED', decided_at = now(), decided_by = $2, resulting_organization_id = $3
          where id = $1`,
        [application.id, input.adminUserId, organizationRow.id],
      );

      await writeAudit(client, {
        actorUserId: input.adminUserId,
        actorRole: 'PLATFORM_ADMIN',
        organizationId: organizationRow.id,
        action: 'vendor_application.approved',
        entityType: 'vendor_application',
        entityId: application.id,
        correlationId: input.correlationId ?? null,
        payload: { organizationId: organizationRow.id, commissionBps: input.commissionBps },
      });
      await emitEvent(client, 'vendor.approved', {
        applicationId: application.id,
        organizationId: organizationRow.id,
        commissionBps: input.commissionBps,
      });

      return {
        organizationId: organizationRow.id,
        slug: organizationRow.slug,
        legalName: application.legal_name,
        commissionBps: input.commissionBps,
      };
    },
  );
}

export async function rejectVendorApplication(
  pool: DbPool,
  input: { adminUserId: string; applicationId: string; note: string; correlationId?: string | null },
): Promise<void> {
  const note = input.note.trim();
  if (note.length < 3) throw validation('a rejection note of at least 3 characters is required');
  await withApp(
    pool,
    { ...PLATFORM, userId: input.adminUserId, correlationId: input.correlationId ?? null },
    async (client) => {
      const found = await client.query<{ applicant_user_id: string; status: string }>(
        'select applicant_user_id, status from vendor_applications where id = $1 for update',
        [input.applicationId],
      );
      const application = found.rows[0];
      if (application === undefined) throw notFound('vendor application not found');
      if (application.applicant_user_id === input.adminUserId) {
        throw forbidden('an applicant cannot decide its own vendor application');
      }
      if (application.status !== 'SUBMITTED') {
        throw conflict(`application is ${application.status} and cannot be rejected`);
      }
      await client.query(
        `update vendor_applications
            set status = 'REJECTED', decided_at = now(), decided_by = $2, decision_note = $3
          where id = $1`,
        [input.applicationId, input.adminUserId, note],
      );
      await writeAudit(client, {
        actorUserId: input.adminUserId,
        actorRole: 'PLATFORM_ADMIN',
        action: 'vendor_application.rejected',
        entityType: 'vendor_application',
        entityId: input.applicationId,
        correlationId: input.correlationId ?? null,
        payload: { note },
      });
    },
  );
}

export interface VendorProfile {
  readonly organizationId: string;
  readonly legalName: string;
  readonly country: string;
  readonly commissionBps: number;
  readonly payoutCurrency: string;
  readonly status: string;
}

export async function getVendorProfile(
  pool: DbPool,
  input: { userId: string; organizationId: string },
): Promise<VendorProfile> {
  return withApp(pool, { userId: input.userId, orgId: input.organizationId }, async (client) => {
    const result = await client.query<{
      organization_id: string;
      legal_name: string;
      country: string;
      commission_bps: number;
      payout_currency: string;
      status: string;
    }>(
      `select organization_id, legal_name, country, commission_bps, payout_currency, status
         from vendor_profiles where organization_id = $1`,
      [input.organizationId],
    );
    const row = result.rows[0];
    if (row === undefined) throw notFound('vendor profile not found');
    return {
      organizationId: row.organization_id,
      legalName: row.legal_name,
      country: row.country,
      commissionBps: row.commission_bps,
      payoutCurrency: row.payout_currency,
      status: row.status,
    };
  });
}

export async function setCommission(
  pool: DbPool,
  input: { adminUserId: string; organizationId: string; commissionBps: number },
): Promise<void> {
  if (!Number.isInteger(input.commissionBps) || input.commissionBps < 0 || input.commissionBps > 5000) {
    throw validation(`invalid commission in basis points: ${input.commissionBps}`);
  }
  await withApp(pool, { ...PLATFORM, userId: input.adminUserId }, async (client) => {
    const updated = await client.query(
      `update vendor_profiles set commission_bps = $2, updated_at = now()
        where organization_id = $1`,
      [input.organizationId, input.commissionBps],
    );
    if (updated.rowCount === 0) throw notFound('vendor profile not found');
    await writeAudit(client, {
      actorUserId: input.adminUserId,
      actorRole: 'PLATFORM_ADMIN',
      organizationId: input.organizationId,
      action: 'vendor.commission_changed',
      entityType: 'vendor_profile',
      entityId: input.organizationId,
      payload: { commissionBps: input.commissionBps },
    });
  });
}