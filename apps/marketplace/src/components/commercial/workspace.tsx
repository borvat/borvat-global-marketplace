import { useState, useSyncExternalStore } from "react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { formatEur } from "../../lib/format";
import { rehearsalCatalog } from "../../lib/commercial/catalog-rehearsal";
import {
  parseDemoPrice,
  selectDemoProducts,
  type CommercialDemoAdapter,
  type DemoOffer,
  type DemoOrder,
} from "../../lib/commercial/demo-adapter";

type View = "Koper" | "Verkoper" | "Beheer";
type BuyerTab = "Producten" | "Mandje" | "Aanvragen";
const stateLabel = { published: "Zichtbaar", draft: "Concept", review: "Ter beoordeling" };

function OfferEditor({
  offer,
  adapter,
  act,
}: {
  offer: DemoOffer;
  adapter: CommercialDemoAdapter;
  act: (work: () => void) => void;
}) {
  const [price, setPrice] = useState((offer.priceCents / 100).toFixed(2));
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <Label htmlFor={`price-${offer.id}`}>Voorbeeldprijs in euro</Label>
        <Input
          id={`price-${offer.id}`}
          className="w-36"
          inputMode="decimal"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
        />
      </div>
      <Button
        variant="outline"
        onClick={() => act(() => adapter.setOfferPrice(offer.id, parseDemoPrice(price)))}
      >
        Bewaar concept
      </Button>
      {offer.state === "draft" && (
        <Button onClick={() => act(() => adapter.requestReview(offer.id))}>
          Vraag beoordeling
        </Button>
      )}
    </div>
  );
}

