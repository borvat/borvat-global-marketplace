
-- 1) PRODUCTS SELECT policies: consolidate & block draft leaks
DROP POLICY IF EXISTS "products public read" ON public.products;
DROP POLICY IF EXISTS "Anyone can view active published products" ON public.products;
DROP POLICY IF EXISTS "Sellers can view own drafts" ON public.products;
CREATE POLICY "products_public_read_published" ON public.products FOR SELECT TO anon, authenticated
  USING (is_active = true AND is_draft = false);
CREATE POLICY "products_seller_read_own" ON public.products FOR SELECT TO authenticated
  USING (auth.uid() = seller_id);

DROP POLICY IF EXISTS "seller updates own products" ON public.products;
CREATE POLICY "products_seller_update_own" ON public.products FOR UPDATE TO authenticated
  USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);

-- 2) ORDER_ITEMS: prevent seller_id rebinding
DROP POLICY IF EXISTS "seller updates own order items" ON public.order_items;
DROP POLICY IF EXISTS "Sellers update own order items" ON public.order_items;
CREATE POLICY "order_items_seller_update_own" ON public.order_items FOR UPDATE TO authenticated
  USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);

-- 3) Audit log: append-only
REVOKE UPDATE, DELETE ON public.agent_audit_log FROM authenticated, anon;

-- 4) seller_bol_credentials (owner-only, column is user_id)
DROP POLICY IF EXISTS "bol_owner_all" ON public.seller_bol_credentials;
DROP POLICY IF EXISTS "bol_owner_read" ON public.seller_bol_credentials;
DROP POLICY IF EXISTS "bol_owner_write" ON public.seller_bol_credentials;
DROP POLICY IF EXISTS "bol_owner_update" ON public.seller_bol_credentials;
DROP POLICY IF EXISTS "bol_owner_delete" ON public.seller_bol_credentials;
CREATE POLICY "bol_owner_read" ON public.seller_bol_credentials FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "bol_owner_insert" ON public.seller_bol_credentials FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bol_owner_update" ON public.seller_bol_credentials FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bol_owner_delete" ON public.seller_bol_credentials FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 5) Block admin self-elevation via trigger
CREATE OR REPLACE FUNCTION public.prevent_admin_self_grant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.role = 'admin' AND (auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'only admins can grant admin role';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_prevent_admin_self_grant ON public.user_roles;
CREATE TRIGGER trg_prevent_admin_self_grant
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_admin_self_grant();

-- 6) agent_memory scope namespaces
ALTER TABLE public.agent_memory DROP CONSTRAINT IF EXISTS agent_memory_scope_check;
ALTER TABLE public.agent_memory ADD CONSTRAINT agent_memory_scope_check
  CHECK (scope IN (
    'buyer_prefs','buyer_history',
    'seller_catalog','seller_pricing','seller_ops',
    'admin_notes','admin_fraud'
  ));

-- 7) product_suggestions: versioning + secure apply RPC
ALTER TABLE public.product_suggestions
  ADD COLUMN IF NOT EXISTS product_updated_at_at_suggestion timestamptz,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS applied_by uuid,
  ADD COLUMN IF NOT EXISTS applied_value jsonb,
  ADD COLUMN IF NOT EXISTS before_value jsonb,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_by uuid,
  ADD COLUMN IF NOT EXISTS feedback text;

DROP POLICY IF EXISTS "Sellers decide own suggestions" ON public.product_suggestions;
REVOKE UPDATE ON public.product_suggestions FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.decide_product_suggestion(
  _suggestion_id uuid, _accept boolean, _feedback text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.product_suggestions%ROWTYPE;
  p public.products%ROWTYPE;
  _actor uuid := auth.uid();
  _patch jsonb := '{}'::jsonb;
  _before jsonb := '{}'::jsonb;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO s FROM public.product_suggestions WHERE id = _suggestion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'suggestion not found'; END IF;
  IF s.seller_id <> _actor THEN RAISE EXCEPTION 'not your suggestion'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'already decided'; END IF;

  IF _accept AND s.product_id IS NOT NULL THEN
    SELECT * INTO p FROM public.products WHERE id = s.product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'product not found'; END IF;
    IF p.seller_id <> _actor THEN RAISE EXCEPTION 'not your product'; END IF;
    IF s.product_updated_at_at_suggestion IS NOT NULL
       AND p.updated_at <> s.product_updated_at_at_suggestion THEN
      RAISE EXCEPTION 'product was modified after suggestion — please regenerate';
    END IF;
    IF s.suggestion_type = 'title' THEN
      _before := jsonb_build_object('title', p.title);
      _patch := jsonb_build_object('title', s.suggested_value->>'value');
      UPDATE public.products SET title = s.suggested_value->>'value', updated_at = now() WHERE id = p.id;
    ELSIF s.suggestion_type = 'description' THEN
      _before := jsonb_build_object('description', p.description);
      _patch := jsonb_build_object('description', s.suggested_value->>'value');
      UPDATE public.products SET description = s.suggested_value->>'value', updated_at = now() WHERE id = p.id;
    ELSIF s.suggestion_type = 'price' THEN
      _before := jsonb_build_object('price_cents', p.price_cents);
      _patch := jsonb_build_object('price_cents', (s.suggested_value->>'price_cents')::int);
      UPDATE public.products SET price_cents = (s.suggested_value->>'price_cents')::int, updated_at = now() WHERE id = p.id;
    ELSE
      RAISE EXCEPTION 'unsupported suggestion type: %', s.suggestion_type;
    END IF;
  END IF;

  UPDATE public.product_suggestions SET
    status = CASE WHEN _accept THEN 'accepted' ELSE 'rejected' END,
    decided_at = now(), decided_by = _actor, feedback = _feedback,
    applied_at = CASE WHEN _accept THEN now() ELSE NULL END,
    applied_by = CASE WHEN _accept THEN _actor ELSE NULL END,
    applied_value = CASE WHEN _accept THEN _patch ELSE NULL END,
    before_value = CASE WHEN _accept THEN _before ELSE NULL END
  WHERE id = _suggestion_id;

  INSERT INTO public.agent_audit_log (user_id, role_at_time, tool_name, input_summary, output_summary, status)
  VALUES (_actor, 'seller', 'decide_product_suggestion',
    jsonb_build_object('suggestion_id', _suggestion_id, 'accept', _accept),
    jsonb_build_object('before', _before, 'applied', _patch), 'success');

  RETURN jsonb_build_object('ok', true, 'accepted', _accept, 'applied', _patch);
END $$;
REVOKE ALL ON FUNCTION public.decide_product_suggestion(uuid, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION public.decide_product_suggestion(uuid, boolean, text) TO authenticated;
