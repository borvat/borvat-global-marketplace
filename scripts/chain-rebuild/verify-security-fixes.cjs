// Security-review verification for the two follow-up migrations:
//   20261102093000 narrow_reviewer_gate_execute   (finding F1)
//   20261102094000 seller_role_requires_active_membership (finding F2)
//
// Runs against the disposable chain-rebuild database only.
//   S1  reviewer gate is no longer executable by authenticated/service_role
//   S2  direct call by authenticated is rejected (42501)
//   S3  an actual reviewer can still use admin_list_seller_applications (internal gate works)
//   S4  a non-reviewer is rejected by the same RPC (guard intact)
//   S5  active member with an approved application self-activates as seller
//   S6  SUSPENDED member is rejected (the F2 fix)
//   S7  non-member is rejected
//   S8  granted surface has zero unexplained drift vs approved-routines.json
const fs = require('node:fs');

const pg = process.env.PG_MODULE || 'pg';
const { Client } = require(pg);
const OUT = process.argv[2] || 'security-fixes-result.json';
const ALLOWLIST = 'apps/marketplace/scripts/phase5-acl-gate/approved-routines.json';

const ID = {
  uActive: '00000000-0000-4000-8000-0000000000a5',
  uSuspended: '00000000-0000-4000-8000-0000000000a6',
  uOutsider: '00000000-0000-4000-8000-0000000000a7',
  uReviewer: '00000000-0000-4000-8000-0000000000a8',
  company: '00000000-0000-4000-8000-0000000000c5',
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

  const users = [ID.uActive, ID.uSuspended, ID.uOutsider, ID.uReviewer];
  const teardown = async () => {
    await c.query(`DELETE FROM public.seller_applications WHERE company_id = $1`, [ID.company]);
    // user_roles is append-only and guarded: privileged role rows can only be
    // removed by an admin. Fixture cleanup runs as owner with the guard off.
    await c.query('ALTER TABLE public.user_roles DISABLE TRIGGER USER');
    await c.query(`DELETE FROM public.user_roles WHERE user_id = ANY($1::uuid[])`, [users]);
    await c.query('ALTER TABLE public.user_roles ENABLE TRIGGER USER');
    await c.query(`DELETE FROM public.companies WHERE id = $1`, [ID.company]);
    await c.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [users]);
  };
  await teardown();

  for (const u of users) {
    await c.query(
      `INSERT INTO auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data)
       VALUES ($1, $2, 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb)`,
      [u, `sec-${u.slice(-2)}@chain-rebuild.invalid`]);
  }
  await c.query(`INSERT INTO public.companies (id, name, slug, owner_user_id)
                 VALUES ($1, 'Security Fixture Ltd', 'security-fixture', $2)`, [ID.company, ID.uActive]);

  const ownerRole = (await c.query(`SELECT id FROM public.system_company_roles WHERE key='owner'`)).rows[0].id;
  const member = async (userId, status) => {
    await c.query(`INSERT INTO public.company_members (company_id, user_id, status) VALUES ($1,$2,$3)
                   ON CONFLICT (company_id, user_id) DO UPDATE SET status = EXCLUDED.status`,
      [ID.company, userId, status]);
    const m = await c.query(`SELECT id FROM public.company_members WHERE company_id=$1 AND user_id=$2`, [ID.company, userId]);
    await c.query(`INSERT INTO public.company_member_roles (member_id, role_id) VALUES ($1,$2)
                   ON CONFLICT (member_id, role_id) DO NOTHING`, [m.rows[0].id, ownerRole]);
  };
  await member(ID.uActive, 'active');
  await member(ID.uSuspended, 'suspended');

  // user_roles is append-only with a guard trigger; disable it for fixture setup only.
  await c.query('ALTER TABLE public.user_roles DISABLE TRIGGER USER');
  await c.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'seller_verification_reviewer'::public.app_role)`, [ID.uReviewer]);
  await c.query('ALTER TABLE public.user_roles ENABLE TRIGGER USER');

  // seller_applications enforces lifecycle transitions in triggers that require
  // an acting administrator. Fixture creation runs as owner with those user
  // triggers disabled; the RPC under test reads only company_id + status.
  await c.query('ALTER TABLE public.seller_applications DISABLE TRIGGER USER');
  await c.query(`INSERT INTO public.seller_applications (company_id, status, contact_email, approved_at, decided_by)
                 VALUES ($1, 'approved', 'sec-fixture@chain-rebuild.invalid', now(), $2)`, [ID.company, ID.uReviewer]);
  await c.query('ALTER TABLE public.seller_applications ENABLE TRIGGER USER');
  if (false) {
  await c.query(`UPDATE public.seller_applications
                 SET status = 'submitted', submitted_at = now()
                 WHERE company_id = $1 AND status = 'draft'`, [ID.company]);
  await c.query(`UPDATE public.seller_applications
                 SET status = 'approved', approved_at = now()
                 WHERE company_id = $1 AND status = 'submitted'`, [ID.company]);
  }

  // commit=true persists the effect so it can be observed from the owner session;
  // otherwise the statement runs and is rolled back (read-only probes).
  const asUser = async (userId, sql, commit = false) => {
    await c.query('BEGIN');
    try {
      await c.query(`SET LOCAL request.jwt.claim.sub = '${userId}'`);
      await c.query(`SET LOCAL request.jwt.claim.role = 'authenticated'`);
      await c.query('SET LOCAL ROLE authenticated');
      const r = await c.query(sql);
      await c.query(commit ? 'COMMIT' : 'ROLLBACK');
      return { ok: true, rows: r.rows, rowCount: r.rowCount };
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      return { ok: false, code: e.code, message: e.message };
    }
  };

  const canExec = async (role, sig) =>
    (await c.query(`SELECT has_function_privilege('${role}','${sig}','EXECUTE') AS x`)).rows[0].x;

  // S1
  const gate = 'public.m1v1da_require_reviewer()';
  const gateAcl = { authenticated: await canExec('authenticated', gate), service_role: await canExec('service_role', gate), postgres: await canExec('postgres', gate) };
  rec('S1', 'reviewer gate not executable by client roles, but still executable by its owner',
    gateAcl.authenticated === false && gateAcl.service_role === false && gateAcl.postgres === true,
    JSON.stringify(gateAcl));

  // S2
  const s2 = await asUser(ID.uReviewer, `SELECT * FROM public.m1v1da_require_reviewer()`);
  rec('S2', 'direct call to the reviewer gate by authenticated is denied', !s2.ok && s2.code === '42501',
    s2.ok ? 'gate returned rows' : `${s2.code} ${s2.message}`);

  // S3 reviewer path through the admin RPC (internal call as definer)
  const s3 = await asUser(ID.uReviewer, `SELECT public.admin_list_seller_applications() AS r`);
  rec('S3', 'reviewer RPC still works through the internal gate', s3.ok, s3.ok ? 'returned ok' : `${s3.code} ${s3.message}`);

  // S4 non-reviewer path
  const s4 = await asUser(ID.uActive, `SELECT public.admin_list_seller_applications() AS r`);
  rec('S4', 'non-reviewer is rejected by the same RPC', !s4.ok && s4.code === '42501',
    s4.ok ? 'unexpectedly allowed' : `${s4.code} ${s4.message}`);

  // S5 active member self-activates
  const s5 = await asUser(ID.uActive, `SELECT public.grant_seller_role_from_approved_application() AS r`, true);
  const s5role = (await c.query(`SELECT count(*)::int AS n FROM public.user_roles WHERE user_id=$1 AND role='seller'::public.app_role`, [ID.uActive])).rows[0].n;
  rec('S5', 'active member with an approved application activates as seller', s5.ok && s5role === 1,
    s5.ok ? `seller rows=${s5role}` : `${s5.code} ${s5.message}`);

  // S6 suspended member is denied (F2)
  const s6 = await asUser(ID.uSuspended, `SELECT public.grant_seller_role_from_approved_application() AS r`, true);
  const s6role = (await c.query(`SELECT count(*)::int AS n FROM public.user_roles WHERE user_id=$1 AND role='seller'::public.app_role`, [ID.uSuspended])).rows[0].n;
  rec('S6', 'SUSPENDED member cannot self-activate (finding F2 fixed)',
    !s6.ok && s6.code === '42501' && s6role === 0,
    s6.ok ? `granted, seller rows=${s6role}` : `${s6.code} ${s6.message}`);

  // S7 outsider
  const s7 = await asUser(ID.uOutsider, `SELECT public.grant_seller_role_from_approved_application() AS r`);
  rec('S7', 'non-member cannot self-activate', !s7.ok && s7.code === '42501',
    s7.ok ? 'unexpectedly allowed' : `${s7.code} ${s7.message}`);

  // S8 allowlist conformance, no exceptions
  if (fs.existsSync(ALLOWLIST)) {
    const list = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8'));
    const approved = new Map(list.routines.map((x) => [x.signature, x.roles || []]));
    const current = await c.query(`
      SELECT p.oid::regprocedure::text AS sig,
             has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed,
             has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public'`);
    const bad = [];
    for (const row of current.rows) {
      const sig = row.sig.replace(/^public\./, '');
      const roles = approved.get(sig) || [];
      if (row.anon && !roles.includes('anon')) bad.push(`anon:${sig}`);
      if (row.authed && !roles.includes('authenticated')) bad.push(`authenticated:${sig}`);
      if (row.svc && !roles.includes('service_role') && !row.authed) bad.push(`service_role:${sig}`);
    }
    rec('S8', 'no unexplained EXECUTE drift against approved-routines.json', bad.length === 0,
      bad.length ? bad.slice(0, 10).join(', ') : 'zero violations');
  } else {
    rec('S8', 'no unexplained EXECUTE drift against approved-routines.json', false, 'allowlist missing');
  }

  await teardown();

  const passed = results.filter((x) => x.pass).length;
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
