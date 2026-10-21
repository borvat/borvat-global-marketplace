import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, ShoppingCart, User, Menu, Store, Heart, LogOut } from "lucide-react";
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
    <header className="bg-brand text-brand-foreground sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-3 py-2 flex items-center gap-3">
        <Link to="/" className="flex items-center shrink-0 bg-white rounded-lg px-3 py-1.5" aria-label="Borvat home">
          <img src={borvatLogo.url} alt="Borvat" className="h-8 w-auto" />
        </Link>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) navigate({ to: "/search", search: { q } });
          }}
          className="flex-1 flex bg-white rounded-lg overflow-hidden shadow-sm"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Waar ben je naar op zoek?"
            className="flex-1 px-3 py-2 text-foreground text-sm outline-none"
          />
          <button
            type="submit"
            className="bg-accent-yellow text-accent-foreground px-4 flex items-center font-bold"
            aria-label="Zoeken"
          >
            <Search className="w-5 h-5" />
          </button>
        </form>

        <nav className="hidden md:flex items-center gap-4 text-sm">
          {session ? (
            <>
              <Link to="/account" className="flex items-center gap-1 hover:underline">
                <User className="w-4 h-4" /> Account
              </Link>
              <Link to="/wishlist" className="flex items-center gap-1 hover:underline relative">
                <Heart className="w-4 h-4" /> Verlanglijstje
                {wishlistCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-accent-yellow text-accent-foreground text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    {wishlistCount}
                  </span>
                )}
              </Link>
            </>
          ) : (
            <Link to="/auth" className="flex items-center gap-1 hover:underline">
              <User className="w-4 h-4" /> Inloggen
            </Link>
          )}
          <Link to="/seller" className="flex items-center gap-1 hover:underline">
            <Store className="w-4 h-4" /> Verkopen
          </Link>
          <Link to="/cart" className="flex items-center gap-1 hover:underline relative">
            <ShoppingCart className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-accent-yellow text-accent-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {cartCount}
              </span>
            )}
          </Link>
        </nav>

        <button
          className="md:hidden p-2"
          onClick={() => setMobileMenu(!mobileMenu)}
          aria-label="Menu"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {mobileMenu && (
        <div className="md:hidden border-t border-white/10 bg-brand/95 px-3 py-2 space-y-2 text-sm">
          <Link to="/" className="block py-1 hover:underline">Home</Link>
          <Link to="/cart" className="block py-1 hover:underline">Winkelmandje ({cartCount})</Link>
          <Link to="/wishlist" className="block py-1 hover:underline">Verlanglijstje ({wishlistCount})</Link>
          <Link to="/account" className="block py-1 hover:underline">Account</Link>
          <Link to="/seller" className="block py-1 hover:underline">Verkopen</Link>
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
  return (
    <div className="bg-brand/90 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-3 py-2 flex gap-4 overflow-x-auto text-sm items-center">
        <Menu className="w-4 h-4 shrink-0" />
        {cats.map((c) => (
          <Link
            key={c.slug}
            to="/c/$slug"
            params={{ slug: c.slug }}
            className="whitespace-nowrap hover:underline"
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
    <footer className="bg-brand text-brand-foreground mt-12">
      <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
        <div>
          <h4 className="font-bold mb-2">Service & contact</h4>
          <ul className="space-y-1 opacity-90">
            <li>Klantenservice</li>
            <li>Bezorgopties</li>
            <li>Retourneren</li>
          </ul>
        </div>
        <div>
          <h4 className="font-bold mb-2">Over marktje</h4>
          <ul className="space-y-1 opacity-90">
            <li>Over ons</li>
            <li>Werken bij</li>
            <li>Pers</li>
          </ul>
        </div>
        <div>
          <h4 className="font-bold mb-2">Verkopen</h4>
          <ul className="space-y-1 opacity-90">
            <li>
              <Link to="/seller" className="hover:underline">
                Word verkoper
              </Link>
            </li>
            <li>Verkopers-hulp</li>
          </ul>
        </div>
        <div>
          <h4 className="font-bold mb-2">Betaalmethoden</h4>
          <p className="opacity-90">iDEAL, creditcard, achteraf betalen</p>
        </div>
      </div>
      <div className="border-t border-white/10 py-3 text-center text-xs opacity-80">
        © Borvat® — Smart living, made affordable.
      </div>
    </footer>
  );
}
