/**
 * Migration runner.
 *
 * Applied files are recorded with their content hash. If a file that was already
 * applied changes, the runner refuses to continue instead of silently drifting.
 * Migrations are applied inside a transaction each, and the runner serialises
 * concurrent attempts with an advisory lock.
 */

import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.ts';
import { createPool, type DbPool, type PoolClient } from './pool.ts';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
const LOCK_KEY = 918273645;

export interface MigrationReport {
  applied: string[];
  skipped: string[];
  reset: boolean;
}

async function ensureRegistry(pool: PoolClient): Promise<void> {
  await pool.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      content_hash text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function resetSchema(pool: PoolClient): Promise<void> {
  await pool.query('drop schema if exists public cascade');
  await pool.query('create schema public');
  await pool.query('grant usage, create on schema public to borvat_app');
}

export async function runMigrations(options: { reset?: boolean } = {}): Promise<MigrationReport> {
  const config = loadConfig();
  const pool = createPool(config.adminDatabaseUrl, 2);
  const applied: string[] = [];
  const skipped: string[] = [];
  try {
    const client = await pool.connect();
    try {
      if (options.reset === true) {
        await resetSchema(client);
      }
      await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
      await ensureRegistry(client);

      const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
      const existing = await client.query<{ filename: string; content_hash: string }>(
        'select filename, content_hash from schema_migrations',
      );
      const known = new Map(existing.rows.map((row) => [row.filename, row.content_hash]));

      for (const file of files) {
        const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
        const hash = createHash('sha256').update(sql, 'utf8').digest('hex');
        const previous = known.get(file);
        if (previous !== undefined) {
          if (previous !== hash) {
            throw new Error(
              `migration ${file} changed after it was applied (${previous.slice(0, 8)} -> ${hash.slice(0, 8)}). ` +
                'Add a new migration instead of editing history.',
            );
          }
          skipped.push(file);
          continue;
        }
        await client.query('begin');
        try {
          await client.query(sql);
          await client.query(
            'insert into schema_migrations (filename, content_hash) values ($1, $2)',
            [file, hash],
          );
          await client.query('commit');
          applied.push(file);
        } catch (error) {
          await client.query('rollback');
          throw new Error(`migration ${file} failed: ${(error as Error).message}`);
        }
      }
      await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
  return { applied, skipped, reset: options.reset === true };
}

async function main(): Promise<void> {
  const reset = process.argv.includes('--reset');
  const report = await runMigrations({ reset });
  if (report.reset) console.log('schema reset');
  for (const file of report.applied) console.log(`applied  ${file}`);
  for (const file of report.skipped) console.log(`current  ${file}`);
  console.log(`done: ${report.applied.length} applied, ${report.skipped.length} already current`);
}

const invokedDirectly = process.argv[1] !== undefined && process.argv[1].endsWith('migrate.ts');
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
