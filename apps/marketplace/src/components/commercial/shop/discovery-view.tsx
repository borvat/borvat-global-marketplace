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
import { demoMedia } from "./demo-media";
import { fromPrice, LocalLink, productAvailability, publishedOffers, useShop } from "./shop-context";
import {
  ProductCard,
  ProductMedia,
  secondaryButton,
  type CardProduct,
} from "./shop-parts";
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
          <label htmlFor="price-min" className="text-[11.5px] text-muted-foreground">
            {nl.min}
          </label>
          <input
            id="price-min"
            data-testid="filter-price-min"
            inputMode="numeric"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            className="h-9 w-full rounded border border-border bg-white px-2 text-[13px]"
          />
        </div>
        <div>
          <label htmlFor="price-max" className="text-[11.5px] text-muted-foreground">
            {nl.max}
          </label>
          <input
            id="price-max"
            data-testid="filter-price-max"
            inputMode="numeric"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            className="h-9 w-full rounded border border-border bg-white px-2 text-[13px]"
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
  const counts = CATEGORIES.map((c) => ({
    name: c,
    count: catalog.products.filter((p) => p.category === c).length,
  }));
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
                {c === "Alles"
                  ? catalog.products.length
                  : counts.find((x) => x.name === c)?.count ?? 0}
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
      className="rounded-md border border-border bg-card lg:border-0 lg:bg-transparent"
    >
      <summary
        className="flex cursor-pointer items-center gap-2 px-3 py-3 text-[13.5px] font-semibold lg:hidden"
        data-testid="mobile-filters-toggle"
      >
        <SlidersHorizontal aria-hidden className="h-4 w-4" /> {nl.filters}
      </summary>
      <div className="px-3 pb-3 lg:px-0 lg:pb-0">
        <p className="hidden text-[13.5px] font-bold lg:block">{nl.filters}</p>
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
      <button type="button" data-testid="clear-filters" onClick={clearAll} className="text-[12.5px] font-semibold underline">
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
    fromCents: highest > lowest ? highest : lowest,
    available: productAvailability(catalog, id),
    rating: null,
    reviewCount: null,
    seller: seller ?? "BORVAT",
    variantLabel: null,
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

function CardRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul aria-hidden className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="brv-card overflow-hidden">
          <div className="aspect-square w-full animate-pulse bg-muted" />
          <div className="space-y-2 p-3">
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
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
            <div className="aspect-square animate-pulse rounded bg-muted" />
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
    <div role="alert" data-testid="catalog-error" className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-5">
      <p className="font-semibold">{nl.loadError}</p>
      <button type="button" data-testid="catalog-retry" className={secondaryButton} onClick={retry}>
        {nl.retry}
      </button>
    </div>
  );
}

