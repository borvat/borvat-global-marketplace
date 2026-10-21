/**
 * Identity: registration, login, sessions and role resolution.
 *
 * Authentication lookups run in platform mode because the server must find a user
 * before any tenant is known. Every other read in the system is tenant scoped.
 */

import { PLATFORM, withApp, type DbPool } from '../db/pool.ts';
import { writeAudit } from './audit.ts';
import { hashPassword, hashToken, newSessionToken, verifyPassword } from './crypto.ts';
import { conflict, notFound, unauthenticated, validation } from './errors.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const COUNTRY_RE = /^[A-Z]{2}$/;

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly country: string;
  readonly correlationId?: string | null;
}

export interface RegisteredUser {
  readonly userId: string;
  readonly email: string;
}

export interface RoleGrant {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly organizationKind: 'PLATFORM' | 'VENDOR';
  readonly role: string;
}

export interface SessionUser {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly country: string;
  readonly roles: RoleGrant[];
  readonly platformAdmin: boolean;
}

export interface LoginResult {
  readonly token: string;
  readonly expiresAt: string;
  readonly user: SessionUser;
}

function normaliseEmail(email: string): string {
  const value = email.trim().toLowerCase();
  if (!EMAIL_RE.test(value)) throw validation(`invalid email address: ${email}`);
  return value;
}

function normaliseCountry(country: string): string {
  const value = country.trim().toUpperCase();
  if (!COUNTRY_RE.test(value)) throw validation(`invalid country code: ${country}`);
  return value;
}

export async function registerUser(pool: DbPool, input: RegisterInput): Promise<RegisteredUser> {
  const email = normaliseEmail(input.email);
  const displayName = input.displayName.trim();
  if (displayName.length < 1 || displayName.length > 120) {
    throw validation('display name must be between 1 and 120 characters');
  }
  const country = normaliseCountry(input.country);
  const passwordHash = await hashPassword(input.password);

  return withApp(pool, { ...PLATFORM, correlationId: input.correlationId ?? null }, async (client) => {
    const inserted = await client.query<{ id: string }>(
      `insert into users (email, password_hash, display_name, country)
       values ($1, $2, $3, $4)
       on conflict (email) do nothing
       returning id`,
      [email, passwordHash, displayName, country],
    );
    const row = inserted.rows[0];
    if (row === undefined) throw conflict('an account with this email already exists', { email });
    await writeAudit(client, {
      actorUserId: row.id,
      action: 'user.registered',
      entityType: 'user',
      entityId: row.id,
      correlationId: input.correlationId ?? null,
      payload: { email, country },
    });
    return { userId: row.id, email };
  });
}

export async function login(
  pool: DbPool,
  input: { email: string; password: string; ttlSeconds: number; correlationId?: string | null },
): Promise<LoginResult> {
  const email = normaliseEmail(input.email);
  return withApp(pool, { ...PLATFORM, correlationId: input.correlationId ?? null }, async (client) => {
    const found = await client.query<{
      id: string;
      password_hash: string;
      display_name: string;
      country: string;
      status: string;
    }>('select id, password_hash, display_name, country, status from users where email = $1', [email]);
    const user = found.rows[0];
    if (user === undefined) throw unauthenticated('invalid email or password');
    if (user.status !== 'ACTIVE') throw unauthenticated('account is not active');
    const ok = await verifyPassword(input.password, user.password_hash);
    if (!ok) throw unauthenticated('invalid email or password');

    const token = newSessionToken();
    const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);
    await client.query(
      `insert into sessions (user_id, token_hash, expires_at) values ($1, $2, $3)`,
      [user.id, hashToken(token), expiresAt.toISOString()],
    );
    await client.query('update users set last_login_at = now() where id = $1', [user.id]);
    await writeAudit(client, {
      actorUserId: user.id,
      action: 'user.logged_in',
      entityType: 'user',
      entityId: user.id,
      correlationId: input.correlationId ?? null,
    });

    const roles = await loadRoles(client, user.id);
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      user: {
        userId: user.id,
        email,
        displayName: user.display_name,
        country: user.country,
        roles,
        platformAdmin: roles.some((role) => role.role === 'PLATFORM_ADMIN'),
      },
    };
  });
}

