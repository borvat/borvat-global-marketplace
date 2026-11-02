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
      <div className="flex items-center gap-2 border-b border-border text-foreground transition-colors focus-within:border-foreground">
        <Search aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
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
          className="h-11 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          data-testid="search-submit"
          className="flex h-11 items-center px-2 text-[11px] font-medium uppercase tracking-[0.14em] text-foreground"
        >
          <span className="sr-only sm:not-sr-only">{nl.searchButton}</span>
          <Search aria-hidden className="ml-2 h-4 w-4 sm:hidden" />
        </button>
      </div>
      {show && (
        <ul
          id={listId}
          role="listbox"
          aria-label={nl.suggestions}
          data-testid="search-suggestions"
          className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden border border-border bg-popover text-popover-foreground shadow-[0_1px_2px_rgb(23_22_26_/_0.06)]"
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
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-[2px]">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-5 py-3 sm:px-8 md:h-20 md:flex-row md:items-center md:gap-8 md:py-0">
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
          className="font-display shrink-0 text-[22px] tracking-[0.18em] text-foreground md:text-[26px]"
        >
          BOR<span className="text-accent">V</span>AT
        </LocalLink>

        <div className="order-3 w-full md:order-none md:max-w-[300px] md:flex-1">
          <SearchBox />
        </div>

        <nav
          aria-label={copy("Hoofdnavigatie")}
          className="order-2 flex min-w-0 flex-wrap items-center justify-end gap-1 text-[12px] md:order-none md:ml-auto md:gap-5 md:text-[13px]"
        >
          <LocalLink
            href={link("/requests")}
            data-testid="nav-orders"
            className="brv-link flex items-center gap-1.5 px-2 py-2 md:px-0"
            aria-label={nl.orders}
          >
            <Package aria-hidden className="h-4 w-4" />
            <span className="hidden lg:inline">{nl.orders}</span>
          </LocalLink>
          <LocalLink
            href={link("/cart")}
            data-testid="nav-cart"
            aria-label={`${nl.cart} (${count})`}
            className="flex items-center gap-1.5 px-2 py-2 md:px-0"
          >
            <ShoppingCart aria-hidden className="h-5 w-5" />
            <span className="brv-link hidden sm:inline">{nl.cart}</span>
            <span
              data-testid="cart-count"
              className="brv-price ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-medium text-accent-foreground"
            >
              {count}
            </span>
          </LocalLink>
          <span aria-hidden className="hidden h-4 w-px bg-border md:block" />
          <label htmlFor="buyer-country" className="sr-only">
            {nl.country}
          </label>
          <select
            id="buyer-country"
            data-testid="country-select"
            className="h-8 border-0 bg-transparent text-[12px] uppercase tracking-[0.08em] text-muted-foreground outline-none [&>option]:text-foreground"
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
            className="h-8 max-w-20 border-0 bg-transparent text-[12px] uppercase tracking-[0.08em] text-muted-foreground outline-none [&>option]:text-foreground"
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
    <footer className="mt-24 border-t border-border bg-ink text-ink-foreground">
      <div className="mx-auto max-w-[1240px] space-y-3 px-5 py-16 text-sm sm:px-8">
        <p className="font-display text-xl tracking-[0.18em]">
          BOR<span className="text-accent">V</span>AT
        </p>
        <p className="opacity-80">{nl.tagline}</p>
        <p className="max-w-xl opacity-70">{nl.footer}</p>
        <p className="text-[12px] opacity-60">{nl.footerNote}</p>
        <LocalLink href={link("/workbench")} data-testid="footer-workbench" className="brv-link inline-block">
          {nl.workbench}
        </LocalLink>
      </div>
    </footer>
  );
}
