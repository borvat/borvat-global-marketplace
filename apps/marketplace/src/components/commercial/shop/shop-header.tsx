import { useShopCopy, useShopText } from "./i18n";
import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { Search, ShoppingCart, Heart, User, Truck, RotateCcw, Package, ChevronDown } from "lucide-react";
import { normalizeSearch } from "../../../lib/commercial/demo-adapter";
import { LocalLink, useShop } from "./shop-context";
import { nl } from "./nl";

function SearchBar() {
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
        .slice(0, 6)
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
    <form role="search" onSubmit={submit} className="relative w-full" data-testid="header-search-form">
      <label htmlFor="buyer-search" className="sr-only">
        {nl.searchLabel}
      </label>
      <div className="brv-search">
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
        />
        <button type="submit" data-testid="search-submit">
          <Search aria-hidden className="h-4 w-4" />
          <span className="hidden sm:inline">{nl.searchButton}</span>
        </button>
      </div>
      {show && (
        <ul
          id={listId}
          role="listbox"
          aria-label={nl.suggestions}
          data-testid="search-suggestions"
          className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
        >
          {suggestions.map((p, i) => (
            <li
              key={p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              data-testid={`search-suggestion-${p.id}`}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-muted" : "hover:bg-muted"}`}
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
  const reset = { q: null, category: null, min: null, max: null, stock: null, sort: null };
  return (
    <header className="sticky top-0 z-40">
      <div className="brv-util">
        <div className="brv-shell flex h-9 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4 overflow-hidden">
            <span className="hidden items-center gap-1.5 sm:flex">
              <Truck aria-hidden className="h-3.5 w-3.5" /> Gratis verzending vanaf € 29,-
            </span>
            <span className="hidden items-center gap-1.5 md:flex">
              Vandaag besteld, morgen in huis*
            </span>
            <span className="flex items-center gap-1.5">
              <RotateCcw aria-hidden className="h-3.5 w-3.5" /> Gratis retourneren
            </span>
          </div>
          <LocalLink href={link("/requests")} className="shrink-0">
            Klantenservice
          </LocalLink>
        </div>
      </div>

      <div className="brv-topbar">
        <div className="brv-shell flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 lg:flex-nowrap lg:gap-8">
          <LocalLink
            href={link("/discover", reset)}
            data-testid="header-logo"
            aria-label={copy("BORVAT – naar de startpagina")}
            className="shrink-0 text-[26px] font-black tracking-[-0.03em] text-foreground"
          >
            BOR<span className="text-primary">V</span>AT
            <span className="ml-1.5 hidden align-super text-[10px] font-semibold tracking-normal text-muted-foreground lg:inline">
              MARKETPLACE
            </span>
          </LocalLink>

          <div className="order-last w-full lg:order-none lg:max-w-[640px] lg:flex-1">
            <SearchBar />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <LocalLink
              href={link("/account")}
              className="hidden items-center gap-2 rounded px-2.5 py-2 text-[13px] hover:bg-muted sm:flex"
            >
              <User aria-hidden className="h-[18px] w-[18px]" />
              <span className="hidden lg:inline">Inloggen</span>
            </LocalLink>
            <LocalLink
              href={link("/requests")}
              data-testid="nav-orders"
              aria-label={nl.orders}
              className="flex items-center gap-2 rounded px-2.5 py-2 text-[13px] hover:bg-muted"
            >
              <Package aria-hidden className="h-[18px] w-[18px]" />
              <span className="hidden xl:inline">Bestellingen</span>
            </LocalLink>
            <LocalLink
              href={link("/account")}
              className="hidden items-center gap-2 rounded px-2.5 py-2 text-[13px] hover:bg-muted md:flex"
            >
              <Heart aria-hidden className="h-[18px] w-[18px]" />
              <span className="hidden xl:inline">Verlanglijst</span>
            </LocalLink>
            <LocalLink
              href={link("/cart")}
              data-testid="nav-cart"
              aria-label={`${nl.cart} (${count})`}
              className="flex items-center gap-2 rounded px-2.5 py-2 text-[13px] font-medium hover:bg-muted"
            >
              <span className="relative">
                <ShoppingCart aria-hidden className="h-[19px] w-[19px]" />
                <span
                  data-testid="cart-count"
                  className="brv-num absolute -right-2 -top-2 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
                >
                  {count}
                </span>
              </span>
              <span className="hidden lg:inline">{nl.cart}</span>
            </LocalLink>
          </div>
        </div>
      </div>

      <div className="brv-catrow">
        <div className="brv-shell flex items-center justify-between gap-4">
          <nav aria-label={copy("Hoofdnavigatie")} className="-mx-2 flex min-w-0 items-center overflow-x-auto">
            <LocalLink href={link("/discover", reset)} className="brv-catlink font-medium">
              <ChevronDown aria-hidden className="h-3.5 w-3.5" aria-hidden />
              Alle categorieën
            </LocalLink>
            <span aria-hidden className="mx-1 h-4 w-px bg-border" />
            {(["Wonen", "Tuin"] as const).map((c) => (
              <LocalLink
                key={c}
                href={link("/discover", { ...reset, category: c })}
                data-testid={`category-tile-${c.toLowerCase()}`}
                className="brv-catlink"
              >
                {copy(c)}
              </LocalLink>
            ))}
            <LocalLink href={link("/discover", { ...reset, sort: "price_asc" })} className="brv-catlink">
              Aanbiedingen
            </LocalLink>
          </nav>
          <div className="hidden items-center gap-3 text-[12.5px] text-muted-foreground lg:flex">
            <span>Zakelijk</span>
            <span>Cadeaukaart</span>
            <label htmlFor="buyer-country" className="sr-only">
              {nl.country}
            </label>
            <select
              id="buyer-country"
              data-testid="country-select"
              className="h-8 rounded border border-border bg-white px-1.5 text-[12.5px] text-foreground"
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
              className="h-8 rounded border border-border bg-white px-1.5 text-[12.5px] text-foreground"
              value={route.language}
              onChange={(e) =>
                navigate(link(route.path, { lang: e.target.value === "nl" ? null : e.target.value }), true)
              }
            >
              <option value="nl">NL</option>
              <option value="en">EN</option>
              <option value="ar">العربية</option>
            </select>
          </div>
        </div>
      </div>
    </header>
  );
}

export function ShopFooter() {
  const copy = useShopCopy();
  const nl = useShopText();
  const { link } = useShop();
  const columns: { title: string; items: string[] }[] = [
    { title: "Klantenservice", items: ["Bestelstatus", "Bezorging", "Retourneren", "Contact"] },
    { title: "Over BORVAT", items: ["Over ons", "Verkopen op BORVAT", "Zakelijk", "Werken bij"] },
    { title: "Voorwaarden", items: ["Algemene voorwaarden", "Privacy", "Cookies", "Toegankelijkheid"] },
  ];
  return (
    <footer className="mt-12 bg-ink text-ink-foreground">
      <div className="brv-shell grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <p className="text-xl font-black tracking-[-0.03em]">
            BOR<span className="text-primary">V</span>AT
          </p>
          <p className="max-w-xs text-[13px] leading-relaxed text-white/70">{nl.footer}</p>
          <p className="text-[12px] text-white/50">{nl.footerNote}</p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <p className="mb-2 text-[13px] font-semibold">{col.title}</p>
            <ul className="space-y-1.5 text-[13px] text-white/70">
              {col.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="brv-shell flex flex-wrap items-center justify-between gap-3 py-3 text-[12px] text-white/60">
          <span>© {new Date().getFullYear()} BORVAT · {nl.tagline}</span>
          <LocalLink href={link("/workbench")} data-testid="footer-workbench" className="hover:text-white">
            {nl.workbench}
          </LocalLink>
        </div>
      </div>
    </footer>
  );
}
