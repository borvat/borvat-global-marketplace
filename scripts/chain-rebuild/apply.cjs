// Applies the real BORVAT migration chain, in filename order, to a CLEAN PostgreSQL database.
// One multi-statement query per file (implicit per-file transaction, like the Supabase CLI):
// a file that errors rolls back completely and is recorded as a failure — never edited, never skipped.
//
// Usage:
//   PGHOST=127.0.0.1 PGPORT=5434 PGUSER=postgres PGDATABASE=postgres PG_MODULE=/abs/path/to/pg \
//     node scripts/chain-rebuild/apply.cjs <migrations-dir> <result.json> [--reset]
const fs = require('node:fs');
const path = require('node:path');

const pg = process.env.PG_MODULE || 'pg';
const { Client } = require(pg);

const DIR = process.argv[2] || 'apps/marketplace/supabase/migrations';
const OUT = process.argv[3] || 'chain-apply-result.json';
const RESET = process.argv.includes('--reset');

(async () => {
  const client = new Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    database: process.env.PGDATABASE || 'postgres',
    connectionTimeoutMillis: 8000,
    statement_timeout: 180000,
  });
  await client.connect();

  if (RESET) {
    for (const schema of ['public', 'auth', 'storage', 'extensions', 'supabase_migrations']) {
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
    await client.query('CREATE SCHEMA public');
    await client.query(fs.readFileSync(path.join(__dirname, 'bootstrap.sql'), 'utf8'));
    console.log('RESET + platform bootstrap applied (roles, auth/storage shims only)');
  }

  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  console.log(`CHAIN: ${files.length} migration files`);

  let ok = 0;
  const failures = [];
  for (const file of files) {
    try {
      await client.query(fs.readFileSync(path.join(DIR, file), 'utf8'));
      ok += 1;
    } catch (e) {
      failures.push({
        file,
        code: e.code || null,
        message: String(e.message).replace(/\s+/g, ' ').slice(0, 300),
      });
      console.log(`FAIL ${file} :: ${e.code || ''} ${String(e.message).replace(/\s+/g, ' ').slice(0, 160)}`);
    }
  }

  const summary = { ranAt: new Date().toISOString(), total: files.length, ok, failed: failures.length, failures };
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(`RESULT ok=${ok} failed=${failures.length} total=${files.length}`);

  const inv = await client.query(
    `SELECT to_regclass('public.inventory_lots') AS lots,
            to_regclass('public.inventory_serials') AS serials,
            to_regprocedure('public.place_order(uuid,integer,jsonb)') AS place_order`);
  console.log('ENDPOINT', JSON.stringify(inv.rows[0]));

  await client.end();
  process.exit(failures.length === 0 ? 0 : 2);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
