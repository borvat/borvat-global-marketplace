
-- 1. Add is_draft to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

-- Hide drafts from public product listing policy: refresh the public SELECT policy
-- Existing public policy assumed name; recreate defensively.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='products' AND policyname='Anyone can view active products') THEN
    EXECUTE 'DROP POLICY "Anyone can view active products" ON public.products';
  END IF;
END $$;

CREATE POLICY "Anyone can view active published products"
ON public.products FOR SELECT
USING (is_active = true AND is_draft = false);

CREATE POLICY "Sellers can view own drafts"
ON public.products FOR SELECT
TO authenticated
USING (seller_id = auth.uid());

-- 2. agent_audit_log
CREATE TABLE public.agent_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role_at_time text,
  tool_name text NOT NULL,
  client_id text,
  input_summary jsonb,
  output_summary jsonb,
  status text NOT NULL CHECK (status IN ('success','denied','error')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_audit_user ON public.agent_audit_log(user_id, created_at DESC);
CREATE INDEX idx_agent_audit_tool ON public.agent_audit_log(tool_name, created_at DESC);

GRANT SELECT ON public.agent_audit_log TO authenticated;
GRANT ALL ON public.agent_audit_log TO service_role;
ALTER TABLE public.agent_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own audit log"
ON public.agent_audit_log FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins read all audit log"
ON public.agent_audit_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 3. agent_memory
CREATE TABLE public.agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_role text NOT NULL,
  scope text NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL,
  source text NOT NULL,
  confidence numeric(3,2) NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, scope, key)
);
CREATE INDEX idx_agent_memory_owner ON public.agent_memory(owner_id, scope);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_memory TO authenticated;
GRANT ALL ON public.agent_memory TO service_role;
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads memory"
ON public.agent_memory FOR SELECT
TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "Owner writes memory"
ON public.agent_memory FOR INSERT
TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner updates memory"
ON public.agent_memory FOR UPDATE
TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner deletes memory"
ON public.agent_memory FOR DELETE
TO authenticated USING (owner_id = auth.uid());

-- 4. product_suggestions
CREATE TABLE public.product_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  suggestion_type text NOT NULL CHECK (suggestion_type IN ('title','description','price','category','image','new_product')),
  current_value jsonb,
  suggested_value jsonb NOT NULL,
  reasoning text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','expired')),
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX idx_product_suggestions_seller ON public.product_suggestions(seller_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_suggestions TO authenticated;
GRANT ALL ON public.product_suggestions TO service_role;
ALTER TABLE public.product_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers read own suggestions"
ON public.product_suggestions FOR SELECT
TO authenticated USING (seller_id = auth.uid());

CREATE POLICY "Sellers decide own suggestions"
ON public.product_suggestions FOR UPDATE
TO authenticated USING (seller_id = auth.uid()) WITH CHECK (seller_id = auth.uid());

-- 5. trigger for agent_memory.updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_agent_memory_updated
BEFORE UPDATE ON public.agent_memory
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
