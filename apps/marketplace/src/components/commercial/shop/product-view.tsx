import { useEffect, useState } from "react";
import { ChevronRight, Store, Truck, Zap, MessageSquareOff } from "lucide-react";
import { formatEur } from "../../../lib/format";
import { productDetails } from "../../../lib/commercial/demo-product-details";
import { SHIPPING_METHODS, maxOrderable } from "../../../lib/commercial/shop-pricing";
import { LocalLink, publishedOffers, useShop } from "./shop-context";
import { LoadError } from "./discovery-view";
import { AvailabilityBadge, ProductMedia, QuantityStepper, primaryButton } from "./shop-parts";
import { nl } from "./nl";

function ShippingInfo() {
  const s = SHIPPING_METHODS;
  return (
    <div
      className="space-y-2 rounded-lg bg-muted/60 p-4 text-sm"
      data-testid="product-shipping-info"
    >
      <p className="font-semibold">{nl.shippingTitle}</p>
      <p className="flex gap-2">
        <Truck aria-hidden className="h-4 w-4 shrink-0" />
        {nl.standard}: {formatEur(s.standaard.priceCents)}, {nl.freeFrom}{" "}
        {formatEur(s.standaard.freeFromCents)} · {s.standaard.deliveryDays}
      </p>
      <p className="flex gap-2">
        <Zap aria-hidden className="h-4 w-4 shrink-0" />
        {nl.express}: {formatEur(s.express.priceCents)} · {s.express.deliveryDays}
      </p>
      <p className="text-xs text-muted-foreground">
        Indicatieve testlevertijden; er wordt geen zending aangemaakt.
      </p>
    </div>
  );
}

