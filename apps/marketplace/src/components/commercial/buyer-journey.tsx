import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { formatEur } from "../../lib/format";
import { selectDemoProducts, type CommercialDemoAdapter } from "../../lib/commercial/demo-adapter";
import {
  buyerHref,
  buyerLocation,
  readDemoCatalog,
  type Catalog,
  type CatalogReader,
} from "../../lib/commercial/buyer-discovery";
import { CommercialWorkspace } from "./workspace";

import {
  browserBuyerNavigation,
  type BuyerNavigation,
} from "../../lib/commercial/buyer-navigation";
const NavigationContext = createContext<BuyerNavigation>(browserBuyerNavigation);

function LocalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const { navigate } = useContext(NavigationContext);
  return (
    <a
      href={href}
      className={
        className ??
        "underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
      }
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}
function MissingMedia() {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
      Originele afbeelding niet beschikbaar
    </div>
  );
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; catalog: Catalog };
type BuyerJourneyProps = {
  adapter: CommercialDemoAdapter;
  readCatalog?: CatalogReader;
  navigation?: BuyerNavigation;
  manageDocument?: boolean;
};
export function BuyerJourney({ navigation = browserBuyerNavigation, ...props }: BuyerJourneyProps) {
  return (
    <NavigationContext.Provider value={navigation}>
      <BuyerJourneyView {...props} />
    </NavigationContext.Provider>
  );
}
function BuyerJourneyView({
  adapter,
  readCatalog = readDemoCatalog,
  manageDocument = true,
}: BuyerJourneyProps) {
  const navigation = useContext(NavigationContext);
  const { navigate } = navigation;
  const href = useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getServerSnapshot,
  );
  const route = buyerLocation(href);
  const snapshot = useSyncExternalStore(
    adapter.subscribe,
    adapter.getSnapshot,
    adapter.getSnapshot,
  );
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoad((previous) => (previous.status === "ready" ? previous : { status: "loading" }));
    Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) throw new Error("Catalog read cancelled");
        return readCatalog(snapshot, controller.signal);
      })
      .then((catalog) => {
        if (!controller.signal.aborted) setLoad({ status: "ready", catalog });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ status: "error" });
      });
    return () => controller.abort();
  }, [snapshot, readCatalog, attempt]);
  useEffect(() => {
    setNotice("");
    setError("");
    document.querySelector<HTMLElement>("#buyer-main h1")?.focus();
  }, [route.path]);
  const catalog = load.status === "ready" ? load.catalog : { products: [], offers: [], skus: [] };
  const product = catalog.products.find((item) => item.id === route.productId);
  const productSkus = catalog.skus.filter((sku) => sku.productId === product?.id);
  const requestedOffer = catalog.offers.find(
    (offer) => offer.id === route.offerId && offer.productId === product?.id,
  );
  const selectedSku =
    productSkus.find((sku) => sku.id === route.skuId) ??
    productSkus.find((sku) => sku.id === requestedOffer?.skuId) ??
    productSkus[0];
  const offers = catalog.offers.filter(
    (offer) =>
      offer.productId === product?.id &&
      offer.skuId === selectedSku?.id &&
      offer.state === "published",
  );
  const selected = route.offerId ? offers.find((offer) => offer.id === route.offerId) : offers[0];
  const products = selectDemoProducts({ ...snapshot, ...catalog }, route);
  const link = (path: string, changes: Record<string, string | null> = {}) =>
    buyerHref(path, href, changes);
  const count = snapshot.cart.reduce((sum, line) => sum + line.quantity, 0);
  const discovery = route.path === "/" || route.path === "/discover";
  const detail = route.path.startsWith("/product/");
  useEffect(() => {
    if (!manageDocument) return;
    document.title = `${detail ? (product?.title ?? "Product") : discovery ? "Ontdek onze collectie" : route.path === "/cart" ? "Voorbeeldmandje" : "Lokale demo"} · BORVAT`;
    document.documentElement.lang = route.locale;
  }, [detail, discovery, product?.title, route.path, route.locale, manageDocument]);
  const filter = (changes: Record<string, string | null>) =>
    navigate(link("/discover", changes), true);
  const loadingPanel =
    load.status === "loading" ? (
      <p role="status">Voorbeeldcollectie laden…</p>
    ) : load.status === "error" ? (
      <div role="alert" className="space-y-3">
        <p>De voorbeeldcollectie kon niet worden geladen.</p>
        <Button onClick={() => setAttempt((value) => value + 1)}>Opnieuw proberen</Button>
      </div>
    ) : null;
  if (route.path === "/workbench")
    return (
      <>
        <CommercialWorkspace adapter={adapter} />
        <div className="mx-auto max-w-7xl px-5 pb-8">
          <LocalLink href={link("/discover")}>Terug naar ontdekken</LocalLink>
        </div>
      </>
    );
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#buyer-main" className="sr-only focus:not-sr-only focus:block focus:p-3">
        Ga naar inhoud
      </a>
      <div className="bg-accent px-4 py-2 text-center text-sm font-semibold text-accent-foreground">
        LOKALE DEMO · fictieve collectie · geen echte bestelling of betaling · herladen wist
        wijzigingen
      </div>
      <header className="bg-ink text-ink-foreground">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-6">
          <LocalLink
            href={link("/discover")}
            className="text-3xl font-extrabold tracking-tight focus-visible:outline-2"
          >
            BOR<span className="text-red-400">V</span>AT
          </LocalLink>
          <nav aria-label="Hoofdnavigatie" className="flex flex-wrap gap-5 text-sm">
            <LocalLink href={link("/discover")}>Ontdekken</LocalLink>
            <LocalLink href={link("/cart")}>Mandje ({count})</LocalLink>
            <LocalLink href={link("/requests")}>Demo-aanvragen</LocalLink>
          </nav>
          <div>
            <Label htmlFor="buyer-country">Land</Label>
            <select
              id="buyer-country"
              className="ml-2 rounded-md border bg-background px-3 py-2 text-foreground"
              value={route.country}
              onChange={(event) =>
                navigate(link(route.path, { country: event.target.value }), true)
              }
            >
              <option value="NL">Nederland</option>
              <option value="BE">België</option>
            </select>
          </div>
        </div>
      </header>
      <main id="buyer-main" tabIndex={-1} className="mx-auto max-w-7xl space-y-6 px-5 py-8">
        <p className="text-sm text-muted-foreground">
          {route.country === "NL" ? "Nederland" : "België"} · Nederlands · EUR. Landkeuze is een
          voorbeeld; levering en kosten zijn niet vastgesteld.
          {route.country === "BE" && " Franse vertaling is nog niet beschikbaar."}
        </p>
        {route.path === "/cart" || route.path === "/requests" ? (
          <CommercialWorkspace
            key={route.path}
            adapter={adapter}
            embeddedBuyer
            initialBuyerTab={route.path === "/cart" ? "Mandje" : "Aanvragen"}
            buyerNavigation={(tab) =>
              navigate(
                link(tab === "Producten" ? "/discover" : tab === "Mandje" ? "/cart" : "/requests"),
              )
            }
          />
        ) : discovery || detail ? (
          <>
            <h1 tabIndex={-1} className="text-3xl font-bold tracking-tight">
              {detail ? (product?.title ?? "Product bekijken") : "Ontdek onze voorbeeldcollectie"}
            </h1>
            {discovery && (
              <p className="max-w-2xl text-muted-foreground">
                Wonen en tuin, op jouw manier. Bekijk producten, vergelijk fictieve
                winkelaanbiedingen en stel je voorbeeldmandje samen.
              </p>
            )}
            {notice && (
              <p role="status" className="rounded-lg border p-3">
                {notice} <LocalLink href={link("/cart")}>Bekijk mandje</LocalLink>
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-lg border border-destructive p-3">
                {error}
              </p>
            )}
            {detail && <LocalLink href={link("/discover")}>Terug naar resultaten</LocalLink>}
            {discovery && (
              <section
                aria-label="Zoeken en filteren"
                className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-3"
              >
                <div>
                  <Label htmlFor="buyer-search">Zoek producten</Label>
                  <Input
                    id="buyer-search"
                    type="search"
                    value={route.query}
                    onChange={(event) => filter({ q: event.target.value })}
                    placeholder="Bijvoorbeeld eettafel"
                  />
                </div>
                <div>
                  <Label htmlFor="buyer-category">Categorie</Label>
                  <select
                    id="buyer-category"
                    className="block h-9 w-full rounded-md border bg-background px-3"
                    value={route.category}
                    onChange={(event) => filter({ category: event.target.value })}
                  >
                    {["Alles", "Wonen", "Tuin"].map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="buyer-sort">Sorteer</Label>
                  <select
                    id="buyer-sort"
                    className="block h-9 w-full rounded-md border bg-background px-3"
                    value={route.sort}
                    onChange={(event) => filter({ sort: event.target.value })}
                  >
                    <option value="title">Naam</option>
                    <option value="price">Laagste artikelprijs</option>
                  </select>
                </div>
              </section>
            )}
            {loadingPanel}
            {load.status === "ready" &&
              (discovery ? (
                <>
                  <p role="status">{products.length} voorbeeldproducten gevonden</p>
                  {!products.length && (
                    <div className="rounded-xl border p-6">
                      <p>Geen producten gevonden. Pas je zoekopdracht of filters aan.</p>
                      <Button
                        variant="outline"
                        className="mt-3"
                        onClick={() => filter({ q: null, category: null, sort: null })}
                      >
                        Wis filters
                      </Button>
                    </div>
                  )}
                  <section
                    aria-label="Productresultaten"
                    className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    {products.map((item) => (
                      <Card key={item.id} data-testid="discovery-product">
                        <CardHeader>
                          <MissingMedia />
                          <CardTitle className="pt-3 leading-snug">
                            <LocalLink
                              href={link(`/product/${encodeURIComponent(item.id)}`, {
                                offer: null,
                                sku: null,
                              })}
                            >
                              {item.title}
                            </LocalLink>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <p className="text-sm text-muted-foreground">{item.category}</p>
                          <p className="text-xl font-bold text-price">
                            Vanaf{" "}
                            {formatEur(
                              Math.min(
                                ...catalog.offers
                                  .filter(
                                    (offer) =>
                                      offer.productId === item.id && offer.state === "published",
                                  )
                                  .map((offer) => offer.priceCents),
                              ),
                            )}
                          </p>
                          <p className="text-sm">Voorbeeldprijs · verzendkosten niet berekend</p>
                          <LocalLink
                            href={link(`/product/${encodeURIComponent(item.id)}`, { offer: null, sku: null })}
                          >
                            Bekijk product en aanbiedingen
                          </LocalLink>
                        </CardContent>
                      </Card>
                    ))}
                  </section>
                </>
              ) : !product ? (
                <div role="status" className="rounded-xl border p-6">
                  Dit voorbeeldproduct is niet gevonden.{" "}
                  <LocalLink href={link("/discover")}>Bekijk de collectie</LocalLink>
                </div>
              ) : (
                <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
                  <div className="space-y-4">
                    <MissingMedia />
                    <h2 className="text-xl font-semibold">Over dit voorbeeldproduct</h2>
                    <p>
                      Categorie: {product.category}. Aanvullende productspecificaties en originele
                      media zijn nog niet beschikbaar.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Geen beoordelingen, bezorgdatum of retourvoorwaarden vastgesteld. Dit is een
                      fictieve productpresentatie.
                    </p>
                  </div>
                  <Card className="min-w-0">
                    <CardHeader>
                      <CardTitle className="break-words">Kies een voorbeeldaanbieding</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div>
                        <Label htmlFor="buyer-sku">Variant en verpakking</Label>
                        <select
                          id="buyer-sku"
                          data-testid="buyer-sku-select"
                          className="mt-2 block h-10 w-full rounded-md border bg-background px-3"
                          value={selectedSku?.id ?? ""}
                          disabled={!productSkus.length}
                          onChange={(event) =>
                            navigate(link(route.path, { sku: event.target.value, offer: null }), true)
                          }
                        >
                          {productSkus.map((sku) => (
                            <option key={sku.id} value={sku.id}>
                              {sku.variant} · {sku.packQuantity} per verpakking
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-sm text-muted-foreground">
                          De prijs hieronder geldt per verpakking. Aantallen in het mandje zijn verpakkingen.
                        </p>
                      </div>
                      <fieldset className="min-w-0 space-y-3">
                        <legend className="mb-3 font-semibold">
                          Voorbeeldwinkels · {selectedSku?.packQuantity ?? 1} per verpakking
                        </legend>
                        {offers.map((offer) => (
                          <label
                            key={offer.id}
                            className="flex cursor-pointer items-start gap-3 rounded-lg border p-4"
                          >
                            <input
                              type="radio"
                              name="buyer-offer"
                              value={offer.id}
                              checked={selected?.id === offer.id}
                              onChange={() => navigate(link(route.path, { offer: offer.id, sku: offer.skuId }), true)}
                              className="mt-1"
                            />
                            <span className="min-w-0 break-words">
                              <span className="block font-semibold">{offer.sellerName}</span>
                              <span className="block text-xl font-bold text-price">
                                {formatEur(offer.priceCents)}
                              </span>
                              <span className="block text-sm text-muted-foreground">
                                Fictieve aanbieding · voorbeeldverpakkingen beschikbaar{" "}
                                {offer.availabilityExample}
                              </span>
                            </span>
                          </label>
                        ))}
                      </fieldset>
                      {!offers.length && (
                        <p role="status">Geen zichtbaar voorbeeldaanbod voor dit product.</p>
                      )}
                      {!!offers.length && !selected && (
                        <p role="alert">De gekozen aanbieding is niet beschikbaar. Kies opnieuw.</p>
                      )}
                      <Button
                        className="w-full"
                        disabled={!selected || selected.availabilityExample < 1}
                        onClick={() => {
                          setNotice("");
                          setError("");
                          if (!selected) return;
                          try {
                            adapter.setQuantity(
                              selected.id,
                              (adapter
                                .getSnapshot()
                                .cart.find((line) => line.offerId === selected.id)?.quantity ?? 0) +
                                1,
                            );
                            setNotice(`Toegevoegd: ${selected.sellerName}.`);
                          } catch (cause) {
                            setError(
                              cause instanceof Error ? cause.message : "Toevoegen niet gelukt.",
                            );
                          }
                        }}
                      >
                        Voeg gekozen verpakking toe
                      </Button>
                      <p className="text-sm text-muted-foreground">
                        Verpakkingsprijs inclusief voorbeeld-btw. Geen berekende verzending, betaling,
                        voorraadreservering of leveringsbelofte.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              ))}
          </>
        ) : (
          <>
            <h1 tabIndex={-1} className="text-2xl font-bold">
              Pagina niet gevonden
            </h1>
            <LocalLink href={link("/discover")}>Naar de collectie</LocalLink>
          </>
        )}
        <footer className="space-y-3 border-t pt-6 text-sm text-muted-foreground">
          <p>
            BORVAT · Nederlands voorbeeld voor Nederland en België · uitsluitend lokaal geheugen
          </p>
          <LocalLink href={link("/workbench")}>Verkoper en beheer · demowerkbank</LocalLink>
          <p>WMS en Accounting zijn niet aangesloten. Geen echte bestellingen of betalingen.</p>
        </footer>
      </main>
    </div>
  );
}
