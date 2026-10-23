import { demoProducts } from "../../demo/products";

export type DemoProduct = { id: string; title: string; category: string; image: null };
export type DemoOffer = {
  id: string;
  productId: string;
  sellerId: string;
  sellerName: string;
  priceCents: number;
  skuId: string;
  variant: string;
  packQuantity: number;
  availabilityExample: number;
  delivery: string;
  state: "published" | "draft" | "review";
};
export type DemoCartLine = { offerId: string; quantity: number };
export type DemoOrder = {
  id: string;
  status: "aanvraag" | "voorbereid";
  lines: (DemoCartLine & {
    title: string;
    sellerId: string;
    sellerName: string;
    unitPriceCents: number;
    skuId: string;
    variant: string;
    packQuantity: number;
  })[];
  totalCents: number;
  createdAt: string;
  payment: "disabled";
  preparedSellerIds: string[];
};
export type DemoSnapshot = {
  mode: "synthetic-memory-only";
  products: DemoProduct[];
  offers: DemoOffer[];
  cart: DemoCartLine[];
  orders: DemoOrder[];
};
export type DemoQuote = {
  lines: (DemoCartLine & { offer: DemoOffer; product: DemoProduct; lineTotalCents: number })[];
  totalCents: number;
  shipping: "not-calculated";
  paymentEnabled: false;
};
export interface CommercialDemoAdapter {
  getSnapshot(): DemoSnapshot;
  subscribe(listener: () => void): () => void;
  quote(): DemoQuote;
  setQuantity(offerId: string, quantity: number): void;
  submitDemoRequest(): string;
  setOfferPrice(offerId: string, cents: number): void;
  requestReview(offerId: string): void;
  moderate(offerId: string, decision: "publish" | "draft"): void;
  prepareOrder(orderId: string, sellerId: string): void;
  reset(): void;
}

function initialSnapshot(): DemoSnapshot {
  // Reuse original, explicitly labelled Lovable demo fixtures. No real customer data.
  const selected = demoProducts.slice(0, 9);
  const products = selected.map((p, i) => ({
    id: p.id,
    title: p.title,
    category: i < 6 ? "Wonen" : "Tuin",
    image: null,
  }));
  const offers: DemoOffer[] = selected.map((p, i) => ({
    id: `demo-offer-${i + 1}`,
    productId: p.id,
    sellerId: i % 2 === 0 ? "demo-a" : "demo-b",
    sellerName: i % 2 === 0 ? "Voorbeeldwinkel A" : "Voorbeeldwinkel B",
    priceCents: p.priceCents,
    skuId: `sku-${p.id}`,
    variant: "Voorbeeldvariant",
    packQuantity: 1,
    availabilityExample: p.stockAvailable,
    delivery: p.deliveryPromise,
    state: i === 2 ? "review" : "published",
  }));
  offers.push({
    ...offers[0],
    id: "demo-offer-alternative",
    sellerId: "demo-b",
    sellerName: "Voorbeeldwinkel B",
    priceCents: offers[0].priceCents + 1000,
    delivery: "Voorbeeld: 5–7 werkdagen",
  });
  // Clearly synthetic pack fixture: one two-item pack for exercising SKU selection.
  offers.push({
    ...offers[0],
    id: "demo-offer-pack-2",
    skuId: `sku-pack-2-${selected[0].id}`,
    variant: "Voorbeeldvariant",
    packQuantity: 2,
    priceCents: offers[0].priceCents * 2,
    availabilityExample: Math.floor(offers[0].availabilityExample / 2),
    delivery: "Voorbeeld: verpakking van 2",
  });
  return { mode: "synthetic-memory-only", products, offers, cart: [], orders: [] };
}

function money(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > 100_000_000)
    throw new Error("Gebruik een geldige prijs van € 0,01 tot € 1.000.000,00.");
}
export function parseDemoPrice(value: string): number {
  if (!/^\d{1,7}([.,]\d{1,2})?$/.test(value))
    throw new Error("Voer een prijs met maximaal twee decimalen in.");
  const [euros, decimals = ""] = value.replace(",", ".").split(".");
  const cents = Number(euros) * 100 + Number(decimals.padEnd(2, "0"));
  money(cents);
  return cents;
}

