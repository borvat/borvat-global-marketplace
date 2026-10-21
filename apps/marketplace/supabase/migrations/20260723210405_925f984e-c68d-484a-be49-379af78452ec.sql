REVOKE EXECUTE ON FUNCTION public.post_inventory_transaction(uuid,text,jsonb,text,uuid,text,jsonb,uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reverse_inventory_transaction(uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rebuild_inventory_balances(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sku_sellable_quantity(uuid,uuid) FROM anon;