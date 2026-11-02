// Write-path verification BEYOND inventory, prompted by independent-review finding
// F4: restoring EXECUTE on the three RLS helpers re-armed 75 policies on 44 tables,
// and eleven of those tables still grant authenticated INSERT/UPDATE. The inventory
// assertions (A1-A9, R1-R9) never exercised those paths.
//
// This is a sample, not an exhaustive proof: it covers catalog_products and
// warehouses, the two shapes every other write policy repeats
// (company_member_has_permission(company_id, auth.uid(), '<perm>')).
//
//   W1 owner with catalog.manage can insert a catalog product for its company
//   W2 member WITHOUT catalog.manage is refused by the row-level policy
//   W3 non-member is refused
//   W4 owner can insert a warehouse; a member without warehouses.manage cannot
//   W5 cross-tenant read stays isolated on catalog_products
const fs = require('node:fs');

const pg = process.env.PG_MODULE || 'pg';
const { Client } = require(pg);
const OUT = process.argv[2] || 'write-paths-result.json';

const ID = {
  ownerA: '00000000-0000-4000-8000-0000000000d1',
  viewerA: '00000000-0000-4000-8000-0000000000d2',
  ownerB: '00000000-0000-4000-8000-0000000000d3',
  outsider: '00000000-0000-4000-8000-0000000000d4',
  cA: '00000000-0000-4000-8000-0000000000e5',
  cB: '00000000-0000-4000-8000-0000000000e6',
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

  const users = [ID.ownerA, ID.viewerA, ID.ownerB, ID.outsider];
  const teardown = async () => {
    await c.query(`DELETE FROM public.catalog_products WHERE company_id IN ($1,$2)`, [ID.cA, ID.cB]);
    await c.query(`DELETE FROM public.warehouses WHERE company_id IN ($1,$2)`, [ID.cA, ID.cB]);
    await c.query(`DELETE FROM public.companies WHERE id IN ($1,$2)`, [ID.cA, ID.cB]);
    await c.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [users]);
  };
  await teardown();

  for (const u of users) {
    await c.query(`INSERT INTO auth.users (id, email, aud, role) VALUES ($1,$2,'authenticated','authenticated')`,
      [u, `write-${u.slice(-2)}@chain-rebuild.invalid`]);
  }
  await c.query(`INSERT INTO public.companies (id, name, slug, owner_user_id) VALUES
      ($1,'Write A','write-a',$2), ($3,'Write B','write-b',$4)`, [ID.cA, ID.ownerA, ID.cB, ID.ownerB]);

  const roleId = async (key) => (await c.query(`SELECT id FROM public.system_company_roles WHERE key=$1`, [key])).rows[0].id;
  const addMember = async (company, user, roleKey) => {
    await c.query(`INSERT INTO public.company_members (company_id, user_id, status) VALUES ($1,$2,'active')
                   ON CONFLICT (company_id, user_id) DO UPDATE SET status='active'`, [company, user]);
    const m = (await c.query(`SELECT id FROM public.company_members WHERE company_id=$1 AND user_id=$2`, [company, user])).rows[0].id;
    await c.query(`INSERT INTO public.company_member_roles (member_id, role_id) VALUES ($1,$2)
                   ON CONFLICT (member_id, role_id) DO NOTHING`, [m, await roleId(roleKey)]);
  };
  await addMember(ID.cA, ID.ownerA, 'owner');
  await addMember(ID.cA, ID.viewerA, 'viewer');
  await addMember(ID.cB, ID.ownerB, 'owner');

  const perms = (await c.query(`
    SELECT scr.key AS role, p.key AS perm
    FROM public.system_company_roles scr
    JOIN public.role_permissions rp ON rp.role_id = scr.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE p.key IN ('catalog.manage','warehouses.manage')`)).rows;
  const ownerHas = (perm) => perms.some((p) => p.role === 'owner' && p.perm === perm);
  const viewerHas = (perm) => perms.some((p) => p.role === 'viewer' && p.perm === perm);
  console.log('permission map:', perms.map((p) => `${p.role}:${p.perm}`).join(', '));

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

  // W1
  const w1 = await asUser(ID.ownerA,
    `INSERT INTO public.catalog_products (company_id, title, created_by) VALUES ('${ID.cA}','W1 product','${ID.ownerA}') RETURNING id`, true);
  rec('W1', 'owner with catalog.manage inserts a catalog product', w1.ok,
    w1.ok ? 'row created' : `${w1.code} ${w1.message}`);

  // W2
  const w2 = await asUser(ID.viewerA,
    `INSERT INTO public.catalog_products (company_id, title, created_by) VALUES ('${ID.cA}','W2 product','${ID.viewerA}')`);
  const viewerLacksPerm = !viewerHas('catalog.manage');
  rec('W2', 'member without catalog.manage is refused by the policy',
    viewerLacksPerm && !w2.ok && w2.code === '42501',
    viewerLacksPerm ? (w2.ok ? 'unexpectedly allowed' : `${w2.code} ${w2.message}`) : 'fixture role unexpectedly holds catalog.manage');

  // W3
  const w3 = await asUser(ID.outsider,
    `INSERT INTO public.catalog_products (company_id, title) VALUES ('${ID.cA}','W3 product')`);
  rec('W3', 'non-member write on the same table is refused', !w3.ok && w3.code === '42501',
    w3.ok ? 'unexpectedly allowed' : `${w3.code} ${w3.message}`);

  // W4
  const w4a = await asUser(ID.ownerA,
    `INSERT INTO public.warehouses (company_id, code, name, requires_location, status) VALUES ('${ID.cA}','W-WH-A','Write WH',false,'active')`, true);
  const w4b = await asUser(ID.viewerA,
    `INSERT INTO public.warehouses (company_id, code, name, requires_location, status) VALUES ('${ID.cA}','W-WH-V','Write WH V',false,'active')`);
  const viewerLacksWh = !viewerHas('warehouses.manage');
  rec('W4', 'warehouse writes follow warehouses.manage (owner yes, viewer no)',
    ownerHas('warehouses.manage') && w4a.ok && viewerLacksWh && !w4b.ok && w4b.code === '42501',
    `owner=${w4a.ok ? 'allowed' : w4a.code} viewer=${w4b.ok ? 'allowed' : w4b.code}`);

  // W5
  const w5 = await asUser(ID.ownerB, `SELECT count(*)::int AS n FROM public.catalog_products WHERE company_id='${ID.cA}'`);
  rec('W5', 'catalog reads stay tenant-scoped', w5.ok && w5.rows[0].n === 0,
    w5.ok ? `B sees ${w5.rows[0].n} of A's products` : `${w5.code} ${w5.message}`);

  await teardown();
  const passed = results.filter((r) => r.pass).length;
  console.log(`\nSUMMARY ${passed}/${results.length}`);
  fs.writeFileSync(OUT, JSON.stringify({
    ranAt: new Date().toISOString(),
    scope: 'sample of 2 of 19 tables carrying authenticated write policies',
    summary: `${passed}/${results.length}`,
    results,
  }, null, 2));
  await c.end();
  process.exit(passed === results.length ? 0 : 3);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