async function loadRoles(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  userId: string,
): Promise<RoleGrant[]> {
  const result = await client.query(
    `select m.organization_id, m.role, o.name as organization_name, o.kind as organization_kind
       from memberships m
       join organizations o on o.id = m.organization_id
      where m.user_id = $1 and m.status = 'ACTIVE'
      order by o.name, m.role`,
    [userId],
  );
  return (result.rows as Array<{
    organization_id: string;
    role: string;
    organization_name: string;
    organization_kind: 'PLATFORM' | 'VENDOR';
  }>).map((row) => ({
    organizationId: row.organization_id,
    role: row.role,
    organizationName: row.organization_name,
    organizationKind: row.organization_kind,
  }));
}

export async function authenticate(pool: DbPool, token: string): Promise<SessionUser> {
  if (typeof token !== 'string' || token.length < 20) throw unauthenticated();
  const tokenHash = hashToken(token);
  return withApp(pool, PLATFORM, async (client) => {
    const found = await client.query<{
      session_id: string;
      user_id: string;
      email: string;
      display_name: string;
      country: string;
      status: string;
    }>(
      `select s.id as session_id, u.id as user_id, u.email, u.display_name, u.country, u.status
         from sessions s
         join users u on u.id = s.user_id
        where s.token_hash = $1
          and s.revoked_at is null
          and s.expires_at > now()`,
      [tokenHash],
    );
    const row = found.rows[0];
    if (row === undefined) throw unauthenticated('session is invalid or expired');
    if (row.status !== 'ACTIVE') throw unauthenticated('account is not active');
    const roles = await loadRoles(client, row.user_id);
    return {
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      country: row.country,
      roles,
      platformAdmin: roles.some((role) => role.role === 'PLATFORM_ADMIN'),
    };
  });
}

export async function revokeSession(pool: DbPool, token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await withApp(pool, PLATFORM, async (client) => {
    await client.query(
      'update sessions set revoked_at = now() where token_hash = $1 and revoked_at is null',
      [tokenHash],
    );
  });
}

/** Creates the platform organization and grants a user the platform administrator role. */
export async function bootstrapPlatformAdmin(
  pool: DbPool,
  input: { userId: string; organizationName?: string; country?: string; currency?: string },
): Promise<{ organizationId: string }> {
  const country = normaliseCountry(input.country ?? 'NL');
  const currency = (input.currency ?? 'EUR').toUpperCase();
  return withApp(pool, PLATFORM, async (client) => {
    const existing = await client.query<{ id: string }>(
      "select id from organizations where kind = 'PLATFORM' order by created_at limit 1",
    );
    let organizationId = existing.rows[0]?.id;
    if (organizationId === undefined) {
      const created = await client.query<{ id: string }>(
        `insert into organizations (kind, name, slug, country, default_currency, status)
         values ('PLATFORM', $1, 'borvat-platform', $2, $3, 'ACTIVE')
         returning id`,
        [input.organizationName ?? 'BORVAT Platform', country, currency],
      );
      organizationId = created.rows[0]?.id;
    }
    if (organizationId === undefined) throw notFound('platform organization could not be created');
    await client.query(
      `insert into memberships (user_id, organization_id, role, status)
       values ($1, $2, 'PLATFORM_ADMIN', 'ACTIVE')
       on conflict (user_id, organization_id, role) do nothing`,
      [input.userId, organizationId],
    );
    await writeAudit(client, {
      actorUserId: input.userId,
      actorRole: 'PLATFORM_ADMIN',
      organizationId,
      action: 'platform.admin_granted',
      entityType: 'membership',
      entityId: input.userId,
    });
    return { organizationId };
  });
}