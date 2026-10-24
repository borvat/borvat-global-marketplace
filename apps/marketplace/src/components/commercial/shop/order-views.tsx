import { CheckCircle2, Package } from "lucide-react";
import { formatEur } from "../../../lib/format";
import type { DemoOrder } from "../../../lib/commercial/demo-adapter";
import { LocalLink, useShop } from "./shop-context";
import { RestoringState } from "./cart-view";
import { TestNotice, primaryButton } from "./shop-parts";
import { nl } from "./nl";

const dateFormat = new Intl.DateTimeFormat("nl-NL", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Amsterdam",
});
const itemCount = (o: DemoOrder) => o.lines.reduce((s, l) => s + l.quantity, 0);
const paymentLabel = (p: DemoOrder["payment"]) =>
  p === "test-ideal"
    ? nl.testIdeal
    : p === "test-card"
      ? nl.testCard
      : "Geen betaling (demo-aanvraag)";

function OrderDetails({ order }: { order: DemoOrder }) {
  const c = order.checkout;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section aria-label="Artikelen" className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-lg font-bold">Artikelen</h2>
        <ul className="divide-y divide-border" data-testid="order-lines">
          {order.lines.map((l) => (
            <li key={l.offerId} className="flex justify-between gap-3 py-3 text-sm">
              <span className="min-w-0">
                <span className="font-medium">
                  {l.quantity} × {l.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {l.variant} · {l.sellerName} · {formatEur(l.unitPriceCents)} per stuk
                </span>
              </span>
              <span className="shrink-0 font-semibold">
                {formatEur(l.unitPriceCents * l.quantity)}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <aside className="space-y-4 rounded-xl border border-border bg-card p-5">
        <dl className="space-y-2 text-sm">
          {c && (
            <>
              <div className="flex justify-between">
                <dt>{nl.subtotal}</dt>
                <dd data-testid="order-subtotal">{formatEur(c.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>
                  {nl.shipping} ({c.shippingMethod === "express" ? nl.express : nl.standard})
                </dt>
                <dd data-testid="order-shipping">
                  {c.shippingCents === 0 ? nl.free : formatEur(c.shippingCents)}
                </dd>
              </div>
            </>
          )}
          <div className="flex justify-between border-t border-border pt-3 text-base font-bold">
            <dt>{nl.total}</dt>
            <dd data-testid="order-total">{formatEur(order.totalCents)}</dd>
          </div>
          {c && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <dt>{nl.vatIncluded}</dt>
              <dd>{formatEur(c.vatIncludedCents)}</dd>
            </div>
          )}
        </dl>
        <p className="text-sm">
          <span className="font-semibold">Betaalmethode:</span>{" "}
          <span data-testid="order-payment">{paymentLabel(order.payment)}</span> — niet uitgevoerd
        </p>
        {c && (
          <div className="text-sm" data-testid="order-address">
            <p className="font-semibold">{nl.deliveryTo}</p>
            <p>
              {c.firstName} {c.lastName}
            </p>
            <p>
              {c.street} {c.houseNumber}
              {c.addition ? ` ${c.addition}` : ""}
            </p>
            <p>
              {c.postalCode} {c.city}, {c.country === "NL" ? nl.nl : nl.be}
            </p>
            <p className="text-muted-foreground">{c.email}</p>
          </div>
        )}
      </aside>
    </div>
  );
}

export function ConfirmationView() {
  const { snapshot, route, link } = useShop();
  if (!snapshot.restored) return <RestoringState />;
  const order = snapshot.orders.find((o) => o.id === route.orderId);
  if (!order)
    return (
      <div data-testid="order-not-found" className="space-y-3 py-10 text-center">
        <h1 tabIndex={-1} className="text-2xl font-bold">
          {nl.orderNotFound}
        </h1>
        <LocalLink href={link("/requests")}>{nl.orders}</LocalLink>
      </div>
    );
  return (
    <div className="space-y-6" data-testid="order-confirmation">
      <div className="flex items-start gap-4 rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-50">
        <CheckCircle2 aria-hidden className="h-8 w-8 shrink-0 text-emerald-600" />
        <div>
          <h1 tabIndex={-1} className="text-2xl font-bold">
            {order.checkout ? nl.confirmationTitle : "Demo-aanvraag"}
          </h1>
          <p className="mt-1">
            {nl.orderNumber}:{" "}
            <strong data-testid="order-id" className="font-mono">
              {order.id}
            </strong>
          </p>
          <p className="text-sm opacity-80">
            Geplaatst op {dateFormat.format(new Date(order.createdAt))}
          </p>
        </div>
      </div>
      <TestNotice testId="confirmation-test-notice" />
      <OrderDetails order={order} />
      <LocalLink
        href={link("/discover")}
        data-testid="confirmation-continue"
        className={primaryButton}
      >
        {nl.backToShop}
      </LocalLink>
    </div>
  );
}

export function OrdersView() {
  const { snapshot, link } = useShop();
  if (!snapshot.restored) return <RestoringState />;
  const orders = [...snapshot.orders].reverse();
  return (
    <div className="space-y-6">
      <h1 tabIndex={-1} className="text-2xl font-bold sm:text-3xl">
        {nl.orders}
      </h1>
      <p className="text-sm text-muted-foreground">
        Alleen opgeslagen in deze browser. Er is niets betaald of verzonden.
      </p>
      {!orders.length && (
        <div
          data-testid="orders-empty"
          className="flex flex-col items-center rounded-xl border border-dashed border-border p-10 text-center"
        >
          <Package aria-hidden className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3">{nl.noOrders}</p>
          <LocalLink href={link("/discover")} className={`${primaryButton} mt-4`}>
            {nl.backToShop}
          </LocalLink>
        </div>
      )}
      <ul className="space-y-3">
        {orders.map((o) => (
          <li
            key={o.id}
            data-testid={`order-row-${o.id}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
          >
            <div>
              <LocalLink
                href={link(`/bestelling/${encodeURIComponent(o.id)}`)}
                className="font-mono font-semibold underline-offset-4 hover:underline"
              >
                {o.id}
              </LocalLink>
              <p className="text-sm text-muted-foreground">
                {dateFormat.format(new Date(o.createdAt))} · {itemCount(o)}{" "}
                {itemCount(o) === 1 ? "artikel" : "artikelen"} ·{" "}
                {o.checkout ? "Testbestelling" : "Demo-aanvraag"}
              </p>
            </div>
            <p className="font-bold">{formatEur(o.totalCents)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
