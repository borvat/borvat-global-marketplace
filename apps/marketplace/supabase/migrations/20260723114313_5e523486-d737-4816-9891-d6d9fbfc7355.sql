
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS tracking_carrier text,
  ADD COLUMN IF NOT EXISTS tracking_code text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS processing_at timestamptz,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_status_check;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_status_check
  CHECK (status IN ('new','processing','shipped','delivered','cancelled'));

UPDATE public.order_items SET status = 'new' WHERE status NOT IN ('new','processing','shipped','delivered','cancelled');

CREATE OR REPLACE FUNCTION public.order_items_stamp_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'processing' AND NEW.processing_at IS NULL THEN NEW.processing_at := now(); END IF;
    IF NEW.status = 'shipped'    AND NEW.shipped_at    IS NULL THEN NEW.shipped_at    := now(); END IF;
    IF NEW.status = 'delivered'  AND NEW.delivered_at  IS NULL THEN NEW.delivered_at  := now(); END IF;
    IF NEW.status = 'cancelled'  AND NEW.cancelled_at  IS NULL THEN NEW.cancelled_at  := now(); END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_order_items_stamp_status ON public.order_items;
CREATE TRIGGER trg_order_items_stamp_status
BEFORE UPDATE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.order_items_stamp_status();

-- Restrict buyers from updating their order_items; sellers can update their own items only.
-- Assume existing UPDATE policy on order_items may allow buyers. Recreate a strict seller-only update policy.
DROP POLICY IF EXISTS "Sellers update own order items" ON public.order_items;
CREATE POLICY "Sellers update own order items" ON public.order_items
  FOR UPDATE TO authenticated
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);
