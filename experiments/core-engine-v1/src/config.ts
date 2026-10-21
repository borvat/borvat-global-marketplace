/**
 * Runtime configuration.
 *
 * Two database connections exist on purpose:
 *  - the administrative one owns the schema and runs migrations;
 *  - the application one is subject to row level security and serves every request.
 * The API never uses the administrative connection for business work.
 */

export interface Config {
  readonly adminDatabaseUrl: string;
  readonly appDatabaseUrl: string;
  readonly port: number;
  readonly host: string;
  readonly platformCountry: string;
  readonly platformCurrency: string;
  readonly defaultCommissionBps: number;
  readonly sessionTtlSeconds: number;
}

const LOCAL_ADMIN = 'postgres://postgres:postgres_dev_only@127.0.0.1:5432/borvat_dev';
const LOCAL_APP = 'postgres://borvat_app:borvat_app_dev_only@127.0.0.1:5432/borvat_dev';

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, received ${raw}`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    adminDatabaseUrl: process.env.ADMIN_DATABASE_URL ?? LOCAL_ADMIN,
    appDatabaseUrl: process.env.APP_DATABASE_URL ?? LOCAL_APP,
    port: readInt('PORT', 8080),
    host: process.env.API_HOST ?? '0.0.0.0',
    platformCountry: (process.env.PLATFORM_COUNTRY ?? 'NL').toUpperCase(),
    platformCurrency: (process.env.PLATFORM_CURRENCY ?? 'EUR').toUpperCase(),
    defaultCommissionBps: readInt('DEFAULT_COMMISSION_BPS', 1200),
    sessionTtlSeconds: readInt('SESSION_TTL_SECONDS', 604800),
  };
}