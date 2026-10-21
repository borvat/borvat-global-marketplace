-- Phase 4 M3 hotfix: remove premature shipping RPC.
-- Ensures no path in M3 can transition an order line to 'shipped'
-- or send a shipment confirmation to Bol. Actual shipment (picked -> ship)
-- is delivered in Phase 4 M5 which invokes the Phase 2 ship path,
-- creates shipment + tracking, and only then flips the order line to shipped.
DROP FUNCTION IF EXISTS public.mark_bol_order_line_shipped(uuid);