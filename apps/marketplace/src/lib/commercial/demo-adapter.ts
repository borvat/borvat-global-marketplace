import { z } from "zod";
import { demoProducts } from "../../demo/products";
import { productDetails } from "./demo-product-details";
import { normalizeCheckout, validateCheckout, type CheckoutInput } from "./checkout-validation";
import {
  MAX_LINE_QUANTITY,
  lineTotalCents,
  maxOrderable,
  orderTotals,
  type ShippingMethodId,
  type TestPaymentMethod,
} from "./shop-pricing";
import type { ShopStorage } from "./test-storage";

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
export type TestCheckoutDetails = Omit<CheckoutInput, "acceptTest"> & {
  subtotalCents: number;
  shippingCents: number;
  vatIncludedCents: number;
};
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
  payment: "disabled" | TestPaymentMethod;
  preparedSellerIds: string[];
  /** Present only on TEST- checkout orders: no payment, shipment or stock movement occurred. */
  checkout?: TestCheckoutDetails;
  idempotencyKey?: string;
};
export type DemoSnapshot = {
  mode: "synthetic-memory-only";
  products: DemoProduct[];
  offers: DemoOffer[];
  cart: DemoCartLine[];
  orders: DemoOrder[];
  /** False until browser test storage has been read (always false during SSR). */
  restored?: boolean;
  storageStatus?: "memory" | "saved" | "unavailable";
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
  placeTestOrder(input: CheckoutInput, idempotencyKey: string): string;
  restore(storage: ShopStorage | null): void;
  setOfferPrice(offerId: string, cents: number): void;
  requestReview(offerId: string): void;
  moderate(offerId: string, decision: "publish" | "draft"): void;
  prepareOrder(orderId: string, sellerId: string): void;
  reset(): void;
}

const neutralTitles: Record<string, string> = {
  prd_002: "Linnen bankstel 3-zits",
  prd_006: "Keramische plantenpot — off-white",
};

