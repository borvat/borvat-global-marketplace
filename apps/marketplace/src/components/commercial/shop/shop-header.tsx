import { useShopCopy } from "./i18n";
import { useShopText } from "./i18n";
import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { Search, ShoppingCart, Package } from "lucide-react";
import { normalizeSearch } from "../../../lib/commercial/demo-adapter";
import { LocalLink, useShop } from "./shop-context";
import { nl } from "./nl";

function SearchBox() {
  const copy = useShopCopy();
  const nl = useShopText();
  const { route, catalog, link, navigate } = useShop();
  const [value, setValue] = useState(route.query);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  useEffect(() => {
    setValue(route.query);
  }, [route.query]);
  const q = normalizeSearch(value);
  const suggestions = q
    ? catalog.products
        .filter(
          (p) =>
            normalizeSearch(p.title).includes(q) &&
            catalog.offers.some((o) => o.productId === p.id && o.state === "published"),
        )
        .slice(0, 5)
    : [];
  const show = open && suggestions.length > 0;
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setOpen(false);
    navigate(link("/discover", { q: value.trim() || null }));
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === "Escape") setOpen(false);
    else if (event.key === "Enter" && show && active >= 0) {
      event.preventDefault();
      setOpen(false);
      navigate(link(`/product/${encodeURIComponent(suggestions[active].id)}`));
    }
  };
  return (
    <form
      role="search"
      onSubmit={submit}
      className="relative w-full"
      data-testid="header-search-form"
    >
      <label htmlFor="buyer-search" className="sr-only">
        {nl.searchLabel}
      </label>
      <div className="flex overflow-hidden rounded-lg bg-background text-foreground ring-1 ring-white/20 focus-within:ring-2 focus-within:ring-accent-yellow">
        <input
          id="buyer-search"
          data-testid="search-input"
          type="search"
          role="combobox"
          aria-expanded={show}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={value}
          placeholder={nl.searchPlaceholder}
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
          className="h-11 min-w-0 flex-1 bg-transparent px-4 outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          data-testid="search-submit"
          className="flex items-center gap-2 bg-accent-yellow px-4 font-bold text-ink hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-ink"
        >
          <Search aria-hidden className="h-5 w-5" />
          <span className="sr-only sm:not-sr-only">{nl.searchButton}</span>
        </button>
      </div>
      {show && (
        <ul
          id={listId}
          role="listbox"
          aria-label={nl.suggestions}
          data-testid="search-suggestions"
          className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
        >
          {suggestions.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              data-testid={`search-suggestion-${p.id}`}
              className={`cursor-pointer px-4 py-2.5 text-sm ${i === active ? "bg-muted" : "hover:bg-muted"}`}
              onMouseDown={(event) => {
                event.preventDefault();
                setOpen(false);
                navigate(link(`/product/${encodeURIComponent(p.id)}`));
              }}
            >
              <span className="font-medium">{p.title}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {copy("in")} {copy(p.category)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

export function ShopHeader() {
  const copy = useShopCopy();
  const nl = useShopText();
  const { snapshot, route, link, navigate } = useShop();
  const count = snapshot.cart.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <header className="sticky top-0 z-40 bg-brand text-brand-foreground shadow-sm">
      <div className="mx-auto grid max-w-7xl grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        <LocalLink
          href={link("/discover", {
            q: null,
            category: null,
            min: null,
            max: null,
            stock: null,
            sort: null,
          })}
          data-testid="header-logo"
          aria-label={copy("BORVAT – naar de startpagina")}
          className="col-start-1 row-start-1 rounded text-2xl font-extrabold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 sm:text-3xl"
        >
          BOR<span className="text-red-400">V</span>AT
        </LocalLink>
        <div className="col-span-2 col-start-1 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1">
          <SearchBox />
        </div>
        <nav
          aria-label={copy("Hoofdnavigatie")}
          className="col-start-2 row-start-1 flex min-w-0 flex-wrap items-center justify-end gap-0 text-xs sm:gap-1 sm:text-sm md:col-start-3 lg:gap-3"
        >
          <LocalLink
            href={link("/requests")}
            data-testid="nav-orders"
            className="flex items-center gap-1.5 rounded-md px-2 py-2 hover:bg-white/10 focus-visible:outline-2"
            aria-label={nl.orders}
          >
            <Package aria-hidden className="h-5 w-5" />
            <span className="hidden lg:inline">{nl.orders}</span>
          </LocalLink>
          <LocalLink
            href={link("/cart")}
            data-testid="nav-cart"
            aria-label={`${nl.cart} (${count})`}
            className="relative flex items-center gap-1.5 rounded-md px-2 py-2 hover:bg-white/10 focus-visible:outline-2"
          >
            <ShoppingCart aria-hidden className="h-5 w-5" />
            <span className="hidden sm:inline">{nl.cart}</span>
            <span
              data-testid="cart-count"
              className="min-w-5 rounded-full bg-accent-yellow px-1.5 text-center text-xs font-bold leading-5 text-ink"
            >
              {count}
            </span>
          </LocalLink>
          <label htmlFor="buyer-country" className="sr-only">
            {nl.country}
          </label>
          <select
            id="buyer-country"
            data-testid="country-select"
            className="h-9 rounded-md border border-white/20 bg-transparent px-2 text-sm text-brand-foreground [&>option]:text-foreground"
            value={route.country}
            onChange={(event) => navigate(link(route.path, { country: event.target.value }), true)}
          >
            <option value="NL">NL</option>
            <option value="BE">BE</option>
          </select>
          <label htmlFor="buyer-language" className="sr-only">
            Language · اللغة · Taal
          </label>
          <select
            id="buyer-language"
            data-testid="language-select"
            value={route.language}
            onChange={(e) =>
              navigate(
                link(route.path, { lang: e.target.value === "nl" ? null : e.target.value }),
                true,
              )
            }
            className="h-9 max-w-20 rounded-md border border-white/20 bg-transparent px-1 text-sm [&>option]:text-foreground"
          >
            <option value="nl">NL</option>
            <option value="en">EN</option>
            <option value="ar">العربية</option>
          </select>
        </nav>
      </div>
    </header>
  );
}

export function ShopFooter() {
  const copy = useShopCopy();
  const nl = useShopText();
  const { link } = useShop();
  return (
    <footer className="mt-16 bg-brand text-brand-foreground">
      <div className="mx-auto max-w-7xl space-y-2 px-4 py-10 text-sm sm:px-6">
        <p className="text-xl font-extrabold">
          BOR<span className="text-red-400">V</span>AT
        </p>
        <p className="opacity-80">{nl.tagline}</p>
        <p className="opacity-80">{nl.footer}</p>
        <p className="opacity-70">{nl.footerNote}</p>
        <LocalLink href={link("/workbench")} data-testid="footer-workbench">
          {nl.workbench}
        </LocalLink>
      </div>
    </footer>
  );
}
