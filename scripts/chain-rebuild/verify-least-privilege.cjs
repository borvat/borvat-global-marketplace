// Impact tests for the least-privilege follow-up (owner decision 2026-11-02):
//   L1 active owner keeps owner rights
//   L2 SUSPENDED owner loses owner rights (F5) and the RLS update policy follows
//   L3 authenticated with NO role claim fails closed instead of returning false (F6)
//   L4 impersonation still rejected (regression)
//   L5 activation is recorded with company + store and the scoped predicate agrees
//   L6 the scoped predicate is false for another store and another company (F8)
//   L7 an application pointing at a store of another company is refused
//   L8 suspended member cannot activate (regression from F2)
//   L9 authenticated cannot write the activation table directly
const fs = require('node:fs');
const pg = process.env.PG_MODULE || 'pg';
const { Client } = require(pg);
const OUT = process.argv[2] || 'least-privilege-result.json';

const ID = {
  ownerA: '00000000-0000-4000-8000-0000000000f1',
  ownerB: '00000000-0000-4000-8000-0000000000f2',
  suspendedOwnerB: '00000000-0000-4000-8000-0000000000f3',
  outsider: '00000000-0000-4000-8000-0000000000f4',
  cA: '00000000-0000-4000-8000-0000000000a7',
  cB: '00000000-0000-4000-8000-0000000000a8',
  s1: '00000000-0000-4000-8000-0000000000b7',
  s2: '00000000-0000-4000-8000-0000000000b8',
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

  const users = [ID.ownerA, ID.ownerB, ID.suspendedOwnerB, ID.outsider];
  const teardown = async () => {
    await c.query(`DELETE FROM public.seller_activations WHERE company_id IN ($1,$2)`, [ID.cA, ID.cB]);
    await c.query(`DELETE FROM public.seller_applications WHERE company_id IN ($1,$2)`, [ID.cA, ID.cB]);
    await c.query(`DELETE FROM public.merchant_stores WHERE id IN ($1,$2)`, [ID.s1, ID.s2]);
    await c.query(`DELETE FROM public.companies WHERE id IN ($1,$2)`, [ID.cA, ID.cB]);
    await c.query('ALTER TABLE public.user_roles DISABLE TRIGGER USER');
    await c.query(`DELETE FROM public.user_roles WHERE user_id = ANY($1::uuid[])`, [users]);
    await c.query('ALTER TABLE public.user_roles ENABLE TRIGGER USER');
    await c.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [users]);
  };
  await teardown();

  for (const u of users) {
    await c.query(`INSERT INTO auth.users (id, email, aud, role) VALUES ($1,$2,'authenticated','authenticated')`,
      [u, `lp-${u.slice(-2)}@chain-rebuild.invalid`]);
  }
  await c.query(`INSERT INTO public.companies (id, name, slug, owner_user_id) VALUES
      ($1,'LP A','lp-a',$2), ($3,'LP B','lp-b',$4)`, [ID.cA, ID.ownerA, ID.cB, ID.ownerB]);
  // B gets a second "owner" whose membership we will suspend; the guard trigger is
  // disabled for that single fixture step because it forbids the state F5 defends against.
  await c.query('ALTER TABLE public.company_members DISABLE TRIGGER company_members_guard_owner_membership');
  await c.query(`INSERT INTO public.company_members (company_id, user_id, status) VALUES ($1,$2,'suspended')
                 ON CONFLICT (company_id, user_id) DO UPDATE SET status='suspended'`, [ID.cB, ID.suspendedOwnerB]);
  await c.query('ALTER TABLE public.company_members ENABLE TRIGGER company_members_guard_owner_membership');
  await c.query(`UPDATE public.companies SET owner_user_id = $1 WHERE id = $2`, [ID.suspendedOwnerB, ID.cB])
    .catch((e) => console.log('owner reassignment refused by trigger:', e.message.slice(0, 90)));

  const store = async (id, company, slug) => c.query(
    `INSERT INTO public.merchant_stores (id, company_id, slug, display_name, status, is_primary,
       default_locale, default_currency, country_code, branding, customer_facing_settings)
     VALUES ($1,$2,$3,$4,'active',false,'nl-NL','EUR','NL','{}'::jsonb,'{}'::jsonb)
     ON CONFLICT (id) DO NOTHING`, [id, company, slug, 'Store ' + slug]);
  await store(ID.s1, ID.cA, 'lp-s1');
  await store(ID.s2, ID.cB, 'lp-s2');

  const app = async (company, storeId, status) => {
    const r = await c.query(
      `INSERT INTO public.seller_applications (company_id, store_id, status, contact_email, approved_at, decided_by)
       VALUES ($1,$2,$3,'lp@chain-rebuild.invalid', now(), $4) RETURNING id`,
      [company, storeId, status, ID.ownerA]);
    return r.rows[0].id;
  };
  await c.query('ALTER TABLE public.seller_applications DISABLE TRIGGER USER');
  const appA = await app(ID.cA, ID.s1, 'approved');
  await c.query('ALTER TABLE public.seller_applications ENABLE TRIGGER USER');

  const asUser = async (userId, sql, opts = {}) => {
    await c.query('BEGIN');
    try {
      if (userId) {
        await c.query(`SET LOCAL request.jwt.claim.sub = '${userId}'`);
        await c.query(`SET LOCAL request.jwt.claim.role = 'authenticated'`);
      }
      await c.query('SET LOCAL ROLE authenticated');
      const r = await c.query(sql);
      await c.query(opts.commit ? 'COMMIT' : 'ROLLBACK');
      return { ok: true, rows: r.rows, rowCount: r.rowCount };
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      return { ok: false, code: e.code, message: e.message };
    }
  };

  // L1
  const l1 = await asUser(ID.ownerA, `SELECT public.is_company_owner('${ID.cA}','${ID.ownerA}') AS x`);
  rec('L1', 'active owner keeps owner rights', l1.ok && l1.rows[0].x === true, l1.ok ? `x=${l1.rows[0].x}` : l1.code);

  // L2 — suspended owner loses owner rights
  const l2a = await asUser(ID.suspendedOwnerB, `SELECT public.is_company_owner('${ID.cB}','${ID.suspendedOwnerB}') AS x`);
  const l2b = await asUser(ID.suspendedOwnerB,
    `UPDATE public.companies SET name = name WHERE id = '${ID.cB}'`, { commit: false });
  rec('L2', 'SUSPENDED owner loses owner rights and the update policy follows (F5)',
    l2a.ok && l2a.rows[0].x === false && (l2b.ok === true ? l2b.rowCount === 0 : l2b.code === '42501'),
    `is_owner=${l2a.rows?.[0]?.x} policy_update=${l2b.ok ? 'rows=' + l2b.rowCount : l2b.code}`);

  // L3 — no role claim must fail closed
  const l3 = await asUser(null, `SELECT public.is_company_member('${ID.cA}','${ID.ownerA}') AS x`);
  rec('L3', 'authenticated with no role claim fails closed (F6)', !l3.ok && l3.code === '42501',
    l3.ok ? `returned ${JSON.stringify(l3.rows)}` : `${l3.code} ${l3.message}`);

  // L4 — impersonation regression
  const l4 = await asUser(ID.outsider, `SELECT public.is_company_member('${ID.cA}','${ID.ownerA}') AS x`);
  rec('L4', 'impersonation still rejected', !l4.ok && l4.code === '42501', l4.ok ? 'returned rows' : l4.code);

  // L5 — activation recorded and scoped predicate agrees
  const l5 = await asUser(ID.ownerA, `SELECT public.grant_seller_role_from_approved_application()`, { commit: true });
  const row = (await c.query(`SELECT company_id, store_id, application_id FROM public.seller_activations WHERE user_id=$1`, [ID.ownerA])).rows[0];
  const l5b = await asUser(ID.ownerA, `SELECT public.has_seller_activation('${ID.cA}','${ID.s1}') AS x`);
  rec('L5', 'activation carries company + store and the scoped predicate agrees (F8)',
    l5.ok && !!row && row.company_id === ID.cA && row.store_id === ID.s1 && row.application_id === appA &&
    l5b.ok && l5b.rows[0].x === true,
    l5.ok ? `company=${row?.company_id === ID.cA} store=${row?.store_id === ID.s1} predicate=${l5b.rows?.[0]?.x}` : `${l5.code} ${l5.message}`);

  // L6 — wrong store / wrong company
  const l6a = await asUser(ID.ownerA, `SELECT public.has_seller_activation('${ID.cA}','${ID.s2}') AS x`);
  const l6b = await asUser(ID.ownerA, `SELECT public.has_seller_activation('${ID.cB}','${ID.s1}') AS x`);
  rec('L6', 'predicate is false for another store and another company',
    l6a.ok && l6a.rows[0].x === false && l6b.ok && l6b.rows[0].x === false,
    `other_store=${l6a.rows?.[0]?.x} other_company=${l6b.rows?.[0]?.x}`);

  // L7 — application pointing at a store of another company
  await c.query('ALTER TABLE public.seller_applications DISABLE TRIGGER USER');
  await c.query(`DELETE FROM public.seller_activations WHERE user_id=$1`, [ID.ownerA]);
  await c.query(`DELETE FROM public.seller_applications WHERE company_id=$1`, [ID.cA]);
  const badApp = await c.query(
    `INSERT INTO public.seller_applications (company_id, store_id, status, contact_email, approved_at, decided_by)
     VALUES ($1,$2,'approved','lp2@chain-rebuild.invalid', now(), $3) RETURNING id`,
    [ID.cA, ID.s2, ID.ownerA]);
  await c.query('ALTER TABLE public.seller_applications ENABLE TRIGGER USER');
  const l7 = await asUser(ID.ownerA, `SELECT public.grant_seller_role_from_approved_application()`);
  rec('L7', 'application store outside the company is refused',
    !l7.ok && l7.code === '42501' && /store does not belong/.test(l7.message || ''),
    l7.ok ? 'unexpectedly granted' : `${l7.code} ${l7.message}`);
  void badApp;

  // L8 — suspended member cannot activate (restore a valid application first)
  await c.query('ALTER TABLE public.seller_applications DISABLE TRIGGER USER');
  await c.query(`UPDATE public.seller_applications SET store_id = $1 WHERE company_id = $2`, [ID.s1, ID.cA]);
  await c.query(`INSERT INTO public.company_members (company_id, user_id, status)
                 SELECT $1,'${ID.outsider}','suspended'
                 WHERE NOT EXISTS (SELECT 1 FROM public.company_members WHERE company_id=$1 AND user_id='${ID.outsider}')`, [ID.cB]);
  await c.query('ALTER TABLE public.seller_applications ENABLE TRIGGER USER');
  const l8 = await asUser(ID.suspendedOwnerB, `SELECT public.grant_seller_role_from_approved_application()`);
  rec('L8', 'suspended member cannot activate (F2 regression)', !l8.ok && l8.code === '42501',
    l8.ok ? 'unexpectedly granted' : l8.code);

  // L9 — no direct write on the activation table
  const l9 = await asUser(ID.ownerA,
    `INSERT INTO public.seller_activations (user_id, company_id, application_id) VALUES ('${ID.ownerA}','${ID.cA}',gen_random_uuid())`);
  rec('L9', 'authenticated cannot insert activations directly', !l9.ok && l9.code === '42501',
    l9.ok ? 'insert succeeded' : `${l9.code} ${l9.message.slice(0, 60)}`);

  await teardown();
  const passed = results.filter((r) => r.pass).length;
  console.log(`\nSUMMARY ${passed}/${results.length}`);
  fs.writeFileSync(OUT, JSON.stringify({
    ranAt: new Date().toISOString(),
    scope: 'F5 owner status, F6 fail-closed guard, F8 scoped seller activation',
    summary: `${passed}/${results.length}`,
    results,
  }, null, 2));
  await c.end();
  process.exit(passed === results.length ? 0 : 3);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
