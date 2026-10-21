import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatEur } from "@/lib/format";
import { readRecentBuyerOrders, buyerOrderStatus, type RecentBuyerOrder } from "@/lib/buyer-account";
import { toast } from "sonner";
import { ArrowRight, ChevronDown, ChevronRight, Heart, LogOut, MessageCircle, Package, ReceiptText, RotateCcw, Settings, ShieldCheck, Store, UserRound, type LucideIcon } from "lucide-react";

export const Route = createFileRoute("/account")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Mijn account — BORVAT" },
    { name: "description", content: "Je persoonlijke BORVAT-overzicht: recente bestellingen, je gegevens, verlanglijst en klantenservice." },
    { name: "robots", content: "noindex" },
    { property: "og:title", content: "Mijn account — BORVAT" },
    { property: "og:description", content: "Je bestellingen, verlanglijst en accountgegevens bij BORVAT op één plek." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Account,
});

type AccountData = { uid: string; name: string | null; email: string | null; profileError: boolean };
type OrdersState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; orders: RecentBuyerOrder[] };
type Destination = "/account" | "/orders" | "/wishlist" | "/account/support" | "/seller";
const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function Account() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<AccountData | null>(null);
  const [accountError, setAccountError] = useState(false);
  const [orders, setOrders] = useState<OrdersState>({ kind: "loading" });
  const [wishlistCount, setWishlistCount] = useState<number | null>(null);
  const [wishlistLoaded, setWishlistLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setAccountError(false);
    setOrders({ kind: "loading" });
    setWishlistLoaded(false);
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setAccount(null);
        setOrders({ kind: "loading" });
        setWishlistCount(null);
        void navigate({ to: "/auth", replace: true });
      }
      if (event === "SIGNED_IN" || event === "USER_UPDATED") setAttempt(value => value + 1);
    });
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!data.user) {
          void navigate({ to: "/auth", replace: true });
          return;
        }
        if (error) { setAccountError(true); return; }
        const uid = data.user.id;
        setAccount({ uid, name: null, email: data.user.email ?? null, profileError: false });
        // Independent results: an unavailable wishlist must never hide real orders.
        await Promise.allSettled([
          (async () => {
            const result = await supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle();
            if (!cancelled) setAccount({ uid, name: result.data?.full_name?.trim() || null, email: data.user?.email ?? null, profileError: Boolean(result.error) });
          })(),
          (async () => {
            try {
              const result = await readRecentBuyerOrders(supabase, uid);
              if (!cancelled) setOrders(result.error ? { kind: "error" } : { kind: "ready", orders: result.data ?? [] });
            } catch { if (!cancelled) setOrders({ kind: "error" }); }
          })(),
          (async () => {
            try {
              const result = await supabase.from("wishlist_items").select("id", { count: "exact", head: true }).eq("user_id", uid);
              if (!cancelled) setWishlistCount(result.error ? null : result.count ?? 0);
            } finally { if (!cancelled) setWishlistLoaded(true); }
          })(),
        ]);
      } catch { if (!cancelled) setAccountError(true); }
    })();
    return () => { cancelled = true; subscription.subscription.unsubscribe(); };
  }, [navigate, attempt]);

  async function signOut() {
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      toast.success("Je bent uitgelogd");
      void navigate({ to: "/auth", replace: true });
    } catch { toast.error("Uitloggen is niet gelukt. Probeer het opnieuw."); }
    finally { setSigningOut(false); }
  }

  if (accountError) return <div className="mx-auto max-w-lg px-4 py-20 text-center" role="alert">
    <UserRound className="mx-auto mb-4 size-8 text-muted-foreground" aria-hidden="true" />
    <h1 className="text-2xl font-bold">Je account is even niet beschikbaar</h1>
    <p className="mt-3 text-sm text-muted-foreground">We konden je gegevens niet ophalen. Probeer het opnieuw.</p>
    <Button className="mt-6" onClick={() => setAttempt(value => value + 1)}>Opnieuw proberen</Button>
  </div>;

  return <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-10">
    <div className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
      <Link to="/" className={`rounded-sm hover:text-foreground ${focus}`}>Home</Link>
      <ChevronRight className="size-3" aria-hidden="true" /><span>Mijn account</span>
    </div>
    <div className="grid min-w-0 gap-6 lg:grid-cols-[224px_minmax(0,1fr)] lg:gap-10">
      <aside className="min-w-0" aria-label="Accountmenu">
        <div className="mb-5 hidden lg:block">
          <p className="text-xs font-semibold text-accent">BORVAT®</p>
          <h2 className="mt-1 text-xl font-bold">Mijn account</h2>
        </div>
        <Button variant="secondary" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="buyer-account-navigation" className="h-12 w-full justify-between lg:hidden">
          <span className="flex items-center gap-2"><UserRound aria-hidden="true" />Mijn account</span><ChevronDown className={menuOpen ? "rotate-180" : ""} aria-hidden="true" />
        </Button>
        <nav id="buyer-account-navigation" aria-label="Mijn account" className={`${menuOpen ? "grid" : "hidden"} mt-3 gap-1 lg:mt-0 lg:grid`}>
          <NavEntry icon={UserRound} label="Mijn account" to="/account" active />
          <NavEntry icon={Package} label="Bestellingen" to="/orders" />
          <NavEntry icon={ReceiptText} label="Facturen" />
          <NavEntry icon={RotateCcw} label="Retouren" />
          <NavEntry icon={MessageCircle} label="Gesprekken" to="/account/support" demo />
          <NavEntry icon={Settings} label="Gegevens & voorkeuren" />
          <NavEntry icon={Heart} label="Verlanglijst" to="/wishlist" />
          <div className="my-3 border-t border-border" />
          <NavEntry icon={Store} label="Verkopen" to="/seller" />
          <Button variant="ghost" onClick={signOut} disabled={!account || signingOut} className="h-11 justify-start px-3 text-muted-foreground hover:bg-muted hover:text-destructive">
            <LogOut aria-hidden="true" />{signingOut ? "Uitloggen…" : "Uitloggen"}
          </Button>
        </nav>
        <div className="mt-8 hidden border-t border-border pt-5 lg:block">
          <div className="flex items-center gap-2 text-xs font-medium"><ShieldCheck className="size-4 text-success" aria-hidden="true" />Persoonlijk & veilig</div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Jouw aankopen. Jouw overzicht.</p>
        </div>
      </aside>

      <div className="min-w-0 space-y-8">
        <section aria-labelledby="account-greeting" className="bg-gradient-to-br from-account-sky via-account-sky-soft to-background px-5 py-7 sm:px-8 sm:py-8">
          <p className="mb-2 text-xs font-semibold text-account-sky-foreground">Fijn dat je er bent</p>
          <h1 id="account-greeting" className="break-words text-3xl font-bold leading-tight sm:text-4xl">
            {account ? (account.name ? `Hallo, ${account.name}` : "Welkom bij je account") : "Je account laden…"}<span className="text-accent">.</span>
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Alles rondom jouw aankopen, op één plek.</p>
          <div className="mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Shortcut icon={Package} label="Bestellingen" detail="Bekijk je aankopen" to="/orders" />
            <Shortcut icon={ReceiptText} label="Facturen" detail="Nog niet beschikbaar" />
            <Shortcut icon={RotateCcw} label="Retouren" detail="Nog niet beschikbaar" />
            <Shortcut icon={MessageCircle} label="Klantenservice" detail="Voorbeeld — geen live service" to="/account/support" demo />
          </div>
        </section>

        <section aria-labelledby="latest-orders" aria-busy={orders.kind === "loading"}>
          <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <h2 id="latest-orders" className="text-xl font-bold">Laatste bestellingen</h2>
            <Button asChild variant="link" className="h-auto px-0 text-xs sm:text-sm"><Link to="/orders">Alle bestellingen <ArrowRight aria-hidden="true" /></Link></Button>
          </div>
          {orders.kind === "loading" ? <div role="status" className="space-y-3"><span className="sr-only">Bestellingen laden</span>{[0, 1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />)}</div>
            : orders.kind === "error" ? <div role="alert" className="border-y border-border py-8">
              <p className="font-medium">Je bestellingen konden niet worden geladen</p><p className="mt-1 text-sm text-muted-foreground">Probeer het opnieuw. Je accountgegevens blijven beschikbaar.</p>
              <Button variant="secondary" className="mt-4" onClick={() => setAttempt(value => value + 1)}>Opnieuw proberen</Button>
            </div>
            : orders.orders.length === 0 ? <div className="grid gap-5 border-y border-border py-8 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
              <div className="grid size-14 place-items-center rounded-lg bg-muted"><Package className="size-7 text-muted-foreground" aria-hidden="true" /></div>
              <div><h3 className="font-semibold">Je eerste bestelling begint hier</h3><p className="mt-1 text-sm text-muted-foreground">Je hebt nog geen bestellingen bij BORVAT.</p></div>
              <Button asChild variant="secondary"><Link to="/">Verder winkelen <ArrowRight aria-hidden="true" /></Link></Button>
            </div>
            : <ul className="divide-y divide-border border-y border-border">{orders.orders.map(order => {
              const status = buyerOrderStatus(order.status);
              return <li key={order.id} className="py-5"><Link to="/orders" aria-label={`Bekijk bestelling ${order.id}`} className={`grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 rounded-md sm:gap-5 ${focus}`}>
                <div className="grid size-12 place-items-center rounded-md bg-muted"><Package className="size-6 text-brand" aria-hidden="true" /></div>
                <div className="min-w-0"><p className="font-semibold">Bestelling #{order.id.slice(0, 8)}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}</p>
                  <span className={`mt-2 inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium ${status.tone === "success" ? "bg-success/10 text-success" : status.tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground"}`}><span className="size-1.5 rounded-full bg-current" aria-hidden="true" />{status.label}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2"><span className="text-sm font-semibold tabular-nums sm:text-base">{formatEur(order.total_cents)}</span><ChevronRight className="hidden size-4 text-muted-foreground sm:block" aria-hidden="true" /></div>
              </Link></li>;
            })}</ul>}
        </section>

        <div className="grid min-w-0 gap-5 md:grid-cols-2">
          <section aria-labelledby="your-details" className="min-w-0 rounded-lg border border-border bg-card p-6">
            <div className="flex items-center gap-3"><UserRound className="size-5 text-accent" aria-hidden="true" /><h2 id="your-details" className="text-lg font-bold">Jouw gegevens</h2></div>
            <dl className="mt-5 space-y-4 text-sm"><div><dt className="text-xs text-muted-foreground">Naam</dt><dd className="mt-1 break-words font-medium">{!account ? "Laden…" : account.profileError ? "Naam kon niet worden geladen" : account.name || "Geen naam ingesteld"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">E-mailadres</dt><dd className="mt-1 break-all font-medium">{account ? account.email || "Geen e-mailadres beschikbaar" : "Laden…"}</dd></div></dl>
            <div className="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">Gegevens wijzigen, adressen en voorkeuren zijn nog niet beschikbaar.</div>
          </section>
          <section aria-labelledby="your-wishlist" className="min-w-0 rounded-lg border border-border bg-card p-6">
            <div className="flex items-center gap-3"><Heart className="size-5 text-accent" aria-hidden="true" /><h2 id="your-wishlist" className="text-lg font-bold">Verlanglijst</h2></div>
            <p className="mt-5 text-2xl font-bold">{!wishlistLoaded ? "Laden…" : wishlistCount === null ? "Jouw favorieten" : `${wishlistCount} ${wishlistCount === 1 ? "favoriet" : "favorieten"}`}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{wishlistLoaded && wishlistCount === null ? "Het aantal favorieten kon niet worden geladen." : wishlistCount === 0 ? "Iets moois gezien? Je bewaarde producten vind je hier terug." : "Al je bewaarde producten bij elkaar."}</p>
            <Button asChild variant="link" className="mt-5 h-auto px-0"><Link to="/wishlist">Naar je verlanglijst <ArrowRight aria-hidden="true" /></Link></Button>
          </section>
        </div>

        <section aria-labelledby="borvat-support" className="grid gap-4 border-t border-border pt-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><MessageCircle className="size-5 text-muted-foreground" aria-hidden="true" /><h2 id="borvat-support" className="font-semibold">Hulp via BORVAT</h2><DemoBadge /></div>
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground">BORVAT bemiddelt tussen jou en de verkoper. Gesprekken zijn uitsluitend een demo: berichten worden niet echt verzonden.</p></div>
          <Button asChild variant="secondary"><Link to="/account/support">Bekijk de demo <ArrowRight aria-hidden="true" /></Link></Button>
        </section>
      </div>
    </div>
  </div>;
}

