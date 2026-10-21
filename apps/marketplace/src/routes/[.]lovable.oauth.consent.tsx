import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AuthorizationDetails = {
  client?: { name?: string; logo_uri?: string } | null;
  scopes?: string[];
  redirect_url?: string;
  redirect_to?: string;
};

// Local wrapper for the beta supabase.auth.oauth namespace.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: Error | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: Error | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: Error | null }>;
};
function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.searchStr).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="max-w-md mx-auto px-4 py-10 text-center">
      <h1 className="text-xl font-bold mb-2">Kan verzoek niet laden</h1>
      <p className="text-sm text-muted-foreground">
        {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error: e } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (e) {
      setBusy(false);
      setError(e.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("Geen redirect-URL ontvangen.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "een externe app";

  return (
    <main className="max-w-md mx-auto px-4 py-10">
      <div className="bg-card border border-border rounded-lg p-6">
        <h1 className="text-xl font-bold mb-2">
          Verbind <span className="text-brand">{clientName}</span> met je Borvat-account
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          Hiermee kan {clientName} de tools van Borvat namens jou gebruiken (zoeken,
          bestellingen bekijken, producten beheren als je verkoper bent).
          De rechten van je account (RLS-beleid) blijven volledig van kracht.
        </p>
        {details?.scopes && details.scopes.length > 0 && (
          <ul className="text-xs text-muted-foreground mb-4 space-y-1">
            {details.scopes.map((s: string) => (
              <li key={s}>• {s}</li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive mb-3">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 bg-brand text-brand-foreground rounded py-2 font-medium hover:opacity-95 disabled:opacity-60"
          >
            Toestaan
          </button>
          <button
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 border border-border rounded py-2 hover:bg-muted disabled:opacity-60"
          >
            Weigeren
          </button>
        </div>
      </div>
    </main>
  );
}
