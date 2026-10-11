import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatEur } from "@/lib/format";
import {
  ORDER_STATUS_FLOW,
  STATUS_BADGE,
  STATUS_LABEL,
  type OrderStatus,
} from "@/lib/order-status";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({
    meta: [
      { title: "Mijn bestellingen — Borvat" },
      { name: "description", content: "Volg je bestellingen van betaald tot geleverd." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Mijn bestellingen — Borvat" },
      { property: "og:description", content: "Je aankopen bij Borvat." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Orders,
});

type Item = {
  title: string;
  quantity: number;
  price_cents: number;
  status: OrderStatus;
  tracking_carrier: string | null;
  tracking_code: string | null;
  tracking_url: string | null;
  processing_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
};
type Order = {
  id: string;
  total_cents: number;
  status: string;
  created_at: string;
  order_items: Item[];
};

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Timeline({ item, paidAt }: { item: Item; paidAt: string }) {
  if (item.status === "cancelled") {
    return (
      <div className="text-xs text-destructive">
        Geannuleerd op {fmtDate(item.cancelled_at) ?? "-"}
      </div>
    );
  }
  const stamps: Record<string, string | null> = {
    new: paidAt,
    processing: item.processing_at,
    shipped: item.shipped_at,
    delivered: item.delivered_at,
  };
  const currentIdx = ORDER_STATUS_FLOW.indexOf(item.status as (typeof ORDER_STATUS_FLOW)[number]);
  return (
    <ol className="flex gap-2 mt-2">
      {ORDER_STATUS_FLOW.map((s, i) => {
        const active = i <= currentIdx;
        return (
          <li key={s} className="flex-1 text-center">
            <div
              className={`h-1.5 rounded ${active ? "bg-brand" : "bg-border"}`}
              aria-hidden
            />
            <div
              className={`text-[11px] mt-1 ${active ? "text-foreground font-medium" : "text-muted-foreground"}`}
            >
              {STATUS_LABEL[s]}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {fmtDate(stamps[s]) ?? "—"}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Orders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      // Scope to the signed-in buyer explicitly: admins have a broader RLS read policy.
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id,total_cents,status,created_at,order_items(title,quantity,price_cents,status,tracking_carrier,tracking_code,tracking_url,processing_at,shipped_at,delivered_at,cancelled_at)",
        )
        .eq("user_id", u.user.id)
        .order("created_at", { ascending: false });
      if (error) setError(error.message);
      setOrders((data as unknown as Order[]) ?? []);
    })();
  }, []);

  if (orders === null) {
    return <div className="max-w-4xl mx-auto px-3 py-8 text-muted-foreground" aria-busy="true">Bestellingen laden…</div>;
  }
  if (error) {
    return <div className="max-w-4xl mx-auto px-3 py-8 text-destructive">Bestellingen konden niet worden geladen.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-3 py-4">
      <Link to="/account" className="text-sm text-brand hover:underline">← Mijn account</Link>
      <h1 className="text-2xl font-bold mb-4 mt-2">Mijn bestellingen</h1>
      {orders.length === 0 ? (
        <div className="bg-card border border-border rounded p-8 text-center">
          <p className="text-muted-foreground mb-4">Nog geen bestellingen.</p>
          <Link to="/" className="text-brand hover:underline">
            Begin met winkelen
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <div key={o.id} className="bg-card border border-border rounded p-4">
              <div className="flex justify-between mb-3 flex-wrap gap-2">
                <div>
                  <div className="font-bold">Bestelling #{o.id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">
                    Geplaatst op {fmtDate(o.created_at)}
                  </div>
                </div>
                <div className="text-price font-bold">{formatEur(o.total_cents)}</div>
              </div>
              <div className="divide-y divide-border">
                {o.order_items.map((i, k) => (
                  <div key={k} className="py-3">
                    <div className="flex justify-between gap-3 flex-wrap">
                      <div className="text-sm">
                        <div className="font-medium">{i.title}</div>
                        <div className="text-muted-foreground text-xs">
                          {i.quantity} × {formatEur(i.price_cents)}
                        </div>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded h-fit ${STATUS_BADGE[i.status]}`}
                      >
                        {STATUS_LABEL[i.status]}
                      </span>
                    </div>
                    <Timeline item={i} paidAt={o.created_at} />
                    {(i.tracking_code || i.tracking_url) && (
                      <div className="mt-2 text-xs bg-muted rounded px-2 py-1.5">
                        <span className="text-muted-foreground">Track & trace: </span>
                        {i.tracking_carrier && (
                          <span className="font-medium">{i.tracking_carrier} </span>
                        )}
                        {i.tracking_url ? (
                          <a
                            href={i.tracking_url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-brand hover:underline"
                          >
                            {i.tracking_code ?? "Volg zending"}
                          </a>
                        ) : (
                          <span>{i.tracking_code}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}