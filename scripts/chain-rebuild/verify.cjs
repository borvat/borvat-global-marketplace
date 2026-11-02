// Dynamic privilege verification against the database built by apply.cjs.
// Every assertion is a real query against the real chain, not a replication of GRANT text.
//
// Usage:
//   PGPORT=5434 PG_MODULE=/abs/path/to/pg node scripts/chain-rebuild/verify.cjs <out.json>
const fs = require('node:fs');

const pg = process.env.PG_MODULE || 'pg';
const { Client } = require(pg);

const OUT = process.argv[2] || 'chain-verify-result.json';
const ROLLBACK = 'apps/marketplace/supabase/scripts/rollback_inventory_single_writer.sql';
const PHASE_A = 'apps/marketplace/supabase/migrations/20261101000000_f717f71d-a873-4606-b945-cce194812e04_revoke_inventory_write_permissions.sql';

const FNS = {
  create_res: 'public.create_reservation(uuid,text,uuid,jsonb)',
  pick: 'public.pick_reservation_allocation(uuid,integer,uuid,uuid,uuid)',
  release: 'public.release_reservation(uuid,jsonb,boolean)',
  cancel: 'public.cancel_reservation(uuid)',
  post: 'public.post_inventory_transaction(uuid,text,jsonb,text,uuid,text,jsonb,uuid)',
  reserve_bol: 'public.reserve_bol_order_line(uuid)',
  cancel_bol: 'public.cancel_bol_order_line(uuid,text)',
  place: 'public.place_order(uuid,integer,jsonb)',
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

  const canExec = async (role, sig) => {
    const r = await c.query(
      `SELECT CASE WHEN to_regprocedure('${sig}') IS NULL THEN NULL
                   ELSE has_function_privilege('${role}', '${sig}', 'EXECUTE') END AS x`);
    return r.rows[0].x;
  };

  rec('A1', 'create_reservation revoked from authenticated', (await canExec('authenticated', FNS.create_res)) === false, 'has_function_privilege=false');
  rec('A2', 'reserve_bol_order_line revoked from service_role', (await canExec('service_role', FNS.reserve_bol)) === false, 'has_function_privilege=false');
  rec('A3', 'post_inventory_transaction denied to authenticated (owner-only)', (await canExec('authenticated', FNS.post)) === false, 'has_function_privilege=false');
  rec('A4', 'cancel_reservation revoked from authenticated', (await canExec('authenticated', FNS.cancel)) === false, 'has_function_privilege=false');

  const clientRoles = ['anon', 'authenticated', 'service_role', 'sandbox_exec'];
  const placeState = {};
  for (const r of clientRoles) placeState[r] = await canExec(r, FNS.place);
  const pub = (await c.query(`SELECT has_function_privilege('public','${FNS.place}','EXECUTE') AS x`)).rows[0].x;
  rec('A9', 'legacy place_order closed to every client role',
    Object.values(placeState).every((x) => x === false) && pub === false,
    JSON.stringify({ ...placeState, public: pub }));

  // ---- A5 / A5b: read path ----
  const reads = {};
  let readErr = null;
  for (const t of ['inventory_lots', 'inventory_serials', 'inventory_balances', 'inventory_transactions']) {
    try {
      await c.query('BEGIN');
      await c.query('SET LOCAL ROLE authenticated');
      const r = await c.query(`SELECT count(*)::int AS n FROM public.${t}`);
      reads[t] = r.rows[0].n;
      await c.query('ROLLBACK');
    } catch (e) {
      reads[t] = `${e.code}: ${e.message}`;
      readErr = e.message;
      await c.query('ROLLBACK').catch(() => {});
    }
  }
  const readOk = !readErr;
  rec('A5', 'authenticated can read inventory tables under RLS', readOk, JSON.stringify(reads));

  if (!readOk) {
    const helpers = await c.query(`
      SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS fn,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('is_company_member','is_company_owner','company_member_has_permission','has_role')
      ORDER BY 1`);
    const denied = helpers.rows.filter((r) => r.auth_exec === false).map((r) => r.fn);
    const pol = await c.query(`
      SELECT tablename, policyname, cmd, coalesce(qual, '') AS qual
      FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE 'inventory%' AND roles::text LIKE '%authenticated%'`);
    const usingDenied = pol.rows.filter((p) => denied.some((d) => p.qual.includes(d.split('(')[0])));
    rec('A5b', 'root cause of the denied read identified', denied.length > 0 && usingDenied.length > 0,
      `helpers without EXECUTE for authenticated: ${denied.join(', ')}; policies depending on them: ${usingDenied.map((p) => `${p.tablename}.${p.policyname}`).join(', ')}`);
  }

  // ---- A6 / A7: real write attempts by the client role ----
  const attempt = async (id, name, sql) => {
    try {
      await c.query('BEGIN');
      await c.query('SET LOCAL ROLE authenticated');
      await c.query(sql);
      await c.query('ROLLBACK');
      rec(id, name, false, 'statement SUCCEEDED as authenticated');
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      rec(id, name, e.code === '42501', `${e.code} ${String(e.message).replace(/\s+/g, ' ').slice(0, 110)}`);
    }
  };
  await attempt('A6', 'authenticated INSERT into inventory_lots denied',
    'INSERT INTO public.inventory_lots (id) VALUES (gen_random_uuid())');
  await attempt('A7', 'authenticated UPDATE on inventory_serials denied',
    'UPDATE public.inventory_serials SET id = id WHERE false');

  // ---- A8 / A8b: rollback round trip (rollback file carries its own BEGIN/COMMIT) ----
  try {
    await c.query(fs.readFileSync(ROLLBACK, 'utf8'));
    const restored = {
      create_res: await canExec('authenticated', FNS.create_res),
      reserve_bol: await canExec('service_role', FNS.reserve_bol),
      cancel: await canExec('authenticated', FNS.cancel),
    };
    rec('A8', 'rollback file restores every revoked write privilege',
      restored.create_res && restored.reserve_bol && restored.cancel, JSON.stringify(restored));
  } catch (e) {
    rec('A8', 'rollback file restores every revoked write privilege', false, String(e.message).slice(0, 140));
  }

  try {
    await c.query(fs.readFileSync(PHASE_A, 'utf8'));
    const revoked = {
      create_res: await canExec('authenticated', FNS.create_res),
      reserve_bol: await canExec('service_role', FNS.reserve_bol),
      cancel: await canExec('authenticated', FNS.cancel),
      place: await canExec('authenticated', FNS.place),
    };
    rec('A8b', 'Phase A re-application closes the round trip',
      Object.values(revoked).every((x) => x === false), JSON.stringify(revoked));
  } catch (e) {
    rec('A8b', 'Phase A re-application closes the round trip', false, String(e.message).slice(0, 140));
  }

  // A8c — the rollback artifact deliberately re-grants p4_writes_allowed to
  // service_role. A clean chain leaves it owner-only, so restore that baseline;
  // otherwise a later suite sees drift that the test itself created.
  try {
    await c.query(`REVOKE EXECUTE ON FUNCTION public.p4_writes_allowed(uuid) FROM service_role`);
    const p4 = (await c.query(`SELECT has_function_privilege('service_role','public.p4_writes_allowed(uuid)','EXECUTE') AS x`)).rows[0].x;
    rec('A8c', 'ACL baseline restored after the rollback round trip', p4 === false, `service_role EXECUTE=${p4}`);
  } catch (e) {
    rec('A8c', 'ACL baseline restored after the rollback round trip', false, String(e.message).slice(0, 100));
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\nSUMMARY ${passed}/${results.length}`);
  fs.writeFileSync(OUT, JSON.stringify({
    ranAt: new Date().toISOString(),
    server: (await c.query('SELECT version()')).rows[0].version.split(' on ')[0],
    summary: `${passed}/${results.length}`,
    results,
  }, null, 2));
  await c.end();
  process.exit(passed === results.length ? 0 : 3);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