export function createCommercialDemoAdapter(
  now: () => string = () => new Date().toISOString(),
): CommercialDemoAdapter {
  let snapshot = initialSnapshot();
  let sequence = 0;
  const listeners = new Set<() => void>();
  const commit = (next: DemoSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const findOffer = (id: string) => {
    const offer = snapshot.offers.find((item) => item.id === id);
    if (!offer) throw new Error("Dit voorbeeldaanbod bestaat niet.");
    return offer;
  };
  function quote(): DemoQuote {
    const lines = snapshot.cart.map((line) => {
      const offer = findOffer(line.offerId);
      const product = snapshot.products.find((p) => p.id === offer.productId);
      if (!product || offer.state !== "published")
        throw new Error("Een aanbod is niet meer zichtbaar. Verwijder het uit je mandje.");
      if (line.quantity > offer.availabilityExample)
        throw new Error("Pas de hoeveelheid aan de voorbeeldbeschikbaarheid aan.");
      return { ...line, offer, product, lineTotalCents: offer.priceCents * line.quantity };
    });
    return {
      lines,
      totalCents: lines.reduce((sum, line) => sum + line.lineTotalCents, 0),
      shipping: "not-calculated",
      paymentEnabled: false,
    };
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    quote,
    setQuantity(offerId, quantity) {
      const offer = findOffer(offerId);
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99)
        throw new Error("Kies een heel aantal tussen 0 en 99.");
      if (quantity > 0 && (offer.state !== "published" || quantity > offer.availabilityExample))
        throw new Error("Dit aantal is niet beschikbaar in het voorbeeld.");
      const cart = snapshot.cart.filter((line) => line.offerId !== offerId);
      if (quantity > 0) cart.push({ offerId, quantity });
      commit({ ...snapshot, cart });
    },
    submitDemoRequest() {
      const value = quote();
      if (!value.lines.length) throw new Error("Je mandje is leeg.");
      const id = `DEMO-${String(++sequence).padStart(4, "0")}`;
      const order: DemoOrder = {
        id,
        status: "aanvraag",
        createdAt: now(),
        payment: "disabled",
        preparedSellerIds: [],
        totalCents: value.totalCents,
        lines: value.lines.map(({ offer, product, quantity, offerId }) => ({
          offerId,
          quantity,
          title: product.title,
          sellerId: offer.sellerId,
          sellerName: offer.sellerName,
          unitPriceCents: offer.priceCents,
          skuId: offer.skuId,
          variant: offer.variant,
          packQuantity: offer.packQuantity,
        })),
      };
      // Local review request only: no stock mutation, reservation, invoice or financial entry.
      commit({ ...snapshot, cart: [], orders: [...snapshot.orders, order] });
      return id;
    },
    setOfferPrice(id, cents) {
      money(cents);
      findOffer(id);
      // Editing a published example sends it back to review; price history in requests stays immutable.
      commit({
        ...snapshot,
        offers: snapshot.offers.map((offer) =>
          offer.id === id ? { ...offer, priceCents: cents, state: "draft" } : offer,
        ),
      });
    },
    requestReview(id) {
      const offer = findOffer(id);
      if (offer.state !== "draft")
        throw new Error("Alleen een concept kan ter beoordeling worden aangeboden.");
      commit({
        ...snapshot,
        offers: snapshot.offers.map((offer) =>
          offer.id === id ? { ...offer, state: "review" } : offer,
        ),
      });
    },
    moderate(id, decision) {
      const offer = findOffer(id);
      if (offer.state !== "review") throw new Error("Dit aanbod wacht niet op beoordeling.");
      commit({
        ...snapshot,
        offers: snapshot.offers.map((offer) =>
          offer.id === id
            ? { ...offer, state: decision === "publish" ? "published" : "draft" }
            : offer,
        ),
      });
    },
    prepareOrder(id, sellerId) {
      const order = snapshot.orders.find((item) => item.id === id);
      if (!order) throw new Error("Deze demo-aanvraag bestaat niet.");
      if (!order.lines.some((line) => line.sellerId === sellerId))
        throw new Error("Deze winkel heeft geen regels in deze demo-aanvraag.");
      const preparedSellerIds = [...new Set([...order.preparedSellerIds, sellerId])];
      const complete = order.lines.every((line) => preparedSellerIds.includes(line.sellerId));
      commit({
        ...snapshot,
        orders: snapshot.orders.map((item) =>
          item.id === id
            ? { ...item, preparedSellerIds, status: complete ? "voorbereid" : "aanvraag" }
            : item,
        ),
      });
    },
    reset() {
      sequence = 0;
      commit(initialSnapshot());
    },
  };
}

export function selectDemoProducts(
  snapshot: DemoSnapshot,
  options: { query: string; category: string; sort: "title" | "price" },
) {
  const published = snapshot.offers.filter((offer) => offer.state === "published");
  const price = (productId: string) =>
    Math.min(
      ...published
        .filter((offer) => offer.productId === productId)
        .map((offer) => offer.priceCents),
    );
  return snapshot.products
    .filter(
      (product) =>
        published.some((offer) => offer.productId === product.id) &&
        product.title
          .toLocaleLowerCase("nl")
          .includes(options.query.trim().toLocaleLowerCase("nl")) &&
        (options.category === "Alles" || product.category === options.category),
    )
    .sort((a, b) =>
      options.sort === "price" ? price(a.id) - price(b.id) : a.title.localeCompare(b.title, "nl"),
    );
}
