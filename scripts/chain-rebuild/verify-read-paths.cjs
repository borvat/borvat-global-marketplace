// Verifies the RLS read paths after 20261102 restore_rls_helper_execute, on the
// disposable chain-rebuild database. Seeds its own synthetic fixtures (two
// tenants, members and non-members) — never a production database.
//
// Assertions:
//   R1 member of A reads only A's inventory lots (no error, exact count)
//   R2 member of B reads only B's inventory lots
//   R3 cross-tenant isolation: A never sees B rows on lots/serials
//   R4 balances follow the permission path (viewer with inventory.read)
//   R5 non-member gets an empty set, not a 42501 error
//   R6 impersonation guard intact: authenticated cannot ask about another user
//   R7 unauthorised writes denied: INSERT on lots, UPDATE on serials (42501)
//   R8 legacy place_order still closed to every client role
//   R9 granted surface conforms to approved-routines.json (BOR-DEC-142)
const fs = require('node:fs');
const path = require('node:path');

const pg = process.env.PG_MODULE || 'pg';
const { Client } = require(pg);
const OUT = process.argv[2] || 'chain-read-paths-result.json';
const ALLOWLIST = 'apps/marketplace/scripts/phase5-acl-gate/approved-routines.json';

const ID = {
  uA: '00000000-0000-4000-8000-0000000000a1',
  uB: '00000000-0000-4000-8000-0000000000a2',
  uC: '00000000-0000-4000-8000-0000000000a3',
  uD: '00000000-0000-4000-8000-0000000000a4',
  cA: '00000000-0000-4000-8000-0000000000c1',
  cB: '00000000-0000-4000-8000-0000000000c2',
  skuA: '00000000-0000-4000-8000-0000000000d1',
  skuB: '00000000-0000-4000-8000-0000000000d2',
  whA: '00000000-0000-4000-8000-0000000000e1',
  whB: '00000000-0000-4000-8000-0000000000e2',
};

