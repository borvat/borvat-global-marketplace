// Proves finding F2 was a real defect, not a theoretical one: re-installs the
// PRE-FIX body of grant_seller_role_from_approved_application() inside a
// transaction, lets a SUSPENDED member call it, and observes the seller role
// being granted. The transaction is rolled back, so the fixed body returns.
//
//   P1  pre-fix body grants 'seller' to a suspended member  (defect reproduced)
//   P2  post-rollback the fix is back in force (suspended member denied)
const fs = require('node:fs');
const pg = process.env.PG_MODULE || 'pg';
const { Client } = require(pg);

const ID = {
  uSuspended: '00000000-0000-4000-8000-0000000000b6',
  uReviewer: '00000000-0000-4000-8000-0000000000b8',
  company: '00000000-0000-4000-8000-0000000000c6',
};

const OLD_BODY = `
CREATE OR REPLACE FUNCTION public.grant_seller_role_from_approved_application()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_has_approved boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT EXISTS (
    SELECT 1
    FROM public.seller_applications sa
    JOIN public.company_members cm ON cm.company_id = sa.company_id
    WHERE cm.user_id = v_uid
      AND sa.status = 'approved'
  ) INTO v_has_approved;
  IF NOT v_has_approved THEN
    RAISE EXCEPTION 'no approved seller application for this user' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'seller'::public.app_role)
  ON CONFLICT DO NOTHING;
END $$;`;

(async () => {
  const c = new Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    database: process.env.PGDATABASE || 'postgres',
  });
  await c.connect();
  const users = [ID.uSuspended, ID.uReviewer];

  for (const u of users) {
    await c.query(`INSERT INTO auth.users (id, email, aud, role) VALUES ($1,$2,'authenticated','authenticated')
                   ON CONFLICT (id) DO NOTHING`, [u, `prove-${u.slice(-2)}@chain-rebuild.invalid`]);
  }
  await c.query(`INSERT INTO public.companies (id, name, slug, owner_user_id) VALUES ($1,'Proof Ltd','proof-ltd',$2)
                 ON CONFLICT (id) DO NOTHING`, [ID.company, ID.uReviewer]);

  const ownerRole = (await c.query(`SELECT id FROM public.system_company_roles WHERE key='owner'`)).rows[0].id;
  await c.query(`INSERT INTO public.company_members (company_id, user_id, status) VALUES ($1,$2,'suspended')
                 ON CONFLICT (company_id, user_id) DO UPDATE SET status='suspended'`, [ID.company, ID.uSuspended]);
  const m = await c.query(`SELECT id FROM public.company_members WHERE company_id=$1 AND user_id=$2`, [ID.company, ID.uSuspended]);
  await c.query(`INSERT INTO public.company_member_roles (member_id, role_id) VALUES ($1,$2)
                 ON CONFLICT (member_id, role_id) DO NOTHING`, [m.rows[0].id, ownerRole]);
  await c.query('ALTER TABLE public.seller_applications DISABLE TRIGGER USER');
  await c.query(`DELETE FROM public.seller_applications WHERE company_id=$1`, [ID.company]);
  await c.query(`INSERT INTO public.seller_applications (company_id, status, contact_email, approved_at, decided_by)
                 VALUES ($1,'approved','prove@chain-rebuild.invalid', now(), $2)`, [ID.company, ID.uReviewer]);
  await c.query('ALTER TABLE public.seller_applications ENABLE TRIGGER USER');

  const callAsSuspended = async (commit = false) => {
    await c.query('BEGIN');
    try {
      await c.query(`SET LOCAL request.jwt.claim.sub = '${ID.uSuspended}'`);
      await c.query(`SET LOCAL request.jwt.claim.role = 'authenticated'`);
      await c.query('SET LOCAL ROLE authenticated');
      await c.query('SELECT public.grant_seller_role_from_approved_application()');
      await c.query(commit ? 'COMMIT' : 'ROLLBACK');
      return { ok: true };
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      return { ok: false, code: e.code, message: e.message };
    }
  };

  // ---- P1: install the pre-fix body permanently, then let a suspended member call it ----
  await c.query(OLD_BODY);
  const p1 = await callAsSuspended(true);
  const afterOld = (await c.query(`SELECT count(*)::int AS n FROM public.user_roles WHERE user_id=$1 AND role='seller'::public.app_role`, [ID.uSuspended])).rows[0].n;
  // restore the shipped fix before the second probe
  await c.query(fs.readFileSync('apps/marketplace/supabase/migrations/20261102094000_2a00c827-5eab-45e8-ae29-618bf922c137_seller_role_requires_active_membership.sql', 'utf8'));
  await c.query('ALTER TABLE public.user_roles DISABLE TRIGGER USER');
  await c.query(`DELETE FROM public.user_roles WHERE user_id=$1 AND role='seller'::public.app_role`, [ID.uSuspended]);
  await c.query('ALTER TABLE public.user_roles ENABLE TRIGGER USER');
  console.log(`${p1.ok && afterOld === 1 ? 'PASS' : 'FAIL'} P1 pre-fix body lets a SUSPENDED member self-activate :: call=${p1.ok ? 'succeeded' : p1.code} sellerRows=${afterOld}`);

  // ---- P2: fixed body must deny ----
  const p2 = await callAsSuspended();
  const afterFix = (await c.query(`SELECT count(*)::int AS n FROM public.user_roles WHERE user_id=$1 AND role='seller'::public.app_role`, [ID.uSuspended])).rows[0].n;
  console.log(`${!p2.ok && p2.code === '42501' && afterFix === 0 ? 'PASS' : 'FAIL'} P2 shipped body denies the same caller :: ${p2.ok ? 'succeeded' : p2.code + ' ' + p2.message} sellerRows=${afterFix}`);

  // ---- cleanup ----
  await c.query(`DELETE FROM public.seller_applications WHERE company_id=$1`, [ID.company]);
  await c.query('ALTER TABLE public.user_roles DISABLE TRIGGER USER');
  await c.query(`DELETE FROM public.user_roles WHERE user_id = ANY($1::uuid[])`, [users]);
  await c.query('ALTER TABLE public.user_roles ENABLE TRIGGER USER');
  await c.query(`DELETE FROM public.companies WHERE id=$1`, [ID.company]);
  await c.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [users]);

  await c.end();
  process.exit(p1.ok && afterOld === 1 && !p2.ok && afterFix === 0 ? 0 : 3);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
