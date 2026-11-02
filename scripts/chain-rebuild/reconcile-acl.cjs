// Reconciles the granted EXECUTE surface with the repo's ACL allowlist in BOTH
// directions. The shipped gate only checked "granted but unlisted", which made it
// blind for allowlist entries that hold no grant at all.
//
//   granted but unlisted   -> excess grant (violation)
//   listed but not granted -> stale approval, and a future re-grant of it would
//                             pass the gate silently (violation of a different kind)
//   role mismatch          -> a role holds EXECUTE that the entry does not approve
//
// Usage:
//   PG_MODULE=/abs/pg PGPORT=5434 node scripts/chain-rebuild/reconcile-acl.cjs out.json
const fs = require('node:fs');

const pg = process.env.PG_MODULE || 'pg';
const { Client } = require(pg);
const OUT = process.argv[2] || 'acl-reconcile.json';
const ALLOWLIST = 'apps/marketplace/scripts/phase5-acl-gate/approved-routines.json';
const ROLES = ['anon', 'authenticated', 'service_role'];

(async () => {
  const c = new Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    database: process.env.PGDATABASE || 'postgres',
  });
  await c.connect();

  const rows = (await c.query(`
    SELECT p.oid::regprocedure::text AS sig,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
           has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role,
           has_function_privilege('sandbox_exec', p.oid, 'EXECUTE') AS sandbox_exec
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' ORDER BY 1`)).rows.map((r) => ({ ...r, sig: r.sig.replace(/^public\./, '') }));

  const granted = rows.filter((r) => r.anon || r.authenticated || r.service_role || r.sandbox_exec);
  const allow = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8'));
  const map = new Map(allow.routines.map((x) => [x.signature, x.roles || []]));

  const grantedNotListed = [];
  const roleMismatch = [];
  for (const g of granted) {
    const roles = map.get(g.sig);
    if (!roles) { grantedNotListed.push(g.sig); continue; }
    for (const r of ROLES) if (g[r] && !roles.includes(r)) roleMismatch.push(`${r}:${g.sig}`);
    if (g.sandbox_exec) roleMismatch.push(`sandbox_exec:${g.sig}`);
  }
  const listedNotGranted = allow.routines
    .filter((x) => {
      const cur = rows.find((r) => r.sig === x.signature);
      return !cur || !(cur.anon || cur.authenticated || cur.service_role || cur.sandbox_exec);
    })
    .map((x) => x.signature);

  const report = {
    ranAt: new Date().toISOString(),
    publicRoutines: rows.length,
    grantedRoutines: granted.length,
    allowlistEntries: allow.routines.length,
    grantedNotListed,
    roleMismatch,
    listedNotGranted,
    clean: grantedNotListed.length === 0 && roleMismatch.length === 0 && listedNotGranted.length === 0,
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

  console.log(`public routines ${report.publicRoutines} | granted ${report.grantedRoutines} | allowlist ${report.allowlistEntries}`);
  console.log(`granted-but-unlisted: ${grantedNotListed.length}`);
  grantedNotListed.slice(0, 10).forEach((s) => console.log('  + ' + s));
  console.log(`role mismatch: ${roleMismatch.length}`);
  roleMismatch.slice(0, 10).forEach((s) => console.log('  ! ' + s));
  console.log(`listed-but-not-granted: ${listedNotGranted.length}`);
  listedNotGranted.slice(0, 10).forEach((s) => console.log('  - ' + s));
  console.log(report.clean ? 'CLEAN' : 'DRIFT PRESENT');

  await c.end();
  process.exit(report.clean ? 0 : 3);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
