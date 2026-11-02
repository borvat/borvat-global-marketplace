// Canonical schema + privilege fingerprint of a built database, and a structural
// diff between two of them. Used to prove that the harness split changes no schema
// object and no approved privilege.
//
//   PG_MODULE=... PGPORT=5434 node schema-fingerprint.cjs dump <db> <out.json>
//   PG_MODULE=... node schema-fingerprint.cjs diff <a.json> <b.json>
const fs = require('node:fs');
const crypto = require('node:crypto');
const pg = process.env.PG_MODULE || 'pg';
const { Client } = require(pg);

const mode = process.argv[2];

const canon = (v) => JSON.stringify(v).replace(/\r\n/g, '\n');

async function dump(dbName, out) {
  const c = new Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    database: dbName,
  });
  await c.connect();
  const q = async (sql) => (await c.query(sql)).rows;

  const data = {
    schemas: (await q(`SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema' ORDER BY 1`)).map((r) => r.nspname),
    tables: await q(`SELECT table_schema||'.'||table_name AS rel, column_name, data_type, is_nullable,
                            coalesce(column_default,'') AS def
                     FROM information_schema.columns
                     WHERE table_schema NOT IN ('pg_catalog','information_schema')
                     ORDER BY 1, column_name`),
    indexes: await q(`SELECT schemaname||'.'||indexname AS name, regexp_replace(indexdef,'\\s+',' ','g') AS def
                      FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1`),
    constraints: await q(`SELECT conrelid::regclass::text AS rel, conname, pg_get_constraintdef(oid) AS def
                          FROM pg_constraint WHERE connamespace IN (SELECT oid FROM pg_namespace WHERE nspname='public')
                          ORDER BY 1,2`),
    functions: await q(`SELECT p.oid::regprocedure::text AS sig, p.prosecdef AS secdef,
                               coalesce(p.proconfig::text,'') AS cfg, r.rolname AS owner,
                               coalesce(p.proacl::text,'') AS acl
                        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                        JOIN pg_roles r ON r.oid=p.proowner
                        WHERE n.nspname='public' ORDER BY 1`),
    policies: await q(`SELECT schemaname||'.'||tablename||'.'||policyname AS name, cmd, roles::text AS roles,
                              coalesce(qual,'') AS qual, coalesce(with_check,'') AS with_check
                       FROM pg_policies WHERE schemaname='public' ORDER BY 1`),
    tableAcls: await q(`SELECT c.oid::regclass::text AS rel, coalesce(c.relacl::text,'') AS acl
                        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                        WHERE n.nspname='public' AND c.relkind='r' ORDER BY 1`),
    triggers: await q(`SELECT tgrelid::regclass::text AS rel, tgname, tgenabled
                       FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1,2`),
  };

  const sections = {};
  for (const [k, v] of Object.entries(data)) {
    sections[k] = { count: v.length, hash: crypto.createHash('sha256').update(canon(v)).digest('hex').slice(0, 16) };
  }
  const overall = crypto.createHash('sha256').update(canon(sections)).digest('hex').slice(0, 16);
  const report = { database: dbName, ranAt: new Date().toISOString(), overall, sections, data };
  fs.writeFileSync(out, JSON.stringify(report, null, 1));
  console.log(`${dbName}: overall=${overall}`);
  for (const [k, v] of Object.entries(sections)) console.log(`  ${k.padEnd(12)} ${String(v.count).padStart(5)}  ${v.hash}`);
  await c.end();
  return report;
}

function diff(aPath, bPath) {
  const a = JSON.parse(fs.readFileSync(aPath, 'utf8'));
  const b = JSON.parse(fs.readFileSync(bPath, 'utf8'));
  console.log(`A=${a.database} overall=${a.overall}`);
  console.log(`B=${b.database} overall=${b.overall}`);
  let total = 0;
  const keyOf = {
    tables: (r) => `${r.rel}.${r.column_name}`,
    indexes: (r) => r.name,
    constraints: (r) => `${r.rel}.${r.conname}`,
    functions: (r) => r.sig,
    policies: (r) => r.name,
    tableAcls: (r) => r.rel,
    triggers: (r) => `${r.rel}.${r.tgname}`,
    schemas: (r) => (typeof r === 'string' ? r : r),
  };
  for (const section of Object.keys(a.sections)) {
    const kf = keyOf[section] || ((r) => JSON.stringify(r));
    const ma = new Map(a.data[section].map((r) => [kf(r), canon(r)]));
    const mb = new Map(b.data[section].map((r) => [kf(r), canon(r)]));
    const onlyA = [...ma.keys()].filter((k) => !mb.has(k));
    const onlyB = [...mb.keys()].filter((k) => !ma.has(k));
    const changed = [...ma.keys()].filter((k) => mb.has(k) && ma.get(k) !== mb.get(k));
    if (onlyA.length || onlyB.length || changed.length) {
      console.log(`\n[${section}] onlyA=${onlyA.length} onlyB=${onlyB.length} changed=${changed.length}`);
      onlyA.slice(0, 8).forEach((k) => console.log('  - only in A: ' + k));
      onlyB.slice(0, 8).forEach((k) => console.log('  + only in B: ' + k));
      changed.slice(0, 8).forEach((k) => console.log('  ~ changed: ' + k));
      total += onlyA.length + onlyB.length + changed.length;
    }
  }
  console.log(`\nTOTAL DIFFERENCES: ${total}`);
  process.exit(total === 0 ? 0 : 3);
}

(async () => {
  if (mode === 'dump') await dump(process.argv[3], process.argv[4]);
  else if (mode === 'diff') diff(process.argv[3], process.argv[4]);
  else { console.error('usage: dump <db> <out.json> | diff <a.json> <b.json>'); process.exit(2); }
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
