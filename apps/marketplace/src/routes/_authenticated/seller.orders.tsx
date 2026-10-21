import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { formatEur } from "@/lib/format";
import { toast } from "sonner";
import { STATUS_BADGE, STATUS_LABEL, type OrderStatus } from "@/lib/order-status";
import { updateOrderItemStatus } from "@/lib/order-status.functions";


export const Route = createFileRoute("/_authenticated/seller/orders")({
  beforeLoad: () => {
    throw redirect({ to: "/seller/order-desk" });
  },
  head: () => ({
    meta: [
      { title: "Inkomende bestellingen — marktje" },
      { name: "description", content: "Verwerk bestellingen en voeg verzendinformatie toe." },
      { property: "og:title", content: "Inkomende bestellingen — marktje" },
      { property: "og:description", content: "Nieuwe orders om te verzenden." },
    ],
  }),
  component: SellerOrders,
});

type OI = {
  id: string;
  title: string;
  quantity: number;
  price_cents: number;
  status: OrderStatus;
  order_id: string;
  tracking_carrier: string | null;
  tracking_code: string | null;
  tracking_url: string | null;
  orders: { created_at: string; shipping_address: unknown } | null;
};

const CARRIERS = ["PostNL", "DHL", "DPD", "UPS", "GLS", "Anders"];

function SellerOrders() {
  const [items, setItems] = useState<OI[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<{ carrier: string; code: string; url: string }>({
    carrier: "PostNL",
    code: "",
    url: "",
  });

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data } = await supabase
      .from("order_items")
      .select(
        "id,title,quantity,price_cents,status,order_id,tracking_carrier,tracking_code,tracking_url,orders(created_at,shipping_address)",
      )
      .eq("seller_id", u.user.id)
      .order("id", { ascending: false });
    setItems((data as unknown as OI[]) ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  const updateFn = useServerFn(updateOrderItemStatus);

  async function updateStatus(id: string, status: OrderStatus) {
    if (status === "processing" || status === "shipped" || status === "delivered" || status === "cancelled") {
      try {
        await updateFn({ data: { itemId: id, status } });
        toast.success(`Status: ${STATUS_LABEL[status]}`);
        load();
        return;
      } catch (e: any) {
        return toast.error(e.message ?? "Could not update status");
      }
    }
    const { error } = await supabase.from("order_items").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Status: ${STATUS_LABEL[status]}`);
    load();
  }

  function beginShip(i: OI) {
    setEditing(i.id);
    setForm({
      carrier: i.tracking_carrier ?? "PostNL",
      code: i.tracking_code ?? "",
      url: i.tracking_url ?? "",
    });
  }

  async function saveShip(id: string) {
    if (!form.code.trim()) return toast.error("Track & trace code is verplicht");
    try {
      await updateFn({
        data: {
          itemId: id,
          status: "shipped",
          tracking: {
            carrier: form.carrier,
            code: form.code.trim(),
            url: form.url.trim() || null,
          },
        },
      });
      toast.success("Verzonden — e-mail met track & trace verstuurd");
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Could not send");
    }
  }


  return (
    <div className="max-w-4xl mx-auto px-3 py-4">
      <h1 className="text-2xl font-bold mb-4">Inkomende bestellingen</h1>
      {items.length === 0 ? (
        <div className="bg-card border border-border rounded p-8 text-center text-muted-foreground">
          Nog geen bestellingen.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((i) => {
            const addr = i.orders?.shipping_address as
              | { name?: string; street?: string; zip?: string; city?: string }
              | null;
            const isEditing = editing === i.id;
            return (
              <div key={i.id} className="bg-card border border-border rounded p-3">
                <div className="flex justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-medium">{i.title}</div>
                    <div className="text-sm text-muted-foreground">
                      {i.quantity} × {formatEur(i.price_cents)} · #{i.order_id.slice(0, 8)}
                    </div>
                    {addr && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Naar: {addr.name}, {addr.street}, {addr.zip} {addr.city}
                      </div>
                    )}
                    {(i.tracking_code || i.tracking_carrier) && !isEditing && (
                      <div className="text-xs mt-1">
                        <span className="text-muted-foreground">T&T: </span>
                        {i.tracking_carrier} {i.tracking_code}
                        {i.tracking_url && (
                          <>
                            {" · "}
                            <a
                              href={i.tracking_url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="text-brand hover:underline"
                            >
                              link
                            </a>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-start gap-2">
                    <span className={`text-xs px-2 py-1 rounded ${STATUS_BADGE[i.status]}`}>
                      {STATUS_LABEL[i.status]}
                    </span>
                  </div>
                </div>

                {isEditing ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-3 border-t border-border pt-3">
                    <select
                      value={form.carrier}
                      onChange={(e) => setForm({ ...form, carrier: e.target.value })}
                      className="border border-input rounded px-2 py-1.5 text-sm bg-background"
                    >
                      {CARRIERS.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                    <input
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      placeholder="Track & trace code"
                      className="border border-input rounded px-2 py-1.5 text-sm bg-background"
                    />
                    <input
                      value={form.url}
                      onChange={(e) => setForm({ ...form, url: e.target.value })}
                      placeholder="Volg-link (optioneel)"
                      className="border border-input rounded px-2 py-1.5 text-sm bg-background"
                    />
                    <div className="sm:col-span-3 flex gap-2 justify-end">
                      <button
                        onClick={() => setEditing(null)}
                        className="text-sm px-3 py-1.5 rounded border border-input"
                      >
                        Annuleer
                      </button>
                      <button
                        onClick={() => saveShip(i.id)}
                        className="text-sm bg-brand text-brand-foreground px-3 py-1.5 rounded"
                      >
                        Opslaan & markeer verzonden
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2 justify-end">
                    {i.status === "new" && (
                      <button
                        onClick={() => updateStatus(i.id, "processing")}
                        className="text-xs px-3 py-1 rounded border border-input"
                      >
                        Start verwerking
                      </button>
                    )}
                    {(i.status === "new" || i.status === "processing") && (
                      <button
                        onClick={() => beginShip(i)}
                        className="text-xs bg-brand text-brand-foreground px-3 py-1 rounded"
                      >
                        Verzenden…
                      </button>
                    )}
                    {i.status === "shipped" && (
                      <>
                        <button
                          onClick={() => beginShip(i)}
                          className="text-xs px-3 py-1 rounded border border-input"
                        >
                          Bewerk T&T
                        </button>
                        <button
                          onClick={() => updateStatus(i.id, "delivered")}
                          className="text-xs bg-success text-success-foreground px-3 py-1 rounded"
                        >
                          Markeer geleverd
                        </button>
                      </>
                    )}
                    {i.status !== "delivered" && i.status !== "cancelled" && (
                      <button
                        onClick={() => updateStatus(i.id, "cancelled")}
                        className="text-xs px-3 py-1 rounded border border-destructive text-destructive"
                      >
                        Annuleer
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
