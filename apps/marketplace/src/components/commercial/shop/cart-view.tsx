import { useShopCopy, useShopMoney } from "./i18n";
import { useShopText } from "./i18n";
import { useState } from "react";
import { ShoppingBag, Trash2, ArrowRight } from "lucide-react";
import { formatEur } from "../../../lib/format";
import {
  lineTotalCents,
  maxOrderable,
  orderTotals,
  SHIPPING_METHODS,
} from "../../../lib/commercial/shop-pricing";
import type { DemoSnapshot } from "../../../lib/commercial/demo-adapter";
import { LocalLink, useShop } from "./shop-context";
import { ProductMedia, QuantityStepper, TotalsBlock, primaryButton } from "./shop-parts";
import { nl } from "./nl";

export function cartLines(snapshot: DemoSnapshot) {
  return snapshot.cart.map((line) => {
    const offer = snapshot.offers.find((o) => o.id === line.offerId);
    const product = snapshot.products.find((p) => p.id === offer?.productId);
    const available = offer && offer.state === "published" ? offer.availabilityExample : 0;
    const issue =
      !offer || !product || offer.state !== "published"
        ? "Dit artikel is niet meer beschikbaar. Verwijder het uit je mandje."
        : available < 1
          ? "Dit artikel is momenteel niet leverbaar."
          : line.quantity > maxOrderable(available)
            ? `Er zijn nog maar ${maxOrderable(available)} beschikbaar. Pas het aantal aan.`
            : "";
    const unitPriceCents = offer?.priceCents ?? 0;
    return {
      ...line,
      offer,
      product,
      issue,
      unitPriceCents,
      max: maxOrderable(available),
      lineTotal: lineTotalCents(unitPriceCents, line.quantity),
    };
  });
}

export function RestoringState() {
  const copy = useShopCopy();
  return (
    <p role="status" data-testid="restoring" className="py-10 text-center text-muted-foreground">
      {copy("Je gegevens worden geladen…")}{" "}
    </p>
  );
}

export function CartView() {
  const copy = useShopCopy();
  const formatEur = useShopMoney();
  const nl = useShopText();
  const { adapter, snapshot, link, navigate } = useShop();
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (!snapshot.restored) return <RestoringState />;
  const lines = cartLines(snapshot);
  const change = (offerId: string, quantity: number) => {
    try {
      adapter.setQuantity(offerId, quantity);
      setErrors((e) => ({ ...e, [offerId]: "" }));
    } catch (cause) {
      setErrors((e) => ({
        ...e,
        [offerId]: cause instanceof Error ? cause.message : "Aanpassen niet gelukt.",
      }));
    }
  };
  if (!lines.length)
    return (
      <div
        data-testid="empty-cart"
        className="mx-auto flex max-w-md flex-col items-center py-12 text-center"
      >
        <ShoppingBag aria-hidden className="h-14 w-14 text-muted-foreground" />
        <h1 tabIndex={-1} className="mt-4 text-2xl font-bold">
          {nl.emptyCart}
        </h1>
        <p className="mt-2 text-muted-foreground">{nl.emptyCartHint}</p>
        <LocalLink
          href={link("/discover")}
          data-testid="empty-cart-continue"
          className={`${primaryButton} mt-6`}
        >
          {nl.backToShop}
        </LocalLink>
      </div>
    );
  const blocked = lines.some((l) => l.issue);
  const totals = orderTotals(lines, "standaard");
  const free = SHIPPING_METHODS.standaard.freeFromCents;
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  return (
    <div className="space-y-6">
      <h1 tabIndex={-1} className="text-2xl font-bold sm:text-3xl">
        {nl.cart}{" "}
        <span className="text-base font-normal text-muted-foreground">
          ({count} {count === 1 ? "artikel" : "artikelen"})
        </span>
      </h1>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <ul className="space-y-3" aria-label="Artikelen in je mandje">
          {lines.map((l) => (
            <li
              key={l.offerId}
              data-testid={`cart-line-${l.offerId}`}
              className="flex gap-3 rounded-xl border border-border bg-card p-3 sm:gap-4 sm:p-4"
            >
              <ProductMedia
                seed={l.product?.id ?? l.offerId}
                title={l.product?.title ?? ""}
                size="sm"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <div className="min-w-0">
                    {l.product ? (
                      <LocalLink
                        href={link(`/product/${encodeURIComponent(l.product.id)}`, {
                          offer: l.offerId,
                          sku: l.offer?.skuId ?? null,
                        })}
                        className="font-semibold hover:underline"
                      >
                        {l.product.title}
                      </LocalLink>
                    ) : (
                      <span className="font-semibold">{copy("Onbekend artikel")}</span>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {l.offer?.variant} · {nl.perPack(l.offer?.packQuantity ?? 1)} ·{" "}
                      {l.offer?.sellerName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatEur(l.unitPriceCents)} {copy("per stuk")}{" "}
                    </p>
                  </div>
                  <p className="font-bold" data-testid={`cart-line-total-${l.offerId}`}>
                    {formatEur(l.lineTotal)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <QuantityStepper
                    id={`cart-qty-${l.offerId}`}
                    label={`${nl.quantity} · ${l.product?.title ?? ""} · ${l.offer?.variant ?? ""} · ${l.offer?.sellerName ?? ""}`}
                    value={l.quantity}
                    max={Math.max(l.max, 1)}
                    disabled={!l.offer || l.max < 1}
                    onChange={(v) => change(l.offerId, v)}
                  />
                  <button
                    type="button"
                    data-testid={`cart-remove-${l.offerId}`}
                    onClick={() => change(l.offerId, 0)}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-2 text-sm text-muted-foreground hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <Trash2 aria-hidden className="h-4 w-4" /> {nl.remove}
                    <span className="sr-only">
                      {" "}
                      {l.product?.title} · {l.offer?.variant} · {l.offer?.sellerName}
                    </span>
                  </button>
                </div>
                {(errors[l.offerId] || l.issue) && (
                  <p
                    role="alert"
                    data-testid={`cart-line-error-${l.offerId}`}
                    className="text-sm text-destructive"
                  >
                    {errors[l.offerId] || l.issue}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
        <aside
          aria-label={nl.overview}
          className="space-y-4 rounded-xl border border-border bg-card p-5 lg:sticky lg:top-24"
        >
          <h2 className="text-lg font-bold">{nl.overview}</h2>
          <TotalsBlock lines={lines} method="standaard" prefix="cart" />
          <p className="text-sm" data-testid="free-shipping-hint">
            {totals.subtotalCents >= free
              ? nl.freeShippingReached
              : nl.freeShippingLeft(formatEur(free - totals.subtotalCents))}
          </p>
          <p className="text-xs text-muted-foreground">
            {copy("Express (")}
            {formatEur(SHIPPING_METHODS.express.priceCents)}
            {copy(") kies je bij het bestellen.")}{" "}
          </p>
          <button
            type="button"
            data-testid="cart-checkout-button"
            className={`${primaryButton} w-full`}
            disabled={blocked}
            onClick={() => navigate(link("/afrekenen"))}
          >
            {nl.toCheckout} <ArrowRight aria-hidden className="h-4 w-4" />
          </button>
          {blocked && (
            <p className="text-sm text-destructive" data-testid="cart-blocked">
              {copy("Los eerst de meldingen bij je artikelen op.")}{" "}
            </p>
          )}
          <LocalLink
            href={link("/discover")}
            className="block text-center text-sm underline underline-offset-4"
          >
            {nl.backToShop}
          </LocalLink>
        </aside>
      </div>
    </div>
  );
}