function OrderSummary({
  order,
  sellerId,
  adapter,
  act,
}: {
  order: DemoOrder;
  sellerId?: string;
  adapter: CommercialDemoAdapter;
  act: (work: () => void) => void;
}) {
  const lines = sellerId ? order.lines.filter((line) => line.sellerId === sellerId) : order.lines;
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
  const prepared = sellerId
    ? order.preparedSellerIds.includes(sellerId)
    : order.status === "voorbereid";
  return (
    <Card data-testid="order">
      <CardHeader>
        <CardTitle>{order.id}</CardTitle>
        <Badge variant="outline">{prepared ? "Demo voorbereid" : "Demo-aanvraag ontvangen"}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul>
          {lines.map((line) => (
            <li key={line.offerId} className="py-1">
              {line.quantity} {line.quantity === 1 ? "verpakking" : "verpakkingen"} × {line.title} ·{" "}
              {line.variant} · {line.packQuantity} per verpakking · {formatEur(line.unitPriceCents)}{" "}
              per verpakking
              <p className="text-sm text-muted-foreground">
                {line.sellerName} ·{" "}
                {order.preparedSellerIds.includes(line.sellerId)
                  ? "Demo voorbereid"
                  : "Demo-aanvraag ontvangen"}
              </p>
            </li>
          ))}
        </ul>
        <p className="font-semibold">Verpakkingen totaal: {formatEur(total)}</p>
        <p className="text-sm text-muted-foreground">
          Alleen lokaal. Geen betaling, voorraadreservering, factuur of verzending. Status geldt per
          voorbeeldwinkel.
        </p>
        {sellerId && !prepared && (
          <Button onClick={() => act(() => adapter.prepareOrder(order.id, sellerId))}>
            Markeer demo als voorbereid
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function CommercialWorkspace({
  adapter,
  initialView = "Koper",
  initialBuyerTab = "Producten",
  embeddedBuyer = false,
  buyerNavigation,
}: {
  adapter: CommercialDemoAdapter;
  initialView?: View;
  initialBuyerTab?: BuyerTab;
  embeddedBuyer?: boolean;
  buyerNavigation?: (tab: BuyerTab) => void;
}) {
  const data = useSyncExternalStore(
    adapter.subscribe,
    adapter.getSnapshot,
    adapter.getServerSnapshot,
  );
  const catalog = rehearsalCatalog(data);
  const [view, setView] = useState<View>(initialView);
  const [buyerTab, setBuyerTab] = useState<BuyerTab>(initialBuyerTab);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Alles");
  const [sort, setSort] = useState("title");
  const [selected, setSelected] = useState(data.products[0].id);
  const [sellerId, setSellerId] = useState(catalog.stores[0]?.id ?? "");
  const [resetVersion, setResetVersion] = useState(0);
  const [clearedQuantity, setClearedQuantity] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const act = (work: () => void) => {
    setError("");
    setNotice("");
    try {
      work();
      setNotice("Het lokale voorbeeld is bijgewerkt.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Het voorbeeld kon niet worden bijgewerkt.",
      );
    }
  };
  const published = data.offers.filter((offer) => offer.state === "published");
  const bestPrice = (productId: string) =>
    Math.min(
      ...published
        .filter((offer) => offer.productId === productId)
        .map((offer) => offer.priceCents),
    );
  const products = selectDemoProducts(data, {
    query,
    category,
    sort: sort === "price" ? "price" : "title",
  });
  const product = data.products.find((item) => item.id === selected);
  const offers = published
    .filter((offer) => offer.productId === selected)
    .sort((a, b) => a.priceCents - b.priceCents);
  let quoteError = "";
  let quote;
  try {
    quote = adapter.quote();
  } catch (cause) {
    quoteError = cause instanceof Error ? cause.message : "Mandje niet beschikbaar.";
  }
  const sellerOffers = data.offers.filter((offer) => offer.sellerId === sellerId);
  const sellerOrders = data.orders.filter((order) =>
    order.lines.some((line) => line.sellerId === sellerId),
  );
  const review = data.offers.filter((offer) => offer.state === "review");
  const count = data.cart.reduce((sum, line) => sum + line.quantity, 0);
  const Content = embeddedBuyer ? "div" : "main";
  return (
    <div className="min-h-screen bg-background text-foreground">
      {!embeddedBuyer && (
        <>
          <div className="bg-accent px-4 py-3 text-center text-sm font-semibold text-accent-foreground">
            LOKALE DEMO · fictieve gegevens · geen betaling of echte bestelling · aanvragen in deze
            browser; aanbodwijzigingen verdwijnen bij herladen
          </div>
          <header className="bg-ink text-ink-foreground">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-6">
              <div>
                <span className="text-3xl font-extrabold tracking-tight">
                  BOR<span className="text-red-400">V</span>AT
                </span>
                <p className="mt-1 text-sm">Samen ontdekken. Zelfstandig verkopen.</p>
              </div>
              <nav aria-label="Voorbeeldweergaven" className="flex flex-wrap gap-2">
                {(["Koper", "Verkoper", "Beheer"] as const).map((item) => (
                  <Button
                    key={item}
                    variant={view === item ? "secondary" : "outline"}
                    className="text-foreground"
                    aria-pressed={view === item}
                    onClick={() => {
                      setView(item);
                      setError("");
                      setNotice("");
                    }}
                  >
                    {item}
                  </Button>
                ))}
              </nav>
            </div>
          </header>
        </>
      )}
      <Content className={embeddedBuyer ? "space-y-6" : "mx-auto max-w-7xl space-y-6 px-5 py-8"}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 tabIndex={-1} className="text-2xl font-bold">
              {embeddedBuyer
                ? buyerTab === "Mandje"
                  ? "Je voorbeeldmandje"
                  : "Mijn demo-aanvragen"
                : view === "Koper"
                  ? "Ontdek je volgende favoriet"
                  : view === "Verkoper"
                    ? "Verkoperscentrum"
                    : "Beheer van het voorbeeld"}
            </h1>
            <p className="mt-1 text-muted-foreground">
              {view === "Koper"
                ? "Vergelijk aanbiedingen en bekijk je lokale aanvraag."
                : "Deze weergave simuleert een werkproces en is geen ingelogd account."}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              adapter.reset();
              setResetVersion((version) => version + 1);
              setClearedQuantity(null);
              setNotice("Demo teruggezet.");
              setError("");
            }}
          >
            Reset demo
          </Button>
        </div>
        {notice && (
          <p role="status" className="rounded-lg border border-border bg-card p-3">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-destructive p-3">
            {error}
          </p>
        )}
        {view === "Koper" && (
          <>
            <nav aria-label="Koperspagina’s" className="flex flex-wrap gap-2">
              {(["Producten", "Mandje", "Aanvragen"] as const).map((tab) => (
                <Button
                  key={tab}
                  variant={buyerTab === tab ? "default" : "outline"}
                  aria-pressed={buyerTab === tab}
                  onClick={() => (buyerNavigation ? buyerNavigation(tab) : setBuyerTab(tab))}
                >
                  {tab}
                  {tab === "Mandje" ? ` (${count})` : ""}
                </Button>
              ))}
            </nav>
            {buyerTab === "Producten" && (
              <>
                <section
                  aria-label="Zoeken en filteren"
                  className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-3"
                >
                  <div>
                    <Label htmlFor="catalog-search">Zoek producten</Label>
                    <Input
                      id="catalog-search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Bijvoorbeeld eettafel"
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Categorie</Label>
                    <select
                      className="block h-9 w-full rounded-md border bg-background px-3"
                      id="category"
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                    >
                      {["Alles", "Wonen", "Tuin"].map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="sort">Sorteer</Label>
                    <select
                      className="block h-9 w-full rounded-md border bg-background px-3"
                      id="sort"
                      value={sort}
                      onChange={(event) => setSort(event.target.value)}
                    >
                      <option value="title">Naam</option>
                      <option value="price">Laagste verpakkingsprijs</option>
                    </select>
                  </div>
                </section>
                <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
                  <section aria-label="Productresultaten" className="grid gap-4 sm:grid-cols-2">
                    {products.map((item) => (
                      <Card key={item.id} data-testid="product">
                        <CardHeader>
                          <Badge variant="secondary" className="w-fit">
                            {item.category}
                          </Badge>
                          <CardTitle className="leading-snug">{item.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <p className="text-sm text-muted-foreground">
                            Originele afbeelding niet beschikbaar
                          </p>
                          <p className="text-xl font-bold text-price">
                            Vanaf {formatEur(bestPrice(item.id))}
                          </p>
                          <Button
                            variant="outline"
                            onClick={() => setSelected(item.id)}
                            aria-label={`Vergelijk ${item.title}`}
                          >
                            Vergelijk aanbiedingen
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                    {!products.length && (
                      <p role="status">
                        Geen producten gevonden. Pas je zoekopdracht of filters aan.
                      </p>
                    )}
                  </section>
                  <aside aria-label="Aanbiedingen vergelijken" className="sticky top-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>{product?.title ?? "Selecteer een product"}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {offers.map((offer) => (
                          <div key={offer.id} className="space-y-2 border-t pt-4">
                            <p className="font-semibold">{offer.sellerName}</p>
                            <p className="text-xl font-bold text-price">
                              {formatEur(offer.priceCents)}
                            </p>
                            <p className="text-sm">{offer.delivery}</p>
                            <p className="text-sm text-muted-foreground">
                              {offer.variant} · {offer.packQuantity} per verpakking
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Voorbeeldverpakkingen beschikbaar: {offer.availabilityExample}
                            </p>
                            <Button
                              disabled={!offer.availabilityExample}
                              onClick={() =>
                                act(() =>
                                  adapter.setQuantity(
                                    offer.id,
                                    (data.cart.find((line) => line.offerId === offer.id)
                                      ?.quantity ?? 0) + 1,
                                  ),
                                )
                              }
                            >
                              Voeg verpakking toe · {offer.sellerName}
                            </Button>
                          </div>
                        ))}
                        {!offers.length && <p>Dit product heeft geen zichtbaar voorbeeldaanbod.</p>}
                        <p className="text-xs text-muted-foreground">
                          Prijzen uit demo, inclusief voorbeeld-btw. Verzendkosten niet berekend.
                          Geen leveringsbelofte.
                        </p>
                      </CardContent>
                    </Card>
                  </aside>
                </div>
              </>
            )}
            {buyerTab === "Mandje" && (
              <section aria-label="Winkelmandje" className="space-y-4">
                <h2 className="text-xl font-semibold">Je voorbeeldmandje</h2>
                {quoteError && <p role="alert">{quoteError}</p>}
                {data.cart.map((line) => {
                  const offer = data.offers.find((item) => item.id === line.offerId);
                  const item = data.products.find((item) => item.id === offer?.productId);
                  return (
                    <Card key={line.offerId}>
                      <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                        <div>
                          <h3 className="font-semibold">{item?.title}</h3>
                          <p>{offer?.sellerName}</p>
                          <p className="text-sm text-muted-foreground">
                            {offer?.variant} · {offer?.packQuantity} per verpakking
                          </p>
                        </div>
                        <div>
                          <Label htmlFor={`qty-${line.offerId}`}>
                            Aantal verpakkingen · {offer?.sellerName}
                          </Label>
                          <Input
                            className="w-24"
                            type="number"
                            min="1"
                            max="99"
                            id={`qty-${line.offerId}`}
                            value={clearedQuantity === line.offerId ? "" : line.quantity}
                            onBlur={() => setClearedQuantity(null)}
                            onChange={(event) => {
                              // An empty edit is not an explicit quantity of zero/removal.
                              if (event.target.value === "") {
                                setClearedQuantity(line.offerId);
                                return;
                              }
                              setClearedQuantity(null);
                              act(() =>
                                adapter.setQuantity(line.offerId, Number(event.target.value)),
                              );
                            }}
                          />
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => act(() => adapter.setQuantity(line.offerId, 0))}
                        >
                          Verwijder · {offer?.sellerName}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
                {!data.cart.length && <p>Je mandje is leeg.</p>}
                <p className="text-xl font-bold">
                  Verpakkingen totaal: {quote ? formatEur(quote.totalCents) : "Niet beschikbaar"}
                </p>
                <p>
                  Verzendkosten niet berekend. Betaling uitgeschakeld. Er wordt geen voorraad
                  gereserveerd.
                </p>
                <Button
                  disabled={!quote?.lines.length || !!quoteError}
                  onClick={() =>
                    act(() => {
                      adapter.submitDemoRequest();
                      setBuyerTab("Aanvragen");
                      buyerNavigation?.("Aanvragen");
                    })
                  }
                >
                  Bewaar demo-aanvraag
                </Button>{" "}
                <Button disabled>Betalen niet beschikbaar</Button>
              </section>
            )}
            {buyerTab === "Aanvragen" && (
              <section aria-label="Mijn demo-aanvragen" className="space-y-4">
                <h2 className="text-xl font-semibold">Mijn demo-aanvragen</h2>
                {!data.orders.length && <p>Nog geen demo-aanvragen. Vul eerst je mandje.</p>}
                {data.orders.map((order) => (
                  <OrderSummary key={order.id} order={order} adapter={adapter} act={act} />
                ))}
              </section>
            )}
          </>
        )}
        {view === "Verkoper" && (
          <>
            <div>
              <Label htmlFor="seller">Voorbeeldwinkel (geen accountwissel)</Label>
              <select
                id="seller"
                className="ml-3 rounded-md border bg-card p-2"
                value={sellerId}
                onChange={(event) => setSellerId(event.target.value)}
              >
                {catalog.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>
            <section aria-label="Mijn aanbiedingen" className="space-y-4">
              <h2 className="text-xl font-semibold">Mijn aanbiedingen ({sellerOffers.length})</h2>
              {sellerOffers.map((offer) => (
                <Card key={offer.id}>
                  <CardHeader>
                    <CardTitle>
                      {data.products.find((item) => item.id === offer.productId)?.title}
                    </CardTitle>
                    <Badge className="w-fit" variant="outline">
                      {stateLabel[offer.state]}
                    </Badge>
                    <p className="text-sm text-muted-foreground">
                      {offer.variant} · SKU {offer.skuId} · {offer.packQuantity} per verpakking
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p>
                      Huidige voorbeeldprijs: {formatEur(offer.priceCents)} ·
                      beschikbaarheidsprojectie: {offer.availabilityExample}
                    </p>
                    <OfferEditor
                      key={`${offer.id}-${offer.priceCents}-${resetVersion}`}
                      offer={offer}
                      adapter={adapter}
                      act={act}
                    />
                  </CardContent>
                </Card>
              ))}
            </section>
            <section aria-label="Winkelaanvragen" className="space-y-4">
              <h2 className="text-xl font-semibold">Aanvragen voor deze winkel</h2>
              {!sellerOrders.length && <p>Geen demo-aanvragen voor deze winkel.</p>}
              {sellerOrders.map((order) => (
                <OrderSummary
                  key={order.id}
                  order={order}
                  sellerId={sellerId}
                  adapter={adapter}
                  act={act}
                />
              ))}
            </section>
          </>
        )}
        {view === "Beheer" && (
          <>
            <section className="grid gap-4 sm:grid-cols-3" aria-label="Demo-overzicht">
              {[
                ["Producten", data.products.length],
                ["Zichtbare aanbiedingen", published.length],
                ["Demo-aanvragen", data.orders.length],
              ].map(([label, value]) => (
                <Card key={label}>
                  <CardContent className="pt-6">
                    <p>{label}</p>
                    <p className="text-3xl font-bold">{value}</p>
                  </CardContent>
                </Card>
              ))}
            </section>
            <section aria-label="Aanbodbeoordeling" className="space-y-4">
              <h2 className="text-xl font-semibold">Aanbodbeoordeling ({review.length})</h2>
              {!review.length && <p>Geen aanbiedingen ter beoordeling.</p>}
              {review.map((offer) => (
                <Card key={offer.id}>
                  <CardHeader>
                    <CardTitle>
                      {data.products.find((item) => item.id === offer.productId)?.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {offer.variant} · SKU {offer.skuId} · {offer.packQuantity} per verpakking
                    </p>
                    <p>
                      {offer.sellerName} · {formatEur(offer.priceCents)}
                    </p>
                    <Button onClick={() => act(() => adapter.moderate(offer.id, "publish"))}>
                      Publiceer in demo
                    </Button>{" "}
                    <Button
                      variant="outline"
                      onClick={() => act(() => adapter.moderate(offer.id, "draft"))}
                    >
                      Terug naar concept
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </section>
            <section aria-label="Alle demo-aanvragen" className="space-y-4">
              <h2 className="text-xl font-semibold">Alle demo-aanvragen</h2>
              {!data.orders.length && <p>Geen demo-aanvragen.</p>}
              {data.orders.map((order) => (
                <OrderSummary key={order.id} order={order} adapter={adapter} act={act} />
              ))}
            </section>
          </>
        )}
        <footer className="border-t pt-6 text-sm text-muted-foreground">
          BORVAT commerciële werkproef · oorspronkelijke componenten en kleuren · lokale
          testgegevens · WMS/Accounting niet aangesloten · ontbrekende media worden niet vervangen
        </footer>
      </Content>
    </div>
  );
}
