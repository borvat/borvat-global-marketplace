import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Headphones, ShieldCheck, Store, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const REVIEW_BUILD = "M1V-0B · owner-review-r2 · 2026-07-26";

export const Route = createFileRoute("/_authenticated/owner-review")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Owner Review — Borvat" },
      { name: "description", content: "Owner-only navigation for the Borvat manager visual alpha." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Owner Review — Borvat" },
      { property: "og:description", content: "Owner-only access to Borvat manager review surfaces." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OwnerReview,
});

type Group = {
  title: string;
  description: string;
  icon: typeof Store;
  accent: string;
  links: { to: string; label: string; params?: Record<string, string> }[];
};

const GROUPS: Group[] = [
  {
    title: "Seller Manager",
    description: "Merchant workspace — dark blue shell, shop switcher, operational tables.",
    icon: Store,
    accent: "bg-ink",
    links: [
      { to: "/seller/manager", label: "Dashboard" },
      { to: "/seller/catalog", label: "Catalog" },
      { to: "/seller/inventory", label: "Inventory" },
      { to: "/seller/order-desk", label: "Orders" },
      { to: "/seller/questions", label: "Customer questions" },
      { to: "/seller/shipping", label: "Shipping" },
      { to: "/seller/quotes", label: "Manual quotes" },
      { to: "/seller/messages", label: "Messages" },
      { to: "/seller/finances", label: "Finances" },
      { to: "/seller/performance", label: "Performance" },
      { to: "/seller/reviews", label: "Reviews" },
      { to: "/seller/analysis", label: "Analysis" },
      { to: "/seller/promotions", label: "Promotions" },
      { to: "/seller/advertising", label: "Advertising" },
      { to: "/seller/settings", label: "Settings" },
    ],
  },
  {
    title: "Borvat Admin",
    description: "Platform workspace — separate shell, cross-merchant oversight and governance.",
    icon: ShieldCheck,
    accent: "bg-ink-soft",
    links: [
      { to: "/admin/dashboard", label: "Dashboard" },
      { to: "/admin/companies", label: "Companies" },
      { to: "/admin/users", label: "Users" },
      { to: "/admin/products", label: "Products" },
      { to: "/admin/orders", label: "Orders" },
      { to: "/admin/shipping", label: "Shipping" },
      { to: "/admin/quotes", label: "Quotes" },
      { to: "/admin/support", label: "Support" },
      { to: "/admin/audit", label: "Audit" },
      { to: "/admin/health", label: "Platform health" },
      { to: "/admin/security", label: "Security" },
    ],
  },
  {
    title: "Customer Service",
    description: "Dual-channel bridge — customer ↔ Borvat and Borvat ↔ merchant stay separated.",
    icon: Headphones,
    accent: "bg-teal-800",
    links: [
      { to: "/support/queue", label: "Case queue" },
      { to: "/support/inbox/customers", label: "Customer inbox" },
      { to: "/support/inbox/merchants", label: "Merchant inbox" },
      { to: "/support/cases/$caseId", label: "Dual-channel case workspace", params: { caseId: "case_1001" } },
    ],
  },
  {
    title: "Customer support preview",
    description: "Buyer-side view — the customer never sees the merchant channel.",
    icon: UserRound,
    accent: "bg-accent",
    links: [{ to: "/account/support", label: "My support conversations" }],
  },
];

function OwnerReview() {
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  const [identity, setIdentity] = useState<{ email: string; role: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setAccess("denied");
        return;
      }
      setIdentity({ email: userData.user.email ?? "Authenticated user", role: "Checking…" });
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: userData.user.id,
        _role: "admin",
      });
      setIdentity({
        email: userData.user.email ?? "Authenticated user",
        role: error ? "Role unavailable" : data ? "Platform admin / Owner" : "Authenticated user",
      });
      setAccess(error || !data ? "denied" : "allowed");
    })();
  }, []);

  if (access === "checking") {
    return <div className="mx-auto max-w-5xl px-4 py-10 text-muted-foreground">Checking access…</div>;
  }

  if (access === "denied") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded border border-border bg-card p-8">
          <div className="mb-1 font-semibold">Owner access required</div>
          <p className="text-sm text-muted-foreground">
            This review hub is restricted to Borvat platform administrators.
          </p>
          {identity ? (
            <div className="mt-4 border-t border-border pt-4 text-left text-xs text-muted-foreground">
              <div><span className="font-semibold text-foreground">Logged-in user:</span> {identity.email}</div>
              <div><span className="font-semibold text-foreground">Detected role:</span> {identity.role}</div>
              <div><span className="font-semibold text-foreground">Build:</span> {REVIEW_BUILD}</div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="bg-ink text-ink-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="text-lg font-bold tracking-tight">
            Borvat<span className="text-accent">®</span>
          </span>
          <span className="h-5 w-px bg-white/20" />
          <span className="text-[13px] font-medium text-ink-foreground/85">Owner visual review</span>
          <span className="ml-auto rounded-full bg-accent/20 px-2.5 py-0.5 text-[11px] font-semibold">
            Demo data · no writes
          </span>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-accent">M1V-0B</p>
          <h1 className="text-2xl font-bold tracking-tight">Owner visual review</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Every screen below is UI-only with frontend fixtures: no database writes, no live carrier or
            channel calls, and every action button is marked as a demo action. Manager surfaces use their
            own application shell — the public storefront header and footer are not rendered there.
          </p>
          <dl className="mt-5 grid overflow-hidden rounded-md border border-border bg-card text-sm shadow-xs sm:grid-cols-3">
            <div className="border-b border-border px-4 py-3 sm:border-b-0 sm:border-r">
              <dt className="text-xs font-semibold uppercase text-muted-foreground">Logged-in user</dt>
              <dd className="mt-1 truncate font-medium">{identity?.email ?? "Authenticated user"}</dd>
            </div>
            <div className="border-b border-border px-4 py-3 sm:border-b-0 sm:border-r">
              <dt className="text-xs font-semibold uppercase text-muted-foreground">Detected role</dt>
              <dd className="mt-1 font-medium">{identity?.role ?? "Platform admin / Owner"}</dd>
            </div>
            <div className="px-4 py-3">
              <dt className="text-xs font-semibold uppercase text-muted-foreground">Build / version</dt>
              <dd className="mt-1 font-medium">{REVIEW_BUILD}</dd>
            </div>
          </dl>
        </header>


        <div className="grid gap-4 lg:grid-cols-2">
          {GROUPS.map((g) => {
            const Icon = g.icon;
            return (
              <section
                key={g.title}
                className="overflow-hidden rounded-md border border-border bg-card shadow-xs"
              >
                <div className={`flex items-center gap-3 px-4 py-3 text-white ${g.accent}`}>
                  <Icon className="h-5 w-5 shrink-0" />
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">{g.title}</h2>
                    <p className="truncate text-[12px] text-white/75">{g.description}</p>
                  </div>
                </div>
                <ul className="grid gap-1 p-3 sm:grid-cols-2">
                  {g.links.map((l) => (
                    <li key={l.to + l.label}>
                      <Link
                        to={l.to}
                        params={l.params}
                        className="block truncate rounded-md border border-border px-2.5 py-2 text-[13px] hover:bg-muted"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

