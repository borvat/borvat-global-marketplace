import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";

// P5-HF-001 (2026-07-24): The legacy `place_order` RPC has been revoked from all
// runtime roles pending the Phase 5 canonical commerce order model (M3). The
// checkout flow is disabled server-side so no client path can invoke a
// deprecated/insecure order primitive. This file intentionally contains NO
// behavioural reference to `place_order`, no order writes, no stock decrement,
// and no payment claims.
//
// Do not re-enable this route by grafting the previous client back on. The
// forward-fix is the canonical Phase 5 checkout, not a rollback of the RPC.

const CHECKOUT_ENABLED = false;

const getCheckoutStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { enabled: CHECKOUT_ENABLED, reason: "P5-HF-001" as const };
});

export const Route = createFileRoute("/_authenticated/checkout")({
  head: () => ({
    meta: [
      { title: "Afrekenen tijdelijk offline — Borvat" },
      { name: "description", content: "Afrekenen is tijdelijk uitgeschakeld tijdens onderhoud." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Afrekenen tijdelijk offline — Borvat" },
      { property: "og:description", content: "Afrekenen is tijdelijk uitgeschakeld tijdens onderhoud." },
    ],
  }),
  loader: async () => getCheckoutStatus(),
  component: CheckoutOffline,
});

function CheckoutOffline() {
  const status = Route.useLoaderData();
  if (status.enabled) {
    // Defensive: never reached while the flag is off. Kept so a future re-enable
    // must be an explicit code change reviewed against the owner decision log.
    return null;
  }
  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-muted mb-4">
        <AlertTriangle className="w-7 h-7 text-brand" aria-hidden />
      </div>
      <h1 className="text-2xl font-bold mb-2">Afrekenen is tijdelijk offline</h1>
      <p className="text-muted-foreground mb-6">
        We werken aan een verbeterde checkout. Je winkelmandje blijft bewaard;
        je kunt straks gewoon verder. Er wordt op dit moment geen bestelling
        geplaatst en er wordt niets afgeschreven.
      </p>
      <div className="flex gap-3 justify-center">
        <Link to="/cart" className="px-4 py-2 rounded-lg border border-border text-sm font-medium">
          Terug naar winkelmandje
        </Link>
        <Link to="/" className="px-4 py-2 rounded-lg bg-brand text-brand-foreground text-sm font-medium">
          Verder winkelen
        </Link>
      </div>
      <p className="text-xs text-muted-foreground mt-8">
        Referentie: P5-HF-001
      </p>
    </div>
  );
}
