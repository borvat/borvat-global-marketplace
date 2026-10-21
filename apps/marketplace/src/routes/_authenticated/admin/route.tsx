import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert } from "lucide-react";
import { ManagerShell, ADMIN_NAV, DemoAction } from "@/components/demo/shell";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Platform administration — Borvat" },
      { name: "description", content: "Read-only cross-merchant inspection." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Platform administration — Borvat" },
      { property: "og:description", content: "Internal read-only inspection." },
    ],
  }),
  component: AdminLayout,
});

const PAGE_META: Record<
  string,
  { title: string; subtitle?: string; classification?: "DEMO DATA" | "REAL READ-ONLY" }
> = {
  "/admin/dashboard": { title: "Platform dashboard", subtitle: "Cross-merchant operational overview" },
  "/admin/companies": { title: "Companies", subtitle: "Merchant legal entities and their stores" },
  "/admin/stores": { title: "Stores", subtitle: "Live merchant stores (real read-only data)", classification: "REAL READ-ONLY" },
  "/admin/seller-applications": {
    title: "Seller applications",
    subtitle: "Verification review queue (real data)",
    classification: "REAL READ-ONLY",
  },
  "/admin/users": { title: "Users & roles", subtitle: "Platform and merchant access" },
  "/admin/products": { title: "Listings", subtitle: "Cross-merchant listing inspection" },
  "/admin/listings": { title: "Draft listings", subtitle: "Channel listing pipeline (real read-only data)" },
  "/admin/orders": { title: "Orders", subtitle: "Cross-merchant order flow" },
  "/admin/shipping": { title: "Shipping configuration", subtitle: "Origins, rate cards, transit and promises" },
  "/admin/quotes": { title: "Manual quotes", subtitle: "Quote families, revisions and acceptance" },
  "/admin/support": { title: "Support oversight", subtitle: "Case load across customer and merchant channels" },
  "/admin/security": { title: "Security & governance", subtitle: "Gates, ACL status and residual risks" },
  "/admin/channels": { title: "Integrations", subtitle: "Borvat Direct and external channel accounts" },
  "/admin/audit": { title: "Audit trail", subtitle: "Append-only platform event log" },
  "/admin/health": { title: "Platform health", subtitle: "Outbox, jobs and gate status" },
};

function AdminLayout() {
  const [state, setState] = useState<"checking" | "ok" | "denied">("checking");
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setState("denied");
        return;
      }
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: u.user.id,
        _role: "admin",
      });
      if (error || !data) {
        setState("denied");
        return;
      }
      setState("ok");
    })();
  }, []);

  if (state === "checking") {
    return <div className="mx-auto max-w-6xl px-4 py-6 text-muted-foreground">Checking access…</div>;
  }
  if (state === "denied") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded border border-border bg-card p-8">
          <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <div className="mb-1 font-semibold">Access denied</div>
          <div className="text-sm text-muted-foreground">
            This area is restricted to Borvat platform administrators.
          </div>
        </div>
      </div>
    );
  }

  const meta =
    PAGE_META[pathname] ??
    Object.entries(PAGE_META).find(([k]) => pathname.startsWith(k + "/"))?.[1] ?? {
      title: "Platform administration",
    };

  return (
    <ManagerShell
      workspace="admin"
      navTitle="Borvat Admin"
      shopName="All merchants"
      nav={ADMIN_NAV}
      title={meta.title}
      subtitle={meta.subtitle}
      classification={meta.classification ?? "DEMO DATA"}
      actions={<DemoAction label="Export view" size="sm" />}
    >
      <Outlet />
    </ManagerShell>
  );
}
