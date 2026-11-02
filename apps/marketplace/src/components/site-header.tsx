import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, ShoppingCart, User, Menu, Store, Heart, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import borvatLogo from "@/assets/borvat-logo.jpg.asset.json";

export function SiteHeader() {
  const [session, setSession] = useState<Session | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [q, setQ] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setCartCount(0);
      setWishlistCount(0);
      return;
    }
    supabase
      .from("cart_items")
      .select("quantity", { count: "exact" })
      .then(({ data }) => {
        setCartCount(data?.reduce((s, r) => s + (r.quantity ?? 0), 0) ?? 0);
      });
    supabase
      .from("wishlist_items")
      .select("id", { count: "exact" })
      .then(({ count }) => setWishlistCount(count ?? 0));
  }, [session]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-[2px]">
      <div className="brv-container flex h-16 items-center gap-6 md:h-20">
        <Link to="/" className="flex shrink-0 items-center" aria-label="Borvat home">
          <img src={borvatLogo.url} alt="Borvat" className="h-7 w-auto md:h-8" />
        </Link>

        <nav className="hidden items-center gap-7 text-[13px] md:flex" aria-label="Hoofdnavigatie">
          <Link to="/discover" className="brv-link tracking-wide">
            Ontdekken
          </Link>
          <Link to="/search" className="brv-link tracking-wide">
            Zoeken
          </Link>
          <Link to="/seller" className="brv-link tracking-wide">
            Verkopen
          </Link>
        </nav>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) navigate({ to: "/search", search: { q } });
          }}
          className="ml-auto hidden min-w-0 max-w-[280px] flex-1 items-center gap-2 border-b border-border focus-within:border-foreground md:flex"
          role="search"
        >
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Waar ben je naar op zoek?"
            aria-label="Zoeken in de collectie"
            className="w-full bg-transparent py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </form>

        <nav className="ml-auto flex items-center gap-4 md:ml-0 md:gap-5" aria-label="Account">
          {session ? (
            <>
              <Link
                to="/account"
                className="brv-link hidden items-center gap-2 text-[13px] md:inline-flex"
              >
                <User className="h-4 w-4" aria-hidden="true" />
                Account
              </Link>
              <Link
                to="/wishlist"
                className="brv-link relative hidden items-center gap-2 text-[13px] md:inline-flex"
              >
                <Heart className="h-4 w-4" aria-hidden="true" />
                Bewaard
                {wishlistCount > 0 && (
                  <span className="brv-price absolute -right-3 -top-2 text-[11px] text-accent">
                    {wishlistCount}
                  </span>
                )}
              </Link>
            </>
          ) : (
            <Link
              to="/auth"
              className="brv-link hidden items-center gap-2 text-[13px] md:inline-flex"
            >
              <User className="h-4 w-4" aria-hidden="true" />
              Inloggen
            </Link>
          )}
          <Link
            to="/cart"
            className="relative inline-flex items-center gap-2 text-[13px]"
            aria-label={`Winkelmandje, ${cartCount} artikelen`}
          >
            <ShoppingCart className="h-5 w-5" aria-hidden="true" />
            <span className="brv-link hidden md:inline">Mandje</span>
            {cartCount > 0 && (
              <span className="brv-price absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium text-accent-foreground md:-right-1">
                {cartCount}
              </span>
            )}
          </Link>
          <button
            className="inline-flex h-10 w-10 items-center justify-center md:hidden"
            onClick={() => setMobileMenu(!mobileMenu)}
            aria-label={mobileMenu ? "Menu sluiten" : "Menu openen"}
            aria-expanded={mobileMenu}
          >
            {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>
      </div>

      {mobileMenu && (
        <div className="border-t border-border bg-background px-5 py-4 md:hidden">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) {
                setMobileMenu(false);
                navigate({ to: "/search", search: { q } });
              }
            }}
            className="mb-4 flex items-center gap-2 border-b border-border"
          >
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Waar ben je naar op zoek?"
              aria-label="Zoeken in de collectie"
              className="w-full bg-transparent py-2 text-sm outline-none"
            />
          </form>
          <div className="grid gap-3 text-sm">
            {([
              ["/", "Home"],
              ["/discover", "Ontdekken"],
              ["/cart", `Winkelmandje (${cartCount})`],
              ["/wishlist", `Verlanglijstje (${wishlistCount})`],
              ["/account", "Account"],
              ["/seller", "Verkopen"],
            ] as const).map(([to, label]) => (
              <Link key={to} to={to} className="brv-link w-fit" onClick={() => setMobileMenu(false)}>
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <CategoryStrip />
    </header>
  );
}

function CategoryStrip() {
  const [cats, setCats] = useState<{ slug: string; name: string }[]>([]);
  useEffect(() => {
    supabase
      .from("categories")
      .select("slug,name")
      .order("sort_order")
      .then(({ data }) => setCats(data ?? []));
  }, []);
  if (cats.length === 0) return null;
  return (
    <div className="hidden border-t border-border md:block">
      <div className="brv-container flex items-center gap-7 overflow-x-auto py-2.5 text-[12px] tracking-wide">
        <Store className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        {cats.map((c) => (
          <Link
            key={c.slug}
            to="/c/$slug"
            params={{ slug: c.slug }}
            className="whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
          >
            {c.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border bg-ink text-ink-foreground">
      <div className="brv-container grid grid-cols-2 gap-10 py-16 text-[13px] md:grid-cols-4">
        <div>
          <h4 className="brv-eyebrow mb-3 !text-ink-foreground/60">Service &amp; contact</h4>
          <ul className="space-y-2 opacity-90">
            <li>Klantenservice</li>
            <li>Bezorgopties</li>
            <li>Retourneren</li>
          </ul>
        </div>
        <div>
          <h4 className="brv-eyebrow mb-3 !text-ink-foreground/60">Over BORVAT</h4>
          <ul className="space-y-2 opacity-90">
            <li>Over ons</li>
            <li>Werken bij</li>
            <li>Pers</li>
          </ul>
        </div>
        <div>
          <h4 className="brv-eyebrow mb-3 !text-ink-foreground/60">Verkopen</h4>
          <ul className="space-y-2 opacity-90">
            <li>
              <Link to="/seller" className="brv-link">
                Word verkoper
              </Link>
            </li>
            <li>Verkopers-hulp</li>
          </ul>
        </div>
        <div>
          <h4 className="brv-eyebrow mb-3 !text-ink-foreground/60">Betaalmethoden</h4>
          <p className="opacity-90">iDEAL, creditcard, achteraf betalen</p>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-[11px] tracking-wide opacity-70">
        © Borvat® — Smart living, made affordable. Demo-omgeving, geen echte bestellingen.
      </div>
    </footer>
  );
}