export function ProductView() {
  const { adapter, snapshot, catalog, load, route, link, navigate } = useShop();
  const product = catalog.products.find((p) => p.id === route.productId);
  const skus = catalog.skus.filter((s) => s.productId === product?.id);
  const requested = catalog.offers.find(
    (o) => o.id === route.offerId && o.productId === product?.id,
  );
  const sku =
    skus.find((s) => s.id === route.skuId) ??
    skus.find((s) => s.id === requested?.skuId) ??
    skus[0];
  const offers = publishedOffers(catalog, product?.id ?? "")
    .filter((o) => o.skuId === sku?.id)
    .sort((a, b) => a.priceCents - b.priceCents);
  const selected = route.offerId ? offers.find((o) => o.id === route.offerId) : offers[0];
  const inCart = snapshot.cart.find((l) => l.offerId === selected?.id)?.quantity ?? 0;
  const remaining = selected ? maxOrderable(selected.availabilityExample) - inCart : 0;
  const [qty, setQty] = useState(1);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setQty(1);
    setError("");
  }, [selected?.id]);
  if (load.status === "loading")
    return (
      <p role="status" data-testid="product-loading">
        {nl.loading}
      </p>
    );
  if (load.status === "error") return <LoadError />;
  if (!product || !publishedOffers(catalog, product.id).length)
    return (
      <div
        data-testid="product-not-found"
        className="space-y-3 rounded-xl border border-border p-8"
      >
        <h1 tabIndex={-1} className="text-2xl font-bold">
          {nl.notFoundProduct}
        </h1>
        <LocalLink href={link("/discover")}>{nl.backToShop}</LocalLink>
      </div>
    );
  const details = productDetails(product.id);
  const add = () => {
    setNotice("");
    setError("");
    if (!selected) return;
    if (!Number.isInteger(qty) || qty < 1) return setError("Kies een aantal van 1 of meer.");
    try {
      adapter.setQuantity(selected.id, inCart + qty);
      const variant = skus.length > 1 ? ` (${selected.variant})` : "";
      setNotice(`${qty} × ${product.title}${variant} ${nl.added.toLowerCase()}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Toevoegen is niet gelukt.");
    }
  };
  return (
    <article className="space-y-6">
      <nav
        aria-label="Kruimelpad"
        className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
      >
        <LocalLink
          href={link("/discover", { q: null, category: null })}
          className="hover:underline"
        >
          Home
        </LocalLink>
        <ChevronRight aria-hidden className="h-3.5 w-3.5" />
        <LocalLink
          href={link("/discover", { category: product.category })}
          className="hover:underline"
        >
          {product.category}
        </LocalLink>
      </nav>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="space-y-6">
          <ProductMedia seed={product.id} title={product.title} size="lg" />
          <section aria-labelledby="desc-h">
            <h2 id="desc-h" className="text-lg font-bold">
              {nl.description}
            </h2>
            <p className="mt-2 leading-relaxed" data-testid="product-description">
              {details.description}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Voorbeeldomschrijving voor de testomgeving.
            </p>
          </section>
          {!!details.specs.length && (
            <section aria-labelledby="spec-h">
              <h2 id="spec-h" className="text-lg font-bold">
                {nl.specs}
              </h2>
              <dl
                className="mt-2 divide-y divide-border rounded-lg border border-border"
                data-testid="product-specs"
              >
                {[
                  ...details.specs,
                  ["Variant", sku?.variant ?? "—"],
                  ["Inhoud", nl.perPack(sku?.packQuantity ?? 1)],
                ].map(([k, v]) => (
                  <div key={k} className="grid grid-cols-2 gap-4 px-4 py-2.5 text-sm">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <p className="flex gap-2 text-sm text-muted-foreground" data-testid="product-no-reviews">
            <MessageSquareOff aria-hidden className="h-4 w-4 shrink-0" /> {nl.noReviews}
          </p>
        </div>
        <div className="order-first min-w-0 space-y-5 rounded-xl border border-border bg-card p-5 lg:sticky lg:top-24 lg:order-none">
          <h1
            tabIndex={-1}
            className="break-words text-2xl font-bold leading-tight"
            data-testid="product-title"
          >
            {product.title}
          </h1>
          {skus.length > 1 && sku && (
            <p className="text-sm" data-testid="product-selected-variant">
              Gekozen variant: <strong>{sku.variant}</strong>
            </p>
          )}
          {skus.length > 1 && (
            <div>
              <label htmlFor="buyer-sku" className="text-sm font-semibold">
                {nl.variant}
              </label>
              <select
                id="buyer-sku"
                data-testid="buyer-sku-select"
                className="mt-1.5 block h-11 w-full rounded-md border border-border bg-background px-3"
                value={sku?.id ?? ""}
                onChange={(e) =>
                  navigate(link(route.path, { sku: e.target.value, offer: null }), true)
                }
              >
                {skus.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.variant} · {nl.perPack(s.packQuantity)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {selected && (
            <div className="space-y-1">
              <p className="text-3xl font-extrabold text-price" data-testid="product-price">
                {formatEur(selected.priceCents)}
              </p>
              <p className="text-xs text-muted-foreground">
                Inclusief btw · {nl.perPack(selected.packQuantity)}
              </p>
              <AvailabilityBadge
                available={selected.availabilityExample}
                testId="product-availability"
              />
            </div>
          )}
          {offers.length > 1 && (
            <fieldset className="min-w-0 space-y-2">
              <legend className="mb-1 text-sm font-semibold">Kies een verkoper</legend>
              {offers.map((o) => (
                <label
                  key={o.id}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-3 has-[:checked]:border-accent has-[:checked]:ring-1 has-[:checked]:ring-accent"
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="buyer-offer"
                      value={o.id}
                      data-testid={`offer-radio-${o.id}`}
                      checked={selected?.id === o.id}
                      onChange={() =>
                        navigate(link(route.path, { offer: o.id, sku: o.skuId }), true)
                      }
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className="text-sm font-medium">{o.sellerName}</span>
                  </span>
                  <span className="font-bold">{formatEur(o.priceCents)}</span>
                </label>
              ))}
            </fieldset>
          )}
          {!offers.length && (
            <p role="status" data-testid="no-offer">
              Geen beschikbaar aanbod voor deze variant.
            </p>
          )}
          {!!offers.length && !selected && (
            <p role="alert">De gekozen aanbieding is niet beschikbaar. Kies opnieuw.</p>
          )}
          {selected && (
            <>
              <p className="flex items-center gap-2 text-sm" data-testid="product-seller">
                <Store aria-hidden className="h-4 w-4" /> {nl.soldBy}:{" "}
                <strong>{selected.sellerName}</strong>
                <span className="text-xs text-muted-foreground">({nl.demoSeller})</span>
              </p>
              {selected.availabilityExample > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <QuantityStepper
                    id="product-qty"
                    label={nl.quantity}
                    value={qty}
                    max={Math.max(1, remaining)}
                    disabled={remaining < 1}
                    onChange={(v) => setQty(v)}
                  />
                  {inCart > 0 && (
                    <span className="text-xs text-muted-foreground" data-testid="product-in-cart">
                      Al {inCart} in je mandje{remaining < 1 ? " · maximum bereikt" : ""}
                    </span>
                  )}
                </div>
              )}
              <button
                type="button"
                data-testid="add-to-cart-button"
                className={`${primaryButton} w-full`}
                disabled={selected.availabilityExample < 1 || remaining < 1}
                onClick={add}
              >
                {selected.availabilityExample < 1 ? nl.outOfStock : nl.addToCart}
              </button>
            </>
          )}
          {notice && (
            <p
              role="status"
              data-testid="add-to-cart-notice"
              className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
            >
              {notice}{" "}
              <LocalLink
                href={link("/cart")}
                data-testid="notice-view-cart"
                className="font-semibold underline"
              >
                {nl.viewCart}
              </LocalLink>
            </p>
          )}
          {error && (
            <p
              role="alert"
              data-testid="add-to-cart-error"
              className="rounded-lg border border-destructive p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <ShippingInfo />
        </div>
      </div>
    </article>
  );
}
