DROP POLICY IF EXISTS "users can become seller" ON public.user_roles;

DROP POLICY IF EXISTS "users insert own profile" ON public.profiles;
CREATE POLICY "users insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "users update own profile" ON public.profiles;
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "users manage own cart" ON public.cart_items;
CREATE POLICY "users manage own cart" ON public.cart_items
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "users create own orders" ON public.orders;
CREATE POLICY "users create own orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "users read own orders" ON public.orders;
CREATE POLICY "users read own orders" ON public.orders
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "buyer inserts own order items" ON public.order_items;
CREATE POLICY "buyer inserts own order items" ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND o.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "buyer reads own order items" ON public.order_items;
CREATE POLICY "buyer reads own order items" ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND o.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "seller reads own order items" ON public.order_items;
CREATE POLICY "seller reads own order items" ON public.order_items
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = seller_id);

DROP POLICY IF EXISTS "seller deletes own products" ON public.products;
CREATE POLICY "seller deletes own products" ON public.products
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = seller_id);

DROP POLICY IF EXISTS "users read own roles" ON public.user_roles;
CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.grant_seller_role_from_approved_application()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
    JOIN public.company_members cm
      ON cm.company_id = sa.company_id
    WHERE cm.user_id = v_uid
      AND sa.status = 'approved'
  ) INTO v_has_approved;

  IF NOT v_has_approved THEN
    RAISE EXCEPTION
      'no approved seller application for this user'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'seller'::public.app_role)
  ON CONFLICT DO NOTHING;
END $$;

REVOKE ALL ON FUNCTION public.grant_seller_role_from_approved_application() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_seller_role_from_approved_application() TO authenticated;

COMMENT ON FUNCTION public.grant_seller_role_from_approved_application() IS
  'P0-2: sole lawful path to the seller role. Requires an approved seller_application. Replaces the dropped "users can become seller" policy.';

DO $$
DECLARE
  v_escalation int;
  v_public_policies int;
BEGIN
  SELECT count(*) INTO v_escalation
  FROM pg_policies
  WHERE schemaname='public' AND tablename='user_roles' AND cmd='INSERT';

  SELECT count(*) INTO v_public_policies
  FROM pg_policies
  WHERE schemaname='public'
    AND roles::text = '{public}'
    AND tablename IN ('profiles','cart_items','orders','order_items','products','user_roles');

  IF v_escalation > 0 THEN
    RAISE EXCEPTION 'P0-2 FAIL: % INSERT policy/policies remain on user_roles.', v_escalation;
  END IF;
  IF v_public_policies > 0 THEN
    RAISE EXCEPTION 'P0-2 FAIL: % policy/policies still target {public}.', v_public_policies;
  END IF;

  RAISE NOTICE 'P0-2 PASS: no client-side INSERT path to user_roles; all target policies retargeted to authenticated.';
END $$;