function initialSnapshot(): DemoSnapshot {
  // Reuse original, explicitly labelled Lovable demo fixtures. No real customer data.
  const selected = demoProducts.slice(0, 9);
  const products = selected.map((p, i) => ({
    id: p.id,
    // Variant-neutral titles where the test shop offers several colours/sizes.
    title: neutralTitles[p.id] ?? p.title,
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
    variant:
      p.id === "prd_002" ? "Antraciet" : p.id === "prd_006" ? "XL (45 cm)" : "Voorbeeldvariant",
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
  // Synthetic colour variant fixture for exercising variant selection.
  offers.push({
    ...offers[1],
    id: "demo-offer-2-zandbeige",
    skuId: `sku-${selected[1].id}-zandbeige`,
    variant: "Zandbeige",
    priceCents: offers[1].priceCents + 5000,
    availabilityExample: 3,
  });
  // Synthetic low-priced size variant so paid standard shipping (< € 50) is reachable.
  offers.push({
    ...offers[5],
    id: "demo-offer-6-medium",
    skuId: `sku-${selected[5].id}-medium`,
    variant: "Medium (30 cm)",
    priceCents: 2995,
    availabilityExample: 20,
  });
  return { mode: "synthetic-memory-only", products, offers, cart: [], orders: [], restored: false };
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

function randomTestId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return "TEST-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

type Persisted = { version: 1; cart: DemoCartLine[]; orders: DemoOrder[] };
const textValue = z.string().trim().min(1).max(200);
const centsValue = z.number().int().min(0).max(100_000_000_000);
const cartLineSchema = z.object({
  offerId: textValue,
  quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
});
const lineSchema = cartLineSchema.extend({
  title: textValue,
  sellerId: textValue,
  sellerName: textValue,
  unitPriceCents: centsValue,
  skuId: textValue,
  variant: textValue,
  packQuantity: z.number().int().min(1).max(10000),
});
const checkoutSchema = z.object({
  firstName: textValue,
  lastName: textValue,
  email: textValue,
  phone: textValue,
  street: textValue,
  houseNumber: textValue,
  addition: z.string().max(6),
  postalCode: textValue,
  city: textValue,
  country: z.enum(["NL", "BE"]),
  shippingMethod: z.enum(["standaard", "express"]),
  paymentMethod: z.enum(["test-ideal", "test-card"]),
  subtotalCents: centsValue,
  shippingCents: centsValue,
  vatIncludedCents: centsValue,
});
const orderSchema = z
  .object({
    id: z.string().regex(/^(TEST|DEMO)-[A-Z0-9]+$/),
    status: z.enum(["aanvraag", "voorbereid"]),
    lines: z.array(lineSchema).min(1).max(100),
    totalCents: centsValue,
    createdAt: z.iso.datetime(),
    payment: z.enum(["disabled", "test-ideal", "test-card"]),
    preparedSellerIds: z.array(textValue).max(100),
    checkout: checkoutSchema.optional(),
    idempotencyKey: textValue.optional(),
  })
  .superRefine((order, ctx) => {
    const fail = () => ctx.addIssue({ code: "custom", message: "Invalid persisted order" });
    const unique = (values: string[]) => new Set(values).size === values.length;
    if (!unique(order.lines.map((l) => l.offerId)) || !unique(order.preparedSellerIds)) fail();
    if (order.preparedSellerIds.some((id) => !order.lines.some((l) => l.sellerId === id))) fail();
    const prepared = order.lines.every((l) => order.preparedSellerIds.includes(l.sellerId));
    if ((order.status === "voorbereid") !== prepared) fail();
    if (order.checkout) {
      const c = order.checkout;
      if (
        !order.id.startsWith("TEST-") ||
        !order.idempotencyKey ||
        order.payment !== c.paymentMethod
      )
        fail();
      if (Object.keys(validateCheckout({ ...c, acceptTest: true })).length) fail();
      let totals;
      try {
        totals = orderTotals(order.lines, c.shippingMethod);
      } catch {
        fail();
        return;
      }
      if (
        totals.totalCents !== order.totalCents ||
        totals.subtotalCents !== c.subtotalCents ||
        totals.shippingCents !== c.shippingCents ||
        totals.vatIncludedCents !== c.vatIncludedCents
      )
        fail();
    } else if (
      !order.id.startsWith("DEMO-") ||
      order.payment !== "disabled" ||
      order.lines.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0) !== order.totalCents
    )
      fail();
  });
function readPersisted(raw: string | null, offers: DemoOffer[]): Persisted | null {
  if (!raw || raw.length > 2_000_000) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    const seenOffers = new Set<string>();
    const cart = (Array.isArray(data.cart) ? data.cart : []).flatMap((item: unknown) => {
      const parsed = cartLineSchema.safeParse(item);
      if (!parsed.success) return [];
      const line = parsed.data;
      const offer = offers.find((o) => o.id === line.offerId);
      if (!offer || line.quantity > offer.availabilityExample || seenOffers.has(line.offerId))
        return [];
      seenOffers.add(line.offerId);
      return [line];
    });
    const seenIds = new Set<string>(),
      seenKeys = new Set<string>();
    const orders = (Array.isArray(data.orders) ? data.orders : []).flatMap((item: unknown) => {
      const parsed = orderSchema.safeParse(item);
      if (!parsed.success) return [];
      const order = parsed.data;
      if (seenIds.has(order.id) || (order.idempotencyKey && seenKeys.has(order.idempotencyKey)))
        return [];
      seenIds.add(order.id);
      if (order.idempotencyKey) seenKeys.add(order.idempotencyKey);
      return [order];
    });
    return { version: 1, cart, orders };
  } catch {
    return null;
  }
}

export function createCommercialDemoAdapter(
  now: () => string = () => new Date().toISOString(),
  newTestId: () => string = randomTestId,
): CommercialDemoAdapter {
  let snapshot = initialSnapshot();
  let sequence = 0;
  let storage: ShopStorage | null = null;
  const listeners = new Set<() => void>();
  const commit = (next: DemoSnapshot) => {
    try {
      storage?.write(
        JSON.stringify({ version: 1, cart: next.cart, orders: next.orders } satisfies Persisted),
      );
    } catch {
      snapshot = { ...snapshot, storageStatus: "unavailable" };
      listeners.forEach((listener) => listener());
      throw new Error(
        "Opslaan is mislukt. Er is geen testbestelling bevestigd. Maak browseropslag vrij en probeer opnieuw.",
      );
    }
    snapshot = { ...next, storageStatus: storage ? "saved" : (snapshot.storageStatus ?? "memory") };
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
      return {
        ...line,
        offer,
        product,
        lineTotalCents: lineTotalCents(offer.priceCents, line.quantity),
      };
    });
    return {
      lines,
      totalCents: lines.reduce((sum, line) => sum + line.lineTotalCents, 0),
      shipping: "not-calculated",
      paymentEnabled: false,
    };
  }
  const orderLines = (value: DemoQuote) =>
    value.lines.map(({ offer, product, quantity, offerId }) => ({
      offerId,
      quantity,
      title: product.title,
      sellerId: offer.sellerId,
      sellerName: offer.sellerName,
      unitPriceCents: offer.priceCents,
      skuId: offer.skuId,
      variant: offer.variant,
      packQuantity: offer.packQuantity,
    }));
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
      if (!Number.isInteger(quantity) || quantity < 0)
        throw new Error("Kies een heel aantal van 1 of meer.");
      if (quantity > 0 && offer.state !== "published")
        throw new Error("Dit artikel is niet meer beschikbaar.");
      if (quantity > 0 && offer.availabilityExample < 1)
        throw new Error("Dit artikel is momenteel niet leverbaar.");
      if (quantity > MAX_LINE_QUANTITY)
        throw new Error(`Je kunt maximaal ${MAX_LINE_QUANTITY} stuks per artikel bestellen.`);
      if (quantity > offer.availabilityExample)
        throw new Error(`Er zijn nog maar ${maxOrderable(offer.availabilityExample)} beschikbaar.`);
      const existing = snapshot.cart.findIndex((line) => line.offerId === offerId);
      const cart = snapshot.cart.filter((line) => line.offerId !== offerId);
      if (quantity > 0)
        cart.splice(existing < 0 ? cart.length : existing, 0, { offerId, quantity });
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
        lines: orderLines(value),
      };
      // Local review request only: no stock mutation, reservation, invoice or financial entry.
      commit({ ...snapshot, cart: [], orders: [...snapshot.orders, order] });
      return id;
    },
    placeTestOrder(input, idempotencyKey) {
      if (!idempotencyKey || idempotencyKey.length > 200)
        throw new Error("Ontbrekende bestelsleutel.");
      if (snapshot.restored && !storage)
        throw new Error("Browseropslag is niet beschikbaar. Er is geen testbestelling bevestigd.");
      const previous = snapshot.orders.find((order) => order.idempotencyKey === idempotencyKey);
      if (previous) {
        const { acceptTest: _accepted, ...customer } = normalizeCheckout(input);
        const stored = previous.checkout;
        if (
          !stored ||
          Object.entries(customer).some(([k, v]) => stored[k as keyof TestCheckoutDetails] !== v)
        )
          throw new Error("Deze bestelsleutel hoort bij andere bestelgegevens.");
        return previous.id;
      }
      const errors = validateCheckout(input);
      if (Object.keys(errors).length) throw new Error("Controleer de gemarkeerde velden.");
      const value = quote();
      if (!value.lines.length) throw new Error("Je mandje is leeg.");
      const lines = orderLines(value);
      const totals = orderTotals(lines, input.shippingMethod as ShippingMethodId);
      const { acceptTest: _accepted, ...customer } = normalizeCheckout(input);
      let id = newTestId();
      for (let retry = 0; snapshot.orders.some((order) => order.id === id) && retry < 8; retry++)
        id = newTestId();
      if (!/^TEST-[A-Z0-9]+$/.test(id) || snapshot.orders.some((order) => order.id === id))
        throw new Error("Geen uniek testbestelnummer beschikbaar. Probeer opnieuw.");
      const order: DemoOrder = {
        id,
        status: "aanvraag",
        createdAt: now(),
        payment: input.paymentMethod,
        preparedSellerIds: [],
        totalCents: totals.totalCents,
        lines,
        checkout: { ...customer, ...totals, shippingCents: totals.shippingCents },
        idempotencyKey,
      };
      // Test order only: no payment, carrier booking, WMS reservation or Accounting entry.
      commit({ ...snapshot, cart: [], orders: [...snapshot.orders, order] });
      return id;
    },
    restore(next) {
      if (snapshot.restored) return;
      let persisted: Persisted | null = null;
      let available = next;
      try {
        persisted = readPersisted(next?.read() ?? null, snapshot.offers);
      } catch {
        available = null;
      }
      if (persisted)
        sequence = Math.max(
          0,
          ...persisted.orders.map((o) =>
            o.id.startsWith("DEMO-") ? Number(o.id.slice(5)) || 0 : 0,
          ),
        );
      storage = available;
      const merged = persisted
        ? { cart: persisted.cart, orders: persisted.orders }
        : { cart: snapshot.cart, orders: snapshot.orders };
      snapshot = {
        ...snapshot,
        ...merged,
        restored: true,
        storageStatus: available ? "saved" : "unavailable",
      };
      listeners.forEach((listener) => listener());
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
      commit({ ...initialSnapshot(), restored: snapshot.restored });
    },
  };
}

