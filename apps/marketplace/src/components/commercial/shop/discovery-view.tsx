import { useShopCopy, useShopMoney } from "./i18n";
import { useShopText } from "./i18n";
import { useEffect, useState, type FormEvent } from "react";
import {
  SlidersHorizontal,
  X,
  SearchX,
  Sofa,
  Trees,
  LayoutGrid,
  Truck,
  RotateCcw,
  ShieldCheck,
  Store,
  ChevronRight,
} from "lucide-react";
import { selectDemoProducts } from "../../../lib/commercial/demo-adapter";
import { SHIPPING_METHODS } from "../../../lib/commercial/shop-pricing";
import { fromPrice, LocalLink, productAvailability, publishedOffers, useShop } from "./shop-context";
import { ProductCard, ProductMedia, secondaryButton, type CardProduct } from "./shop-parts";
import { demoMedia } from "./demo-media";
import { nl } from "./nl";

const CATEGORIES = ["Wonen", "Tuin"] as const;
const categoryIcon = { Wonen: Sofa, Tuin: Trees };

function PriceFilter() {
  const nl = useShopText();
  const { route, link, navigate } = useShop();
  const [min, setMin] = useState(route.minPrice?.toString() ?? "");
  const [max, setMax] = useState(route.maxPrice?.toString() ?? "");
  const [error, setError] = useState("");
  useEffect(() => {
    setMin(route.minPrice?.toString() ?? "");
    setMax(route.maxPrice?.toString() ?? "");
  }, [route.minPrice, route.maxPrice]);
  const apply = (event: FormEvent) => {
    event.preventDefault();
    const ok = (v: string) => v === "" || /^\d{1,7}$/.test(v);
    if (!ok(min) || !ok(max)) return setError("Gebruik hele bedragen in euro.");
    if (min && max && Number(min) > Number(max))
      return setError("‘Van’ mag niet hoger zijn dan ‘Tot’.");
    setError("");
    navigate(link("/discover", { min: min || null, max: max || null }), true);
  };
  return (
    <form onSubmit={apply} aria-describedby={error ? "price-error" : undefined}>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="price-min" className="text-[11px] text-muted-foreground">
            {nl.min}
          </label>
          <input
            id="price-min"
            data-testid="filter-price-min"
            inputMode="numeric"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            className="h-9 w-full rounded border border-border px-2 text-[13px]"
          />
        </div>
        <div>
          <label htmlFor="price-max" className="text-[11px] text-muted-foreground">
            {nl.max}
          </label>
          <input
            id="price-max"
            data-testid="filter-price-max"
            inputMode="numeric"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            className="h-9 w-full rounded border border-border px-2 text-[13px]"
          />
        </div>
        <button
          type="submit"
          data-testid="filter-price-apply"
          className="col-span-2 h-9 rounded border border-border bg-surface text-[12.5px] font-semibold hover:border-ink"
        >
          {nl.apply}
        </button>
      </div>
      {error && (
        <p id="price-error" role="alert" className="mt-2 text-[12.5px] text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

function FilterPanel() {
  const copy = useShopCopy();
  const nl = useShopText();
  const { route, catalog, link, navigate } = useShop();
  const set = (changes: Record<string, string | null>) => navigate(link("/discover", changes), true);
  return (
    <div>
      <details className="brv-facet" open>
        <summary>
          {nl.category} <ChevronRight aria-hidden className="h-3.5 w-3.5 rotate-90" />
        </summary>
        <div className="mt-1">
          {["Alles", ...CATEGORIES].map((c) => (
            <label key={c} className="brv-check">
              <input
                type="radio"
                name="category"
                data-testid={`filter-category-${c.toLowerCase()}`}
                checked={route.category === c}
                onChange={() => set({ category: c === "Alles" ? null : c })}
              />
              <span>{copy(c)}</span>
              <span className="count">
                {c === "Alles" ? catalog.products.length : catalog.products.filter((p) => p.category === c).length}
              </span>
            </label>
          ))}
        </div>
      </details>

      <details className="brv-facet" open>
        <summary>
          {nl.price} <ChevronRight aria-hidden className="h-3.5 w-3.5 rotate-90" />
        </summary>
        <PriceFilter />
      </details>

      <details className="brv-facet" open>
        <summary>
          Beschikbaarheid <ChevronRight aria-hidden className="h-3.5 w-3.5 rotate-90" />
        </summary>
        <label className="brv-check mt-1">
          <input
            type="checkbox"
            data-testid="filter-in-stock"
            checked={route.inStock}
            onChange={(e) => set({ stock: e.target.checked ? "1" : null })}
          />
          <span>{nl.inStock}</span>
        </label>
      </details>
    </div>
  );
}

function FilterDisclosure() {
  const nl = useShopText();
  const [open, setOpen] = useState(false);
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const sync = () => setDesktop(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return (
    <details
      open={open || desktop}
      onToggle={(e) => !desktop && setOpen(e.currentTarget.open)}
      className="rounded border border-border bg-card lg:border-0 lg:bg-transparent"
    >
      <summary
        className="flex cursor-pointer items-center gap-2 px-3 py-3 text-[13px] font-semibold lg:hidden"
        data-testid="mobile-filters-toggle"
      >
        <SlidersHorizontal aria-hidden className="h-4 w-4" /> {nl.filters}
      </summary>
      <div className="px-3 pb-3 lg:px-0 lg:pb-0">
        <p className="hidden text-[13px] font-bold lg:block">{nl.filters}</p>
        <FilterPanel />
      </div>
    </details>
  );
}

function ActiveFilters({ clearAll }: { clearAll: () => void }) {
  const copy = useShopCopy();
  const formatEur = useShopMoney();
  const nl = useShopText();
  const { route, link, navigate } = useShop();
  const chips: [string, Record<string, null>][] = [];
  if (route.query) chips.push([`“${route.query}”`, { q: null }]);
  if (route.category !== "Alles") chips.push([route.category, { category: null }]);
  if (route.minPrice != null) chips.push([`Vanaf ${formatEur(route.minPrice * 100)}`, { min: null }]);
  if (route.maxPrice != null) chips.push([`Tot ${formatEur(route.maxPrice * 100)}`, { max: null }]);
  if (route.inStock) chips.push([nl.inStock, { stock: null }]);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="active-filters" aria-label={copy("Actieve filters")}>
      {chips.map(([label, change]) => (
        <button
          key={label}
          type="button"
          data-testid="active-filter-chip"
          onClick={() => navigate(link("/discover", change), true)}
          className="brv-chip"
          aria-label={`${copy("Verwijder filter")} ${label}`}
        >
          {label} <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      ))}
      <button type="button" data-testid="clear-filters" onClick={clearAll} className="text-[12px] font-semibold underline">
        {nl.clearFilters}
      </button>
    </div>
  );
}

function toCard(
  id: string,
  catalog: ReturnType<typeof useShop>["catalog"],
  link: ReturnType<typeof useShop>["link"],
): CardProduct {
  const product = catalog.products.find((p) => p.id === id)!;
  const offers = publishedOffers(catalog, id);
  const lowest = offers.length ? Math.min(...offers.map((o) => o.priceCents)) : 0;
  const highest = offers.length ? Math.max(...offers.map((o) => o.priceCents)) : 0;
  const seller = (offers[0] as { sellerName?: string } | undefined)?.sellerName ?? null;
  return {
    id,
    title: product.title,
    category: product.category,
    priceCents: Number.isFinite(fromPrice(catalog, id)) ? fromPrice(catalog, id) : lowest,
    // Cross-seller price spread is not a discount: no strike-through, no badge.
    fromCents: lowest,
    available: productAvailability(catalog, id),
    rating: null,
    reviewCount: null,
    seller,
    offerCount: offers.length,
    delivery: nl.deliveryShort,
    href: link(`/product/${encodeURIComponent(id)}`, { offer: null, sku: null }),
  };
}

function ProductGrid({ ids }: { ids: string[] }) {
  const copy = useShopCopy();
  const { catalog, link } = useShop();
  return (
    <ul
      aria-label={copy("Productresultaten")}
      className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4"
    >
      {ids.map((id) => (
        <li key={id} className="h-full">
          <ProductCard p={toCard(id, catalog, link)} />
        </li>
      ))}
    </ul>
  );
}

function CardRow({ ids }: { ids: string[] }) {
  const { catalog, link } = useShop();
  if (!ids.length) return null;
  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
      {ids.map((id) => (
        <li key={id} className="h-full">
          <ProductCard p={toCard(id, catalog, link)} />
        </li>
      ))}
    </ul>
  );
}

function CardRowSkeleton() {
  return (
    <ul aria-hidden className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="brv-card">
          <div className="aspect-square w-full animate-pulse bg-muted" />
          <div className="space-y-2 p-3">
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-full animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function SkeletonGrid() {
  const nl = useShopText();
  return (
    <div role="status" aria-live="polite" data-testid="catalog-loading" className="space-y-3">
      <span className="sr-only">{nl.loading}</span>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4" aria-hidden>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="brv-card space-y-2 p-2.5">
            <div className="aspect-square w-full animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoadError() {
  const nl = useShopText();
  const { retry } = useShop();
  return (
    <div role="alert" data-testid="catalog-error" className="space-y-3 rounded border border-destructive/40 bg-destructive/5 p-5">
      <p className="font-semibold">{nl.loadError}</p>
      <button type="button" data-testid="catalog-retry" className={secondaryButton} onClick={retry}>
        {nl.retry}
      </button>
    </div>
  );
}

function TrustBand() {
  const nl = useShopText();
  const items = [
    { icon: Truck, label: nl.uspDelivery },
    { icon: RotateCcw, label: nl.uspReturns },
    { icon: ShieldCheck, label: nl.uspSecure },
    { icon: Store, label: nl.uspSellers },
  ];
  return (
    <section aria-label={nl.whyBorvat} className="border-y border-border bg-card">
      <ul className="brv-shell grid grid-cols-2 gap-x-4 gap-y-2 py-3 lg:grid-cols-4">
        {items.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-2 text-[12.5px]">
            <Icon aria-hidden className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}


function GhostCard() {
  return (
    <article className="brv-card" aria-hidden>
      <div className="plate">
        <div className="aspect-square w-full animate-pulse bg-muted" />
      </div>
      <div className="body" aria-hidden>
        <p className="kicker">&nbsp;</p>
        <p className="h-[34px] w-full animate-pulse rounded bg-muted" />
        <p className="mt-1 h-3 w-1/2 animate-pulse rounded bg-muted" />
        <p className="mt-1 h-3 w-1/3 animate-pulse rounded bg-muted" />
        <div className="mt-auto pt-1">
          <p className="h-5 w-1/3 animate-pulse rounded bg-muted" />
          <p className="mt-1.5 h-3 w-2/3 animate-pulse rounded bg-muted" />
          <p className="mt-1 h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </article>
  );
}

function MarketplaceHome() {
  const copy = useShopCopy();
  const nl = useShopText();
  const formatEur = useShopMoney();
  const { catalog, link } = useShop();
  const reset = { q: null, category: null, min: null, max: null, stock: null, sort: null };
  const sellable = catalog.products.filter((p) => publishedOffers(catalog, p.id).length > 0);
  const hero = sellable[0];
  const productHref = (id: string) => link(`/product/${encodeURIComponent(id)}`, { offer: null, sku: null });
  const countIn = (c: string) => sellable.filter((p) => p.category === c).length;
  const freeFrom = formatEur(SHIPPING_METHODS.standaard.freeFromCents);

  const panels = [
    { icon: Sofa, title: copy("Wonen"), note: `${countIn("Wonen")} producten`, href: link("/discover", { ...reset, category: "Wonen" }) },
    { icon: Trees, title: copy("Tuin"), note: `${countIn("Tuin")} producten`, href: link("/discover", { ...reset, category: "Tuin" }) },
    { icon: Truck, title: "Bezorging", note: `Gratis vanaf ${freeFrom}`, href: link("/requests") },
    { icon: RotateCcw, title: "Retourneren", note: "Volgens voorwaarden", href: link("/requests") },
    { icon: Store, title: "Verkopen", note: "Eigen aanbod beheren", href: link("/workbench") },
    { icon: ShieldCheck, title: "Veilig betalen", note: "Betaling in de checkout", href: link("/requests") },
  ];

  const linkCols: { title: string; items: [string, string][] }[] = [
    { title: copy("Wonen"), items: [
      ["Alle meubels", link("/discover", { ...reset, category: "Wonen" })],
      ["Laagste prijs eerst", link("/discover", { ...reset, category: "Wonen", sort: "price" })],
      ["Direct leverbaar", link("/discover", { ...reset, category: "Wonen", stock: "1" })],
    ] },
    { title: copy("Tuin"), items: [
      ["Alles voor buiten", link("/discover", { ...reset, category: "Tuin" })],
      ["Laagste prijs eerst", link("/discover", { ...reset, category: "Tuin", sort: "price" })],
      ["Direct leverbaar", link("/discover", { ...reset, category: "Tuin", stock: "1" })],
    ] },
    { title: "Assortiment", items: [
      ["Alle producten", link("/discover", reset)],
      ["Sorteren op prijs", link("/discover", { ...reset, sort: "price" })],
      ["Hoogste prijs eerst", link("/discover", { ...reset, sort: "price-desc" })],
    ] },
    { title: "Jouw account", items: [
      ["Inloggen", link("/account")],
      ["Bestellingen", link("/requests")],
      ["Verlanglijst", link("/account")],
    ] },
    { title: "Klantenservice", items: [
      ["Bezorging", link("/requests")],
      ["Retourneren", link("/requests")],
      ["Contact", link("/requests")],
    ] },
    { title: "Verkopen", items: [
      ["Verkoperswerkbank", link("/workbench")],
      ["Aanbod beheren", link("/workbench")],
    ] },
  ];

  return (
    <div className="brv-shell">
      <h1 className="sr-only">BORVAT — wonen en tuin van gecontroleerde verkopers</h1>

      {/* banner: copy left, image right, like the reference */}
      <section className="brv-banner" aria-labelledby="banner-h">
        <div className="copy">
          <span className="eyebrow">Uitgelicht</span>
          <h2 id="banner-h">Eiken eettafel 180×90, van drie verkopers</h2>
          <p>
            Vergelijk aanbieders, prijzen en voorraad in één oogopslag. Alle producten in deze omgeving
            zijn testproducten.
          </p>
          <LocalLink href={hero ? productHref(hero.id) : link("/discover", reset)} className="cta">
            Bekijk de aanbieders <ChevronRight aria-hidden className="h-4 w-4" />
          </LocalLink>
        </div>
        <div className="art">
          <img src="/demo/prd_001.jpg" alt="Eiken eettafel met stoelen" fetchPriority="high" />
        </div>
      </section>

      {/* categories only, short name + image + count */}
      <section className="brv-catrow" aria-label="Categorieën">
        {CATEGORIES.map((c) => {
          const first = sellable.find((p) => p.category === c);
          return (
            <LocalLink
              key={c}
              href={link("/discover", { ...reset, category: c })}
              data-testid={`category-tile-${c.toLowerCase()}`}
              className="brv-catcard"
            >
              <span className="ph">
                {first && demoMedia(first.id) ? <img src={demoMedia(first.id) as string} alt="" loading="lazy" /> : null}
              </span>
              <span className="meta">
                <b>{copy(c)}</b>
                <span className="brv-num">{countIn(c)} producten</span>
              </span>
            </LocalLink>
          );
        })}
        <LocalLink href={link("/discover", reset)} className="brv-catcard">
          <span className="ph">
            {(() => {
              const pick = sellable.find((p) => demoMedia(p.id) && p.id !== sellable[0]?.id);
              return pick ? <img src={demoMedia(pick.id) as string} alt="" loading="lazy" /> : null;
            })()}
          </span>
          <span className="meta">
            <b>Alle producten</b>
            <span className="brv-num">{sellable.length} artikelen</span>
          </span>
        </LocalLink>
      </section>

      {/* service panels instead of invented promotions */}
      <section className="brv-panels" aria-label="Diensten">
        {panels.map(({ icon: Icon, title, note, href }, i) => (
          <LocalLink key={title} href={href} className={`brv-panel${i === 0 ? " is-brand" : ""}`}>
            <Icon aria-hidden className="h-6 w-6" />
            <span>
              <b className="block">{title}</b>
              <span>{note}</span>
            </span>
          </LocalLink>
        ))}
      </section>

      <section className="brv-section">
        <header>
          <h2>Populair bij BORVAT</h2>
          <LocalLink href={link("/discover", reset)} className="text-[12.5px] font-semibold text-brand hover:underline">
            Alles bekijken
          </LocalLink>
        </header>
        <ul aria-label={copy("Productresultaten")} className="brv-row">
          {sellable.length === 0
            ? Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="h-full">
                  <GhostCard />
                </li>
              ))
            : sellable.slice(0, 6).map((prod) => (
                <li key={prod.id} className="h-full">
                  <ProductCard p={toCard(prod.id, catalog, link)} />
                </li>
              ))}
        </ul>
      </section>

      <section className="brv-section">
        <header>
          <h2>Ook in de collectie</h2>
          <LocalLink href={link("/discover", reset)} className="text-[12.5px] font-semibold text-brand hover:underline">
            Alles bekijken
          </LocalLink>
        </header>
        <ul aria-label={copy("Productresultaten")} className="brv-row">
          {sellable.slice(6, 9).map((prod) => (
            <li key={prod.id} className="h-full">
              <ProductCard p={toCard(prod.id, catalog, link)} />
            </li>
          ))}
          <li className="brv-filler">
            <Store aria-hidden className="h-6 w-6 text-brand" />
            <b className="text-[15px]">Verkoop je eigen aanbod op BORVAT</b>
            <p className="text-[12.5px] text-muted-foreground">
              De verkoperswerkbank in deze omgeving is een testomgeving met voorbeelddata.
            </p>
            <LocalLink href={link("/workbench")} className="text-[12.5px] font-semibold text-brand hover:underline">
              Naar de werkbank
            </LocalLink>
          </li>
        </ul>
      </section>

      <section className="brv-section" aria-labelledby="ontdek-h">
        <header>
          <h2 id="ontdek-h">Ontdek alles bij BORVAT</h2>
        </header>
        <div className="brv-links">
          {linkCols.map((col) => (
            <div key={col.title}>
              <h3>{col.title}</h3>
              <ul>
                {col.items.map(([label, href]) => (
                  <li key={label}>
                    <LocalLink href={href}>{label}</LocalLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="brv-service" aria-label="Service en contact">
        <div className="brv-shell flex flex-wrap items-center justify-between gap-4 py-4">
          <h2>Service &amp; contact</h2>
          <ul>
            <li>
              <Truck aria-hidden className="h-4 w-4" /> Gratis bezorgd vanaf {freeFrom}
            </li>
            <li>
              <RotateCcw aria-hidden className="h-4 w-4" /> Retourneren volgens voorwaarden
            </li>
            <li>
              <ShieldCheck aria-hidden className="h-4 w-4" /> Betalen in de beveiligde checkout
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}

export function DiscoveryView() {
  const copy = useShopCopy();
  const nl = useShopText();
  const { route, catalog, load, link, navigate } = useShop();
  const filtered =
    !!route.query ||
    route.category !== "Alles" ||
    route.minPrice != null ||
    route.maxPrice != null ||
    route.inStock;
  const results = selectDemoProducts(catalog, {
    query: route.query,
    category: route.category,
    sort: route.sort,
    minCents: route.minPrice == null ? null : route.minPrice * 100,
    maxCents: route.maxPrice == null ? null : route.maxPrice * 100,
    inStockOnly: route.inStock,
  });
  const isHome = route.path === "/" && !filtered;
  const clearAll = () =>
    navigate(link("/discover", { q: null, category: null, min: null, max: null, stock: null }), true);

  if (isHome) return <MarketplaceHome />;

  const heading = route.query
    ? `${copy("Resultaten voor")} “${route.query}”`
    : route.category !== "Alles"
      ? copy(route.category)
      : copy("Alle producten");

  return (
    <div className="brv-shell space-y-3 py-4">
      <nav aria-label="Kruimelpad" className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <LocalLink
          href={link("/", { q: null, category: null, min: null, max: null, stock: null, sort: null })}
          className="hover:text-primary hover:underline"
        >
          {nl.home}
        </LocalLink>
        <ChevronRight aria-hidden className="h-3 w-3" />
        <span className="text-foreground">{heading}</span>
      </nav>

      <header className="space-y-1">
        <h1 tabIndex={-1} className="text-[24px] font-black leading-tight sm:text-[28px]">
          {heading}
        </h1>
        <p className="max-w-[70ch] text-[12.5px] text-muted-foreground">
          Vergelijk aanbieders, prijzen en levertijden. Alle producten in deze omgeving zijn
          testproducten zonder echte betaling.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[236px_1fr]">
        <aside aria-label={nl.filters} className="lg:sticky lg:top-[152px] lg:self-start">
          <FilterDisclosure />
        </aside>

        <section className="min-w-0 space-y-3" aria-label={copy("Resultaten")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" data-testid="results-count" className="brv-num text-[13px] font-semibold">
              {load.status === "ready"
                ? nl.results(results.length)
                : load.status === "error"
                  ? nl.loadError
                  : nl.loading}
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="buyer-sort" className="text-[12px] text-muted-foreground">
                {nl.sort}
              </label>
              <select
                id="buyer-sort"
                data-testid="sort-select"
                value={route.sort}
                onChange={(e) =>
                  navigate(link("/discover", { sort: e.target.value === "title" ? null : e.target.value }), true)
                }
                className="h-8 rounded border border-border bg-white px-2 text-[12.5px]"
              >
                <option value="title">{nl.sortTitle}</option>
                <option value="price">{nl.sortPrice}</option>
                <option value="price-desc">{nl.sortPriceDesc}</option>
              </select>
            </div>
          </div>

          <ActiveFilters clearAll={clearAll} />

          {load.status === "loading" && <SkeletonGrid />}
          {load.status === "error" && <LoadError />}
          {load.status === "ready" && !results.length && (
            <div data-testid="no-results" className="flex flex-col items-center rounded border border-dashed border-border bg-card p-10 text-center">
              <SearchX aria-hidden className="h-9 w-9 text-muted-foreground" />
              <h2 className="mt-3 text-[16px] font-bold">{nl.noResults}</h2>
              <p className="mt-1 max-w-sm text-[12.5px] text-muted-foreground">{nl.noResultsHint}</p>
              <button type="button" data-testid="no-results-clear" className={`${secondaryButton} mt-4`} onClick={clearAll}>
                {nl.clearFilters}
              </button>
            </div>
          )}
          {load.status === "ready" && !!results.length && <ProductGrid ids={results.map((p) => p.id)} />}
        </section>
      </div>
    </div>
  );
}
