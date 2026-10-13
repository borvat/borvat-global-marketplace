/**
 * Database access layer.
 *
 * `withApp` opens a transaction, installs the tenant context into PostgreSQL
 * session variables, and only then runs the caller's work. Row level security
 * policies read those variables, so an unscoped query cannot silently leak
 * another tenant's rows: it returns nothing.
 */

import pg from 'pg';

const { Pool } = pg;

export type PoolClient = pg.PoolClient;
export type DbPool = pg.Pool;

export interface AppContext {
  readonly userId?: string | null;
  readonly orgId?: string | null;
  readonly platform?: boolean;
  readonly publicRead?: boolean;
  readonly curator?: boolean;
  readonly guestToken?: string | null;
  readonly correlationId?: string | null;
}

export function createPool(connectionString: string, max = 10): DbPool {
  const pool = new Pool({ connectionString, max, application_name: 'borvat-marketplace' });
  pool.on('error', (error) => {
    console.error('[db] idle client error', error.message);
  });
  return pool;
}

export async function applyContext(client: PoolClient, context: AppContext): Promise<void> {
  await client.query(
    `select set_config('borvat.user_id', $1, true),
            set_config('borvat.org', $2, true),
            set_config('borvat.platform', $3, true),
            set_config('borvat.public_read', $4, true),
            set_config('borvat.curator', $5, true),
            set_config('borvat.guest_token', $6, true)`,
    [
      context.userId ?? '',
      context.orgId ?? '',
      context.platform === true ? 'on' : 'off',
      context.publicRead === true ? 'on' : 'off',
      context.curator === true ? 'on' : 'off',
      context.guestToken ?? '',
    ],
  );
}

export async function withApp<T>(
  pool: DbPool,
  context: AppContext,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await applyContext(client, context);
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      /* connection already broken */
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function withAdmin<T>(
  pool: DbPool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      /* connection already broken */
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Platform-level operation: trusted server paths only (checkout, approvals, auth lookup). */
export const PLATFORM: AppContext = { platform: true };