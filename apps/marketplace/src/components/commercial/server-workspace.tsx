import { useCallback, useEffect, useState, type FormEvent } from "react";
import { commerceApi, type ServerOrder } from "../../lib/commercial/server-adapter";
import { formatEur } from "../../lib/format";
import { primaryButton } from "./shop/shop-parts";

type Session = { role: "guest" | "seller" | "admin"; seller: string | null };
const nextAction: Record<string, string> = {
  pending_reservation: "reserve",
  reserved: "pick",
  picked: "pack",
  packed: "ship",
  shipped: "invoice",
  invoiced: "receipt",
  receipted: "return",
  returned: "credit",
  credited: "refund",
};
const labels: Record<string, string> = {
  reserve: "Voorraad reserveren",
  pick: "Verzamelen",
  pack: "Verpakken",
  ship: "Leverbon boeken",
  invoice: "Factuur boeken",
  return: "Gedeeltelijke retour ontvangen",
  credit: "Creditnota boeken",
  receipt: "Testontvangst in Accounting boeken",
  refund: "Testterugbetaling in Accounting boeken",
};

function OrderCard({
  order,
  operator,
  reload,
  run,
}: {
  order: ServerOrder;
  operator?: Session;
  reload: () => Promise<void>;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(1);
  return (
    <article
      className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-6"
      data-testid="server-order"
    >
      <div className="flex flex-wrap justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <h2 className="break-all font-mono text-sm font-semibold" data-testid="server-order-id">
            {order.id}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Intl.DateTimeFormat("nl-NL", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Europe/Amsterdam",
            }).format(new Date(order.createdAt))}
          </p>
        </div>
        <strong>{formatEur(order.totalCents)}</strong>
      </div>
      <p className="my-3 rounded-md bg-muted px-3 py-2 text-sm">
        Betaling: <strong>{order.payment.status}</strong> · Simulator, geen betaalprovider
      </p>
      <ul className="divide-y divide-border">
        {order.lines.map((l) => (
          <li key={l.offerId} className="flex justify-between gap-3 py-3 text-sm">
            <span className="min-w-0">
              {l.quantity} × {l.title}
              <span className="block text-xs text-muted-foreground">
                {l.sellerName} · {l.skuId}
              </span>
            </span>
            <span className="shrink-0">{formatEur(l.quantity * l.unitPriceCents)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {order.portions.map((p) => (
          <section
            key={p.sellerId}
            className="min-w-0 space-y-3 rounded-lg border border-border p-4"
          >
            <h3 className="font-semibold">
              {p.sellerId}{" "}
              <span className="text-sm font-normal text-muted-foreground">· {p.company}</span>
            </h3>
            <p className="text-sm" data-testid="server-portion-state">
              Status: <strong>{p.state}</strong>
            </p>
            <dl className="space-y-2 text-xs">
              {Object.entries(p.references).flatMap(([action, refs]) =>
                Object.entries(refs).map(([kind, value]) => (
                  <div className="grid gap-1 sm:grid-cols-[7rem_1fr]" key={action + kind}>
                    <dt className="text-muted-foreground">
                      {action} · {kind}
                    </dt>
                    <dd className="break-all font-mono">{String(value)}</dd>
                  </div>
                )),
              )}
            </dl>
            {operator && operator.role !== "guest" && nextAction[p.state] && (
              <div className="space-y-3 border-t border-border pt-3">
                {p.state === "receipted" && (
                  <label className="block text-sm">
                    Aantal retour
                    <input
                      aria-label={`Aantal retour ${p.sellerId}`}
                      className="mt-1 block h-10 w-24 rounded-md border bg-background px-3"
                      type="number"
                      min={1}
                      max={order.lines.find((l) => l.sellerId === p.sellerId)?.quantity ?? 1}
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                    />
                  </label>
                )}
                <button
                  className={primaryButton + " w-full whitespace-normal"}
                  onClick={() =>
                    void run(async () => {
                      const action = nextAction[p.state];
                      const result = await commerceApi<{ command: { state: string } }>(
                        `orders/${order.id}/action`,
                        {
                          sellerId: p.sellerId,
                          action,
                          payload:
                            action === "return"
                              ? {
                                  quantity,
                                  lineId: order.lines.find((l) => l.sellerId === p.sellerId)?.skuId,
                                }
                              : {},
                        },
                      );
                      if (result.command.state !== "completed")
                        throw new Error(
                          result.command.state === "unknown"
                            ? "Uitkomst nog onbekend. Controleer opnieuw met dezelfde actie; niet opnieuw bestellen."
                            : "De gekoppelde dienst heeft de actie geweigerd.",
                        );
                      await reload();
                    })
                  }
                >
                  {labels[nextAction[p.state]]}
                </button>
              </div>
            )}
          </section>
        ))}
      </div>
      {operator?.role === "admin" &&
        order.payment.status === "not_started" &&
        order.portions.every((p) => p.state === "reserved") && (
          <button
            className={primaryButton + " mt-4"}
            onClick={() =>
              void run(async () => {
                await commerceApi(`orders/${order.id}/payment-simulator`, {
                  eventId: order.id + "-test-payment",
                  reference: "SIMULATED-" + order.id,
                  status: "succeeded",
                });
                await reload();
              })
            }
          >
            Betaling simuleren · geen provider
          </button>
        )}
    </article>
  );
}

export function ServerOrders({ orderId }: { orderId?: string | null }) {
  const [orders, setOrders] = useState<ServerOrder[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const result = orderId
      ? [await commerceApi<ServerOrder>(`orders/${orderId}`)]
      : (await commerceApi<{ orders: ServerOrder[] }>("orders")).orders;
    setOrders(result);
  }, [orderId]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void (
      orderId
        ? commerceApi<ServerOrder>(`orders/${orderId}`).then((o) => [o])
        : commerceApi<{ orders: ServerOrder[] }>("orders").then((r) => r.orders)
    )
      .then((value) => {
        if (active) setOrders(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orderId]);
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden mislukt");
    }
  };
  return (
    <div className="space-y-5">
      <h1 tabIndex={-1} className="text-2xl font-bold">
        {orderId ? "Opgeslagen testorder" : "Mijn bestellingen"}
      </h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Deze order is op de testserver opgeslagen. Alleen bevestigde native referenties verschijnen
        hieronder. Een opgeslagen order bevestigt nog geen voorraad, betaling of verzending.
      </p>
      <button className="rounded-md border px-4 py-2 text-sm" onClick={() => void run(reload)}>
        Status vernieuwen
      </button>
      {loading && <p role="status">Laden…</p>}
      {error && (
        <p role="alert" className="rounded-lg border border-destructive p-3">
          {error}
        </p>
      )}
      {!loading && !error && orders.length === 0 && (
        <p className="rounded-xl border border-dashed p-8">
          Nog geen bestellingen voor deze sessie.
        </p>
      )}
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} run={run} reload={reload} />
      ))}
    </div>
  );
}

