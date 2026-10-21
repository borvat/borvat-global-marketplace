-- M1B-0T — ACL DRIFT CYCLE 13 NORMALISATION (REVOKE/GRANT ONLY, no DDL)

-- 1. sandbox drift removal on the M1V-1D surface and the role-check routine
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM sandbox_exec;
REVOKE ALL ON FUNCTION public.seller_get_application(uuid) FROM sandbox_exec;
REVOKE ALL ON FUNCTION public.seller_submit_application(uuid) FROM sandbox_exec;
REVOKE ALL ON FUNCTION public.seller_upsert_application(uuid, uuid, text, text, text, text[], integer, text, text) FROM sandbox_exec;
REVOKE ALL ON FUNCTION public.admin_list_seller_applications(text, integer, integer) FROM sandbox_exec;
REVOKE ALL ON FUNCTION public.admin_get_seller_application(uuid) FROM sandbox_exec;
REVOKE ALL ON FUNCTION public.admin_review_seller_application(uuid, text, text) FROM sandbox_exec;

-- 2. has_role must be executable by the roles that evaluate RLS policies which
--    reference it (products, orders, order_items, audit log, tax surfaces).
--    Without this, every anon/authenticated read of those tables fails with
--    "permission denied for function has_role".
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;