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
      <div data-testid="empty-cart" className="brv-shell flex flex-col items-center py-16 text-center">
        <ShoppingBag aria-hidden className="h-12 w-12 text-muted-foreground" />
        <h1 tabIndex={-1} className="mt-4 text-[22px] font-bold">
          {nl.emptyCart}
        </h1>
        <p className="mt-2 max-w-sm text-[13.5px] text-muted-foreground">{nl.emptyCartHint}</p>
        <LocalLink
          href={link("/discover")}
          data-testid="empty-cart-continue"
          className="brv-cta mt-6 w-auto px-6"
        >
          {nl.backToShop}
        </LocalLink>
      </div>
    );

  const blocked = lines.some((l) => l.issue);
  const totals = orderTotals(lines, "standaard");
  const free = SHIPPING_METHODS.standaard.freeFromCents;
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  // Seller grouping. The group subtotals are summed from the same line totals the
  // pricing model uses, so the cart cannot show two different totals for one order.
  const groups = new Map<string, { seller: string; lines: typeof lines; subtotal: number }>();
  for (const line of lines) {
    const seller = line.offer?.sellerName ?? "Onbekende verkoper";
    const group = groups.get(seller) ?? { seller, lines: [], subtotal: 0 };
    group.lines.push(line);
    group.subtotal += line.lineTotal;
    groups.set(seller, group);
  }
  const groupList = [...groups.values()];
  const groupedSum = groupList.reduce((sum, group) => sum + group.subtotal, 0);

  return (
    <div className="brv-shell space-y-4 py-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <h1 tabIndex={-1} className="text-[24px] font-black leading-tight">
          {nl.cart}{" "}
          <span className="text-[13px] font-normal text-muted-foreground">
            {count} {copy(count === 1 ? "artikel" : "artikelen")} · {groupList.length}{" "}
            {copy(groupList.length === 1 ? "verkoper" : "verkopers")}
          </span>
        </h1>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {groupList.map((group) => (
            <section
              key={group.seller}
              data-testid={`cart-seller-${group.seller}`}
              className="overflow-hidden rounded-md border border-border bg-card"
            >
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2">
                <p className="text-[12.5px] text-muted-foreground">
                  Verkocht door <b className="text-foreground">{group.seller}</b>
                </p>
                <p className="text-[12px] text-success">{nl.deliveryShort}</p>
              </header>
              <ul aria-label={`Artikelen van ${group.seller}`}>
                {group.lines.map((l) => (
                  <li
                    key={l.offerId}
                    data-testid={`cart-line-${l.offerId}`}
                    className="flex gap-3 border-b border-border p-3 last:border-b-0"
                  >
                    <div className="w-20 shrink-0">
                      <ProductMedia
                        seed={l.product?.id ?? l.offerId}
                        title={l.product?.title ?? ""}
                        size="sm"
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap justify-between gap-2">
                        <div className="min-w-0">
                          {l.product ? (
                            <LocalLink
                              href={link(`/product/${encodeURIComponent(l.product.id)}`, {
                                offer: l.offerId,
                                sku: l.offer?.skuId ?? null,
                              })}
                              className="brv-title-link"
                            >
                              {l.product.title}
                            </LocalLink>
                          ) : (
                            <span className="font-semibold">{copy("Onbekend artikel")}</span>
                          )}
                          <p className="mt-1 text-[12px] text-muted-foreground">
                            {l.offer?.variant} · {nl.perPack(l.offer?.packQuantity ?? 1)} ·{" "}
                            {formatEur(l.unitPriceCents)} {copy("per stuk")}
                          </p>
                        </div>
                        <p
                          className="brv-num text-[15px] font-bold"
                          data-testid={`cart-line-total-${l.offerId}`}
                        >
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
                          className="inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-[12.5px] text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 aria-hidden className="h-4 w-4" /> {nl.remove}
                          <span className="sr-only">
                            {l.product?.title} · {l.offer?.variant} · {l.offer?.sellerName}
                          </span>
                        </button>
                      </div>
                      {(errors[l.offerId] || l.issue) && (
                        <p
                          role="alert"
                          data-testid={`cart-line-error-${l.offerId}`}
                          className="text-[12.5px] text-destructive"
                        >
                          {errors[l.offerId] || l.issue}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <footer className="flex items-center justify-between bg-surface px-3 py-2 text-[12.5px]">
                <span className="text-muted-foreground">Subtotaal {group.seller}</span>
                <span
                  className="brv-num font-semibold"
                  data-testid={`cart-seller-subtotal-${group.seller}`}
                >
                  {formatEur(group.subtotal)}
                </span>
              </footer>
            </section>
          ))}

          {groupList.length > 1 && (
            <p className="text-[12.5px] text-muted-foreground">
              Je bestelling bestaat uit {groupList.length} zendingen. Elke verkoper verzendt
              afzonderlijk; je ontvangt per zending een bevestiging.
            </p>
          )}
        </div>

        <aside
          aria-label={nl.overview}
          className="space-y-3 rounded-md border border-border bg-card p-4 lg:sticky lg:top-[152px]"
        >
          <h2 className="text-[16px] font-bold">{nl.overview}</h2>
          <TotalsBlock lines={lines} method="standaard" prefix="cart" />
          {groupedSum !== totals.subtotalCents && (
            <p
              role="alert"
              className="text-[12px] text-destructive"
              data-testid="cart-reconcile-warning"
            >
              {copy("De artikelsom wijkt af van het ordertotaal.")}
            </p>
          )}
          <p className="border-t border-border pt-3 text-[12.5px]" data-testid="free-shipping-hint">
            {totals.subtotalCents >= free
              ? nl.freeShippingReached
              : nl.freeShippingLeft(formatEur(free - totals.subtotalCents))}
          </p>
          <button
            type="button"
            data-testid="cart-checkout-button"
            className="brv-cta w-full"
            disabled={blocked}
            onClick={() => navigate(link("/afrekenen"))}
          >
            {nl.toCheckout} <ArrowRight aria-hidden className="h-4 w-4" />
          </button>
          {blocked && (
            <p className="text-[12.5px] text-destructive" data-testid="cart-blocked">
              {copy("Los eerst de meldingen bij je artikelen op.")}
            </p>
          )}
          <LocalLink
            href={link("/discover")}
            className="block text-center text-[12.5px] underline underline-offset-4"
          >
            {nl.backToShop}
          </LocalLink>
        </aside>
      </div>
    </div>
  );
}