type SelectableSnapshot = {
  products: { id: string; title: string; category: string }[];
  offers: { productId: string; state: string; priceCents: number; availabilityExample: number }[];
};
export type ProductSort = "title" | "price" | "price-desc";
export function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("nl")
    .trim();
}

export function selectDemoProducts<T extends SelectableSnapshot>(
  snapshot: T,
  options: {
    query: string;
    category: string;
    sort: ProductSort;
    minCents?: number | null;
    maxCents?: number | null;
    inStockOnly?: boolean;
  },
): T["products"] {
  const published = snapshot.offers.filter((offer) => offer.state === "published");
  const price = (productId: string) =>
    Math.min(
      ...published
        .filter((offer) => offer.productId === productId)
        .map((offer) => offer.priceCents),
    );
  const available = (productId: string) =>
    published.some((offer) => offer.productId === productId && offer.availabilityExample > 0);
  const terms = normalizeSearch(options.query).split(/\s+/).filter(Boolean);
  return snapshot.products
    .filter((product) => {
      if (!published.some((offer) => offer.productId === product.id)) return false;
      const haystack = normalizeSearch(
        `${product.title} ${product.category} ${productDetails(product.id).description}`,
      );
      const from = price(product.id);
      return (
        terms.every((term) => haystack.includes(term)) &&
        (options.category === "Alles" || product.category === options.category) &&
        (options.minCents == null || from >= options.minCents) &&
        (options.maxCents == null || from <= options.maxCents) &&
        (!options.inStockOnly || available(product.id))
      );
    })
    .sort((a, b) =>
      options.sort === "price"
        ? price(a.id) - price(b.id)
        : options.sort === "price-desc"
          ? price(b.id) - price(a.id)
          : a.title.localeCompare(b.title, "nl"),
    );
}