const results = [];
const rec = (id, name, pass, detail) => {
  results.push({ id, name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name} :: ${detail}`);
};

(async () => {
  const c = new Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    database: process.env.PGDATABASE || 'postgres',
    connectionTimeoutMillis: 8000,
    statement_timeout: 60000,
  });
  await c.connect();

  // ---------- fixtures (synthetic, disposable) ----------
  const users = [ID.uA, ID.uB, ID.uC, ID.uD];
  await c.query(`DELETE FROM public.inventory_balances WHERE company_id IN ($1,$2)`, [ID.cA, ID.cB]);
  await c.query(`DELETE FROM public.inventory_lots WHERE company_id IN ($1,$2)`, [ID.cA, ID.cB]);
  await c.query(`DELETE FROM public.inventory_serials WHERE company_id IN ($1,$2)`, [ID.cA, ID.cB]);
  await c.query(`DELETE FROM public.catalog_skus WHERE id IN ($1,$2)`, [ID.skuA, ID.skuB]);
  await c.query(`DELETE FROM public.warehouses WHERE id IN ($1,$2)`, [ID.whA, ID.whB]);
  // company_members is removed by the companies cascade; a direct DELETE trips
  // the owner-membership guard trigger.
  await c.query(`DELETE FROM public.companies WHERE id IN ($1,$2)`, [ID.cA, ID.cB]);
  await c.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [users]);

  for (const u of users) {
    await c.query(
      `INSERT INTO auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data)
       VALUES ($1, $2, 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb)`,
      [u, `fixture-${u.slice(-2)}@chain-rebuild.invalid`]);
  }
  await c.query(`INSERT INTO public.companies (id, name, slug, owner_user_id) VALUES
      ($1,'Chain A Ltd','chain-a',$2), ($3,'Chain B Ltd','chain-b',$4)`,
    [ID.cA, ID.uA, ID.cB, ID.uB]);

  const ownerRole = (await c.query(`SELECT id FROM public.system_company_roles WHERE key='owner'`)).rows[0].id;
  const viewerRole = (await c.query(`SELECT id FROM public.system_company_roles WHERE key='viewer'`)).rows[0].id;

  const memberRows = [
    [ID.cA, ID.uA, ownerRole], [ID.cA, ID.uC, viewerRole], [ID.cB, ID.uB, ownerRole],
  ];
  for (const [company, user, role] of memberRows) {
    // companies insert already bootstraps an owner membership via trigger,
    // so this is upsert-then-link rather than a blind insert.
    await c.query(
      `INSERT INTO public.company_members (company_id, user_id, status) VALUES ($1,$2,'active')
       ON CONFLICT (company_id, user_id) DO UPDATE SET status = 'active'`,
      [company, user]);
    const m = await c.query(
      `SELECT id FROM public.company_members WHERE company_id=$1 AND user_id=$2`, [company, user]);
    await c.query(
      `INSERT INTO public.company_member_roles (member_id, role_id) VALUES ($1,$2)
       ON CONFLICT (member_id, role_id) DO NOTHING`,
      [m.rows[0].id, role]);
  }

  await c.query(`INSERT INTO public.catalog_skus (id, company_id, code) VALUES ($1,$2,'SKU-A'), ($3,$4,'SKU-B')`,
    [ID.skuA, ID.cA, ID.skuB, ID.cB]);
  await c.query(`INSERT INTO public.warehouses (id, company_id, code, name, requires_location, status)
      VALUES ($1,$2,'WH-A','Chain A WH',false,'active'), ($3,$4,'WH-B','Chain B WH',false,'active')`,
    [ID.whA, ID.cA, ID.whB, ID.cB]);

  await c.query(`INSERT INTO public.inventory_lots (company_id, sku_id, code) VALUES
      ($1,$2,'LOT-A1'), ($1,$2,'LOT-A2'), ($3,$4,'LOT-B1')`, [ID.cA, ID.skuA, ID.cB, ID.skuB]);
  await c.query(`INSERT INTO public.inventory_serials (company_id, sku_id, code) VALUES
      ($1,$2,'SER-A1'), ($3,$4,'SER-B1')`, [ID.cA, ID.skuA, ID.cB, ID.skuB]);
  await c.query(`INSERT INTO public.inventory_balances (company_id, sku_id, warehouse_id, disposition, quantity)
      VALUES ($1,$2,$3,'sellable',5), ($4,$5,$6,'sellable',7)`,
    [ID.cA, ID.skuA, ID.whA, ID.cB, ID.skuB, ID.whB]);

  // ---------- helper: run a statement as an authenticated user ----------
  const asUser = async (userId, sql) => {
    await c.query('BEGIN');
    try {
      await c.query(`SET LOCAL request.jwt.claim.sub = '${userId}'`);
      await c.query(`SET LOCAL request.jwt.claim.role = 'authenticated'`);
      await c.query('SET LOCAL ROLE authenticated');
      const r = await c.query(sql);
      return { ok: true, rows: r.rows, rowCount: r.rowCount };
    } catch (e) {
      return { ok: false, code: e.code, message: e.message };
    } finally {
      await c.query('ROLLBACK').catch(() => {});
    }
  };

  const countAs = (userId, sql) => asUser(userId, sql);

  // R1
  let r = await countAs(ID.uA, `SELECT count(*)::int AS n FROM public.inventory_lots`);
  rec('R1', 'member of A reads its own lots', r.ok && r.rows[0].n === 2,
    r.ok ? `rows=${r.rows[0].n}` : `${r.code} ${r.message}`);

  // R2
  r = await countAs(ID.uB, `SELECT count(*)::int AS n FROM public.inventory_lots`);
  rec('R2', 'member of B reads its own lots', r.ok && r.rows[0].n === 1,
    r.ok ? `rows=${r.rows[0].n}` : `${r.code} ${r.message}`);

  // R3 cross-tenant isolation
  const r3a = await countAs(ID.uA, `SELECT count(*)::int AS n FROM public.inventory_lots WHERE company_id='${ID.cB}'`);
  const r3b = await countAs(ID.uA, `SELECT count(*)::int AS n FROM public.inventory_serials WHERE company_id='${ID.cB}'`);
  const r3c = await countAs(ID.uB, `SELECT count(*)::int AS n FROM public.inventory_lots WHERE company_id='${ID.cA}'`);
  rec('R3', 'cross-tenant isolation on lots and serials',
    r3a.ok && r3b.ok && r3c.ok && r3a.rows[0].n === 0 && r3b.rows[0].n === 0 && r3c.rows[0].n === 0,
    `A->B lots=${r3a.rows?.[0]?.n} serials=${r3b.rows?.[0]?.n} B->A lots=${r3c.rows?.[0]?.n}`);

  // R4 balances via permission path
  const r4a = await countAs(ID.uC, `SELECT count(*)::int AS n FROM public.inventory_balances`);
  const r4b = await countAs(ID.uC, `SELECT count(*)::int AS n FROM public.inventory_balances WHERE company_id='${ID.cB}'`);
  rec('R4', 'balances follow inventory.read permission and stay tenant-scoped',
    r4a.ok && r4b.ok && r4a.rows[0].n === 1 && r4b.rows[0].n === 0,
    r4a.ok ? `viewerA sees=${r4a.rows[0].n} seesB=${r4b.rows[0].n}` : `${r4a.code} ${r4a.message}`);

  // R5 non-member: empty, not error
  const r5 = await countAs(ID.uD, `SELECT count(*)::int AS n FROM public.inventory_lots`);
  rec('R5', 'non-member gets an empty set instead of a permission error',
    r5.ok && r5.rows[0].n === 0, r5.ok ? `rows=${r5.rows[0].n}` : `${r5.code} ${r5.message}`);

  // R6 impersonation guard
  const r6 = await asUser(ID.uA, `SELECT public.is_company_member('${ID.cB}','${ID.uB}') AS x`);
  rec('R6', 'helper rejects asking about another user (42501)', !r6.ok && r6.code === '42501',
    r6.ok ? `returned ${JSON.stringify(r6.rows)}` : `${r6.code} ${r6.message}`);

  // R7 unauthorised writes
  const w1 = await asUser(ID.uA, `INSERT INTO public.inventory_lots (company_id, sku_id, code) VALUES ('${ID.cA}','${ID.skuA}','LOT-X')`);
  const w2 = await asUser(ID.uA, `UPDATE public.inventory_serials SET code = code WHERE company_id='${ID.cA}'`);
  rec('R7', 'unauthorised writes denied even for a member (42501)',
    !w1.ok && !w2.ok && w1.code === '42501' && w2.code === '42501',
    `insert=${w1.code} update=${w2.code}`);

  // R8 place_order invariant
  const canExec = async (role, sig) =>
    (await c.query(`SELECT has_function_privilege('${role}','${sig}','EXECUTE') AS x`)).rows[0].x;
  const place = 'public.place_order(uuid,integer,jsonb)';
  const placeState = {};
  for (const role of ['anon', 'authenticated', 'service_role', 'sandbox_exec']) placeState[role] = await canExec(role, place);
  rec('R8', 'legacy place_order still closed', Object.values(placeState).every((x) => x === false), JSON.stringify(placeState));

  // R9 allowlist conformance. Two drifts already exist in the chain before this
  // fix (20260727192557 grants m1v1da_require_reviewer to authenticated,
  // 20260731235603 grants grant_seller_role_from_approved_application). They are
  // recorded here as pre-existing and out of this mandate's scope; the assertion
  // therefore fails only on a NEW unapproved grant, which is what the fix controls.
  const PRE_EXISTING = [
    'authenticated:m1v1da_require_reviewer()',
    'authenticated:grant_seller_role_from_approved_application()',
  ];
  if (fs.existsSync(ALLOWLIST)) {
    const list = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8'));
    const approved = new Map(list.routines.map((x) => [x.signature, x.roles || []]));
    const current = await c.query(`
      SELECT p.oid::regprocedure::text AS sig,
             has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public'`);
    const violations = [];
    for (const row of current.rows) {
      const sig = row.sig.replace(/^public\./, '');
      const roles = approved.get(sig) || [];
      if (row.anon && !roles.includes('anon')) violations.push(`anon:${sig}`);
      if (row.authed && !roles.includes('authenticated')) violations.push(`authenticated:${sig}`);
    }
    const fresh = violations.filter((v) => !PRE_EXISTING.includes(v));
    const drift = violations.filter((v) => PRE_EXISTING.includes(v));
    rec('R9', 'the fix introduces no unapproved EXECUTE grant',
      fresh.length === 0,
      `new=${fresh.length ? fresh.join(', ') : 'none'} | pre-existing drift kept out of scope=${drift.length}${drift.length ? ' (' + drift.join(', ') + ')' : ''}`);
  } else {
    rec('R9', 'the fix introduces no unapproved EXECUTE grant', false, 'allowlist not found at ' + ALLOWLIST);
  }

  // ---------- cleanup fixtures ----------
  await c.query(`DELETE FROM public.inventory_balances WHERE company_id IN ($1,$2)`, [ID.cA, ID.cB]);
  await c.query(`DELETE FROM public.inventory_lots WHERE company_id IN ($1,$2)`, [ID.cA, ID.cB]);
  await c.query(`DELETE FROM public.inventory_serials WHERE company_id IN ($1,$2)`, [ID.cA, ID.cB]);
  await c.query(`DELETE FROM public.catalog_skus WHERE id IN ($1,$2)`, [ID.skuA, ID.skuB]);
  await c.query(`DELETE FROM public.warehouses WHERE id IN ($1,$2)`, [ID.whA, ID.whB]);
  // company_members is removed by the companies cascade; a direct DELETE trips
  // the owner-membership guard trigger.
  await c.query(`DELETE FROM public.companies WHERE id IN ($1,$2)`, [ID.cA, ID.cB]);
  await c.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [users]);

  const passed = results.filter((x) => x.pass).length;
  console.log(`\nSUMMARY ${passed}/${results.length}`);
  fs.writeFileSync(OUT, JSON.stringify({
    ranAt: new Date().toISOString(),
    server: (await c.query('SELECT version()')).rows[0].version.split(' on ')[0],
    summary: `${passed}/${results.length}`,
    fixtures: 'synthetic two-tenant set, created and removed by this script',
    results,
  }, null, 2));
  await c.end();
  process.exit(passed === results.length ? 0 : 3);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
