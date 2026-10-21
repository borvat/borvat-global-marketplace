-- Restrict admin-scope RLS policies to authenticated only, so anon requests
-- don't invoke has_role() (which is not executable by anon and caused a
-- 401 "permission denied for function has_role" on public product listing).

DROP POLICY IF EXISTS "admin manages all products" ON public.products;
CREATE POLICY "admin manages all products" ON public.products
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin reads all orders" ON public.orders;
CREATE POLICY "admin reads all orders" ON public.orders
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin manages order items" ON public.order_items;
CREATE POLICY "admin manages order items" ON public.order_items
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "seller inserts own products" ON public.products;
CREATE POLICY "seller inserts own products" ON public.products
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = seller_id);