export function ServerWorkspace() {
  const [session, setSession] = useState<Session | null>(null),
    [orders, setOrders] = useState<ServerOrder[]>([]);
  const [sellers, setSellers] = useState<{ id: string; name: string; state: string }[]>([]),
    [audit, setAudit] = useState<
      { seq: number; actor: string; action: string; resource: string; at: number }[]
    >([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    const s = await commerceApi<Session>("session");
    setSession(s);
    if (s.role !== "guest")
      setOrders((await commerceApi<{ orders: ServerOrder[] }>("orders")).orders);
    else setOrders([]);
    if (s.role === "admin") {
      const data = await commerceApi<{ sellers: typeof sellers; audit: typeof audit }>("admin");
      setSellers(data.sellers);
      setAudit(data.audit);
    }
  }, []);
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Actie mislukt");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void reload().catch((e) => setError(e.message));
  }, [reload]);
  const login = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void run(async () => {
      await commerceApi("login", { email: data.get("email"), password: data.get("password") });
      await reload();
    });
  };
  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-6 px-4 py-8 sm:px-6" aria-busy={busy}>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="text-sm font-semibold text-accent-foreground">BORVAT · native test</p>
          <h1 tabIndex={-1} className="mt-1 text-2xl font-bold sm:text-3xl">
            Verkoper & beheer
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Beveiligde serverwerkruimte · voorraad en documenten via Surooh. Betaling is een
            afzonderlijke simulator; er is geen vervoerder aangesloten.
          </p>
        </div>
        {session && session.role !== "guest" && (
          <button
            className="rounded-md border px-4 py-2 text-sm"
            onClick={() =>
              void run(async () => {
                await commerceApi("logout", {});
                setSession(null);
                setOrders([]);
                setSellers([]);
                setAudit([]);
              })
            }
          >
            Uitloggen
          </button>
        )}
      </header>
      {error && (
        <p role="alert" className="rounded-lg border border-destructive p-4 text-sm">
          {error}
        </p>
      )}
      {!session || session.role === "guest" ? (
        <form
          onSubmit={login}
          className="mx-auto max-w-md space-y-4 rounded-xl border border-border bg-card p-6"
        >
          <h2 className="text-lg font-bold">Inloggen</h2>
          <label className="block text-sm">
            E-mailadres
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              className="mt-1 h-11 w-full rounded-md border bg-background px-3"
            />
          </label>
          <label className="block text-sm">
            Wachtwoord
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 h-11 w-full rounded-md border bg-background px-3"
            />
          </label>
          <button disabled={busy} className={primaryButton + " w-full"}>
            Inloggen
          </button>
          <p className="text-xs text-muted-foreground">
            Alleen afzonderlijk aangemaakte testaccounts. De browser kan geen rol of bedrijf kiezen.
          </p>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap justify-between gap-3">
            <p className="text-sm">
              Aangemeld als <strong>{session.role}</strong>
              {session.seller ? ` · ${session.seller}` : ""}
            </p>
            <button
              className="rounded-md border px-4 py-2 text-sm"
              onClick={() => void run(reload)}
            >
              Vernieuwen
            </button>
          </div>
          {session.role === "admin" && (
            <section className="space-y-3 rounded-xl border bg-card p-5">
              <h2 className="text-lg font-bold">Verkopers beoordelen</h2>
              {sellers.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-t py-3"
                >
                  <span className="text-sm">
                    {s.name} · {s.state}
                  </span>
                  <button
                    disabled={busy}
                    className="rounded-md border px-3 py-2 text-sm"
                    onClick={() =>
                      void run(async () => {
                        await commerceApi("admin/sellers", {
                          seller: s.id,
                          state: s.state === "approved" ? "suspended" : "approved",
                        });
                        await reload();
                      })
                    }
                  >
                    {s.state === "approved" ? "Opschorten" : "Goedkeuren"}
                  </button>
                </div>
              ))}
            </section>
          )}
          <section className="space-y-4">
            <h2 className="text-xl font-bold">Orders · {orders.length}</h2>
            {!orders.length && (
              <p className="rounded-xl border border-dashed p-8 text-sm text-muted-foreground">
                Nog geen orders binnen je bevoegdheid.
              </p>
            )}
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                operator={session}
                reload={reload}
                run={run}
              />
            ))}
          </section>
          {session.role === "admin" && (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-3 text-lg font-bold">Audit · laatste 100 acties</h2>
              <ul className="divide-y">
                {audit.map((event) => (
                  <li key={event.seq} className="break-words py-2 text-xs">
                    <strong>{event.action}</strong> · {event.actor}
                    <span className="block break-all text-muted-foreground">{event.resource}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