function DemoBadge() { return <span className="rounded border border-accent/25 bg-accent/5 px-1.5 py-0.5 text-[10px] font-bold text-accent">DEMO</span>; }

function NavEntry({ icon: Icon, label, to, active, demo }: { icon: LucideIcon; label: string; to?: Destination; active?: boolean; demo?: boolean }) {
  if (!to) return <div aria-disabled="true" className="flex min-h-11 items-center gap-3 px-3 py-2 text-muted-foreground"><Icon className="size-4 shrink-0" aria-hidden="true" /><div className="min-w-0"><p className="text-sm">{label}</p><p className="text-[10px]">Nog niet beschikbaar</p></div></div>;
  return <Button asChild variant="ghost" className={`h-11 w-full justify-start px-3 hover:bg-muted hover:text-foreground ${active ? "bg-card font-semibold text-foreground border-l-2 border-accent" : "text-muted-foreground"}`}><Link to={to} aria-current={active ? "page" : undefined}><Icon aria-hidden="true" /><span>{label}</span>{demo && <DemoBadge />}</Link></Button>;
}

function Shortcut({ icon: Icon, label, detail, to, demo }: { icon: LucideIcon; label: string; detail: string; to?: Destination; demo?: boolean }) {
  const contents = <><div className="flex items-center justify-between gap-2"><Icon className={`size-6 ${to ? "text-account-sky-foreground" : "text-muted-foreground"}`} aria-hidden="true" />{demo ? <DemoBadge /> : to ? <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" /> : null}</div><span className="mt-5 block break-words text-sm font-semibold">{label}</span><span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">{detail}</span></>;
  const classes = "block min-w-0 min-h-36 rounded-lg border border-border/60 bg-card p-4 text-left";
  return to ? <Button asChild variant="ghost" className={`${classes} h-auto whitespace-normal hover:bg-card hover:text-foreground hover:border-account-sky-foreground/40 ${focus}`}><Link to={to}>{contents}</Link></Button> : <div aria-disabled="true" className={classes}>{contents}</div>;
}