function UspStrip() {
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
          <li key={label} className="brv-usp">
            <Icon aria-hidden className="h-4 w-4 text-primary" />
            <span className="truncate">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MarketplaceHome() {
  const copy = useShopCopy();
  const nl = useShopText();
  const { catalog, route, link } = useShop();
  const sellable = catalog.products
    .filter((p) => publishedOffers(catalog, p.id).length > 0)
    .map((p) => p.id);
  const popular = sellable.slice(0, 4);
  const more = sellable.slice(4, 8);
  const reset = { q: null, category: null, min: null, max: null, stock: null, sort: null };
  return (
    <div className="space-y-5">
      <UspStrip />

      <section className="brv-shell grid gap-3 lg:grid-cols-[1.45fr_1fr]">
        <div className="relative flex min-h-[300px] flex-col justify-between overflow-hidden rounded-md bg-primary p-6 text-primary-foreground sm:p-8">
          <img
            src="/demo/prd_001.jpg"
            alt=""
            aria-hidden
            className="absolute inset-y-0 right-0 hidden h-full w-[46%] object-cover opacity-90 lg:block"
          />
          <div className="relative max-w-[34ch]">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/75">
              {copy("Testcollectie")}
            </p>
            <h1 tabIndex={-1} className="mt-2 text-[26px] font-black leading-[1.12] sm:text-[34px]">
              Wonen en tuin, van verkopers die je kunt vergelijken
            </h1>
            <p className="mt-3 text-[13.5px] leading-relaxed text-white/85">
              {copy(
                "Vergelijk verkopers, kies je variant en probeer het volledige bestelproces — zonder te betalen.",
              )}
            </p>
          </div>
          <div className="relative mt-6 flex flex-wrap items-center gap-3">
            <LocalLink href={link("/discover", reset)} className="brv-cta bg-white text-primary hover:bg-white/90">
              {nl.allProducts}
            </LocalLink>
            <span className="text-[12.5px] text-white/75">{nl.deliveryFree}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {CATEGORIES.map((c) => {
            const Icon = categoryIcon[c];
            const first = catalog.products.find((p) => p.category === c);
            return (
              <LocalLink
                key={c}
                href={link("/discover", { ...reset, category: c })}
                data-testid={`category-tile-${c.toLowerCase()}`}
                className="brv-card group relative flex flex-col justify-end overflow-hidden p-0 hover:border-primary"
              >
                {first ? (
                  <img
                    src={demoMedia(first.id) ?? ""}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 h-full w-full object-cover opacity-95 transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : null}
                <div className="relative bg-gradient-to-t from-black/70 via-black/25 to-transparent p-3 text-white">
                  <Icon aria-hidden className="mb-6 h-5 w-5" />
                  <p className="text-[14.5px] font-bold">{copy(c)}</p>
                  <p className="brv-num text-[11.5px] text-white/80">
                    {catalog.products.filter((p) => p.category === c).length} producten
                  </p>
                </div>
              </LocalLink>
            );
          })}
          <LocalLink href={link("/discover", { ...reset, stock: "1" })} className="brv-card flex flex-col justify-between p-4 hover:border-primary">
            <Truck aria-hidden className="h-5 w-5 text-primary" />
            <div>
              <p className="mt-5 text-[14px] font-bold">Direct leverbaar</p>
              <p className="text-[11.5px] text-muted-foreground">Vandaag besteld, morgen in huis</p>
            </div>
          </LocalLink>
          <LocalLink href={link("/workbench")} className="brv-card flex flex-col justify-between p-4 hover:border-primary">
            <Store aria-hidden className="h-5 w-5 text-primary" />
            <div>
              <p className="mt-5 text-[14px] font-bold">Verkoop op BORVAT</p>
              <p className="text-[11.5px] text-muted-foreground">Beheer je aanbod in de werkbank</p>
            </div>
          </LocalLink>
        </div>
      </section>

      <section className="brv-shell space-y-3">
        <header className="flex items-baseline justify-between">
          <h2 className="text-[19px] font-bold">{nl.popular}</h2>
          <LocalLink href={link("/discover", reset)} className="text-[12.5px] font-semibold text-primary hover:underline">
            {nl.seeAll}
          </LocalLink>
        </header>
        {popular.length ? <CardRow ids={popular} /> : <CardRowSkeleton />}
      </section>

      {more.length > 0 && (
        <section className="brv-shell space-y-3">
          <header className="flex items-baseline justify-between">
            <h2 className="text-[19px] font-bold">Meer uit de collectie</h2>
            <LocalLink href={link("/discover", reset)} className="text-[12.5px] font-semibold text-primary hover:underline">
              {nl.seeAll}
            </LocalLink>
          </header>
          <CardRow ids={more} />
        </section>
      )}

      <section className="brv-shell">
        <h2 className="mb-3 text-[19px] font-bold">{nl.shopByCategory}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {CATEGORIES.map((c) => {
            const Icon = categoryIcon[c];
            const ids = catalog.products.filter((p) => p.category === c).map((p) => p.id);
            return (
              <div key={c} className="brv-card p-4">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-[15px] font-bold">
                    <Icon aria-hidden className="h-4 w-4 text-primary" /> {copy(c)}
                  </p>
                  <span className="brv-num text-[12px] text-muted-foreground">{ids.length}</span>
                </div>
                <div className="mt-3 flex gap-2">
                  {ids.slice(0, 3).map((id) => {
                    const p = catalog.products.find((x) => x.id === id)!;
                    return (
                      <LocalLink
                        key={id}
                        href={link(`/product/${encodeURIComponent(id)}`, { offer: null, sku: null })}
                        className="w-20 overflow-hidden rounded border border-border"
                        aria-label={p.title}
                      >
                        <ProductMedia seed={id} title={p.title} size="sm" />
                      </LocalLink>
                    );
                  })}
                </div>
                <LocalLink
                  href={link("/discover", { ...reset, category: c })}
                  className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline"
                >
                  {nl.seeAll} <ChevronRight aria-hidden className="h-3.5 w-3.5" />
                </LocalLink>
              </div>
            );
          })}
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

  if (isHome) {
    return (
      <div className="space-y-6 py-3">
        <MarketplaceHome />
      </div>
    );
  }

  const heading = route.query
    ? `${copy("Resultaten voor")} “${route.query}”`
    : route.category !== "Alles"
      ? copy(route.category)
      : copy("Alle producten");

  return (
    <div className="brv-shell space-y-4 py-4">
      <nav aria-label="Kruimelpad" className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
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
        <h1 tabIndex={-1} className="text-[26px] font-black leading-tight sm:text-[30px]">
          {heading}
        </h1>
        <p className="max-w-[70ch] text-[13px] text-muted-foreground">
          Vergelijk aanbieders, prijzen en levertijden. Alle producten in deze omgeving zijn
          testproducten zonder echte betaling.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[248px_1fr]">
        <aside aria-label={nl.filters} className="lg:sticky lg:top-[150px] lg:self-start">
          <FilterDisclosure />
        </aside>

        <section className="min-w-0 space-y-3" aria-label={copy("Resultaten")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" data-testid="results-count" className="brv-num text-[13.5px] font-semibold">
              {load.status === "ready"
                ? nl.results(results.length)
                : load.status === "error"
                  ? nl.loadError
                  : nl.loading}
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="buyer-sort" className="text-[12.5px] text-muted-foreground">
                {nl.sort}
              </label>
              <select
                id="buyer-sort"
                data-testid="sort-select"
                value={route.sort}
                onChange={(e) =>
                  navigate(link("/discover", { sort: e.target.value === "title" ? null : e.target.value }), true)
                }
                className="h-9 rounded border border-border bg-white px-2 text-[13px]"
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
            <div data-testid="no-results" className="flex flex-col items-center rounded-md border border-dashed border-border bg-card p-10 text-center">
              <SearchX aria-hidden className="h-9 w-9 text-muted-foreground" />
              <h2 className="mt-3 text-[17px] font-bold">{nl.noResults}</h2>
              <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{nl.noResultsHint}</p>
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
