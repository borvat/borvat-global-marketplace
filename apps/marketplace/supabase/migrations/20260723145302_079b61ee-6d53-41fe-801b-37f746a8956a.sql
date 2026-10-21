CREATE TABLE public.seller_bol_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id_ciphertext text NOT NULL,
  client_secret_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.seller_bol_credentials TO service_role;
ALTER TABLE public.seller_bol_credentials ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated: only service_role (server-side) reads/writes.