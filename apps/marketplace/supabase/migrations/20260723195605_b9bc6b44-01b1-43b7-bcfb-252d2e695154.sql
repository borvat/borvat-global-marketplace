
DROP POLICY IF EXISTS "companies_select_members" ON public.companies;
CREATE POLICY "companies_select_members_or_owner"
ON public.companies FOR SELECT TO authenticated
USING (
  owner_user_id = auth.uid()
  OR public.is_company_member(id, auth.uid())
);
