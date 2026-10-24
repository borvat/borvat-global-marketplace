import { useShopCopy, useShopMoney } from "./i18n";
import { useShopText } from "./i18n";
import { useEffect, useState, type FormEvent } from "react";
import { SlidersHorizontal, X, SearchX, Sofa, Trees, LayoutGrid } from "lucide-react";
import { formatEur } from "../../../lib/format";
import { selectDemoProducts } from "../../../lib/commercial/demo-adapter";
import { fromPrice, LocalLink, productAvailability, useShop } from "./shop-context";
import { AvailabilityBadge, ProductMedia, secondaryButton } from "./shop-parts";
import { nl } from "./nl";

const CATEGORIES = ["Wonen", "Tuin"] as const;
const categoryIcon = { Alles: LayoutGrid, Wonen: Sofa, Tuin: Trees };

function PriceFilter() {
  const copy = useShopCopy();
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
    <form
      onSubmit={apply}
      className="space-y-2"
      aria-describedby={error ? "price-error" : undefined}
    >
      <fieldset>
        <legend className="mb-2 font-semibold">{nl.price}</legend>
        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="price-min" className="text-xs text-muted-foreground">
              {nl.min}
            </label>
            <input
              id="price-min"
              data-testid="filter-price-min"
              inputMode="numeric"
              value={min}
              onChange={(e) => setMin(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-2"
            />
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor="price-max" className="text-xs text-muted-foreground">
              {nl.max}
            </label>
            <input
              id="price-max"
              data-testid="filter-price-max"
              inputMode="numeric"
              value={max}
              onChange={(e) => setMax(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-2"
            />
          </div>
          <button
            type="submit"
            data-testid="filter-price-apply"
            className={`${secondaryButton} col-span-2 h-10 px-3 py-0`}
          >
            {nl.apply}
          </button>
        </div>
      </fieldset>
      {error && (
        <p id="price-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

/** One filter panel instance: collapsible on mobile, always open from the lg breakpoint. */
function FilterDisclosure() {
  const copy = useShopCopy();
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
      className="group rounded-xl border border-border bg-card p-4 lg:p-5"
    >
      <summary
        className="flex cursor-pointer items-center gap-2 font-semibold lg:hidden"
        data-testid="mobile-filters-toggle"
      >
        <SlidersHorizontal aria-hidden className="h-4 w-4" /> {nl.filters}
      </summary>
      <div className="pt-4 lg:pt-0">
        <FilterPanel />
      </div>
    </details>
  );
}

function FilterPanel() {
  const copy = useShopCopy();
  const nl = useShopText();
  const { route, link, navigate } = useShop();
  const set = (changes: Record<string, string | null>) =>
    navigate(link("/discover", changes), true);
  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 font-semibold">{nl.category}</legend>
        {["Alles", ...CATEGORIES].map((c) => (
          <label key={c} className="flex cursor-pointer items-center gap-2 py-1.5">
            <input
              type="radio"
              name="category"
              data-testid={`filter-category-${c.toLowerCase()}`}
              checked={route.category === c}
              onChange={() => set({ category: c === "Alles" ? null : c })}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            {copy(c)}
          </label>
        ))}
      </fieldset>
      <PriceFilter />
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          data-testid="filter-in-stock"
          checked={route.inStock}
          onChange={(e) => set({ stock: e.target.checked ? "1" : null })}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        {nl.inStock}
      </label>
    </div>
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
  if (route.minPrice != null)
    chips.push([`Vanaf ${formatEur(route.minPrice * 100)}`, { min: null }]);
  if (route.maxPrice != null) chips.push([`Tot ${formatEur(route.maxPrice * 100)}`, { max: null }]);
  if (route.inStock) chips.push([nl.inStock, { stock: null }]);
  if (!chips.length) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label={copy("Actieve filters")}
      data-testid="active-filters"
    >
      {chips.map(([label, change]) => (
        <button
          key={label}
          type="button"
          data-testid="active-filter-chip"
          onClick={() => navigate(link("/discover", change), true)}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-sm hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-ring"
          aria-label={`${copy("Verwijder filter")} ${label}`}
        >
          {label} <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      ))}
      <button
        type="button"
        data-testid="clear-filters"
        onClick={clearAll}
        className="text-sm font-semibold underline underline-offset-4"
      >
        {nl.clearFilters}
      </button>
    </div>
  );
}

function ProductGrid({ ids }: { ids: string[] }) {
  const copy = useShopCopy();
  const formatEur = useShopMoney();
  const nl = useShopText();
  const { catalog, link } = useShop();
  return (
    <ul
      aria-label={copy("Productresultaten")}
      className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3"
    >
      {ids.map((id) => {
        const p = catalog.products.find((x) => x.id === id)!;
        const href = link(`/product/${encodeURIComponent(id)}`, { offer: null, sku: null });
        return (
          <li
            key={id}
            data-testid="discovery-product"
            className="group flex flex-col rounded-xl border border-border bg-card p-3 transition-shadow hover:shadow-md sm:p-4"
          >
            <ProductMedia seed={id} title={p.title} />
            <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">
              {copy(p.category)}
            </p>
            <h2 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug sm:text-base">
              <LocalLink
                href={href}
                data-testid={`product-link-${id}`}
                className="focus-visible:outline-2 focus-visible:outline-offset-2 group-hover:underline"
              >
                {p.title}
              </LocalLink>
            </h2>
            <div className="mt-auto space-y-1 pt-3">
              <p
                className="text-lg font-extrabold text-price sm:text-xl"
                data-testid={`product-price-${id}`}
              >
                <span className="text-xs font-normal text-muted-foreground">{nl.from} </span>
                {formatEur(fromPrice(catalog, id))}
              </p>
              <AvailabilityBadge
                available={productAvailability(catalog, id)}
                testId={`product-stock-${id}`}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SkeletonGrid() {
  const copy = useShopCopy();
  const nl = useShopText();
  return (
    <div role="status" aria-live="polite" data-testid="catalog-loading" className="space-y-3">
      <span className="sr-only">{nl.loading}</span>
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border p-4">
            <div className="aspect-[4/3] animate-pulse rounded-lg bg-muted" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-5 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoadError() {
  const copy = useShopCopy();
  const nl = useShopText();
  const { retry } = useShop();
  return (
    <div
      role="alert"
      data-testid="catalog-error"
      className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-6"
    >
      <p className="font-semibold">{nl.loadError}</p>
      <button type="button" data-testid="catalog-retry" className={secondaryButton} onClick={retry}>
        {nl.retry}
      </button>
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
  const clearAll = () =>
    navigate(
      link("/discover", { q: null, category: null, min: null, max: null, stock: null }),
      true,
    );
  return (
    <div className="space-y-6">
      {!filtered && (
        <section className="overflow-hidden rounded-2xl bg-ink px-6 py-8 text-ink-foreground sm:px-10 sm:py-12">
          <p className="text-sm font-semibold uppercase tracking-widest text-red-300">
            {copy("Testcollectie")}
          </p>
          <h1
            tabIndex={-1}
            className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl"
          >
            {copy("Wonen en tuin, op jouw manier.")}
          </h1>
          <p className="mt-3 max-w-xl text-sm opacity-85 sm:text-base">
            {copy(
              "Vergelijk verkopers, kies je variant en probeer het volledige bestelproces — zonder te betalen.",
            )}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {(["Wonen", "Tuin"] as const).map((c) => {
              const Icon = categoryIcon[c];
              return (
                <LocalLink
                  key={c}
                  href={link("/discover", { category: c })}
                  data-testid={`category-tile-${c.toLowerCase()}`}
                  className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 font-semibold hover:bg-white/20 focus-visible:outline-2"
                >
                  <Icon aria-hidden className="h-4 w-4" /> {copy(c)}
                </LocalLink>
              );
            })}
          </div>
        </section>
      )}
      {filtered && (
        <h1 tabIndex={-1} className="text-2xl font-bold sm:text-3xl">
          {route.query
            ? `${copy("Zoekresultaten voor")} “${route.query}”`
            : route.category !== "Alles"
              ? copy(route.category)
              : copy("Alle producten")}
        </h1>
      )}
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside aria-label={nl.filters} className="lg:sticky lg:top-24 lg:self-start">
          <FilterDisclosure />
        </aside>
        <section className="min-w-0 space-y-4" aria-label={copy("Resultaten")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" data-testid="results-count" className="font-semibold">
              {load.status === "ready"
                ? nl.results(results.length)
                : load.status === "error"
                  ? nl.loadError
                  : nl.loading}
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="buyer-sort" className="text-sm">
                {nl.sort}
              </label>
              <select
                id="buyer-sort"
                data-testid="sort-select"
                value={route.sort}
                onChange={(e) =>
                  navigate(
                    link("/discover", { sort: e.target.value === "title" ? null : e.target.value }),
                    true,
                  )
                }
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
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
            <div
              data-testid="no-results"
              className="flex flex-col items-center rounded-xl border border-dashed border-border p-10 text-center"
            >
              <SearchX aria-hidden className="h-10 w-10 text-muted-foreground" />
              <h2 className="mt-3 text-lg font-bold">{nl.noResults}</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">{nl.noResultsHint}</p>
              <button
                type="button"
                data-testid="no-results-clear"
                className={`${secondaryButton} mt-4`}
                onClick={clearAll}
              >
                {nl.clearFilters}
              </button>
            </div>
          )}
          {load.status === "ready" && !!results.length && (
            <ProductGrid ids={results.map((p) => p.id)} />
          )}
        </section>
      </div>
    </div>
  );
}
