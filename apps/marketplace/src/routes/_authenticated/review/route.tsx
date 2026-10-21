import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert } from "lucide-react";
import { ManagerShell, type NavItem } from "@/components/demo/shell";

export const Route = createFileRoute("/_authenticated/review")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Seller verification — Borvat" },
      { name: "description", content: "Independent seller verification review workspace." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Seller verification — Borvat" },
      { property: "og:description", content: "Independent verification review workspace." },
    ],
  }),
  component: ReviewLayout,
});

const REVIEW_NAV: NavItem[] = [
  { to: "/review/seller-applications", label: "Seller applications" },
];

const PAGE_META: Record<string, { title: string; subtitle?: string }> = {
  "/review/seller-applications": {
    title: "Seller applications",
    subtitle: "Independent verification review (real data)",
  },
};

function ReviewLayout() {
  const [state, setState] = useState<"checking" | "ok" | "denied">("checking");
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setState("denied");
        return;
      }
      const checks = await Promise.all([
        supabase.rpc("has_role", { _user_id: u.user.id, _role: "seller_verification_reviewer" }),
        supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" }),
      ]);
      setState(checks.some((c) => !c.error && c.data) ? "ok" : "denied");
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
            This area is restricted to appointed Borvat seller verification reviewers.
          </div>
        </div>
      </div>
    );
  }

  const meta = PAGE_META[pathname] ?? { title: "Seller verification" };

  return (
    <ManagerShell
      workspace="admin"
      navTitle="Borvat Verification"
      shopName="Independent review"
      nav={REVIEW_NAV}
      title={meta.title}
      subtitle={meta.subtitle}
      classification="REAL READ-ONLY"
    >
      <Outlet />
    </ManagerShell>
  );
}
