import {
  createCommercialDemoAdapter,
  type CommercialDemoAdapter,
  type DemoSnapshot,
} from "./demo-adapter";
import type { CheckoutInput } from "./checkout-validation";
import type { ShopStorage } from "./test-storage";

export type ServerOrder = {
  id: string;
  createdAt: string;
  totalCents: number;
  subtotalCents: number;
  shippingCents: number | null;
  payment: { status: string; mode: string; reference?: string };
  cancellationRequested?: boolean;
  reservationExpiresAt?: string;
  lines: {
    offerId: string;
    skuId: string;
    title: string;
    sellerName: string;
    sellerId: string;
    quantity: number;
    unitPriceCents: number;
  }[];
  portions: {
    sellerId: string;
    company: string;
    state: string;
    references: Record<string, Record<string, string | number>>;
  }[];
};
export async function commerceApi<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/commerce/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    redirect: "error",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await r.json();
  if (!r.ok) {
    const errors: Record<string, string> = {
      AUTH_REQUIRED: "Meld je opnieuw aan of open je oorspronkelijke gastsessie.",
      FORBIDDEN: "Je hebt geen toegang tot deze actie.",
      NOT_FOUND: "Deze bestelling is niet beschikbaar voor je account.",
      INVALID_LOGIN: "Het e-mailadres of wachtwoord klopt niet.",
      LOGIN_RATE_LIMIT: "Te veel aanmeldpogingen. Probeer het later opnieuw.",
      INSUFFICIENT_STOCK: "Er is onvoldoende voorraad. Controleer je mandje.",
      OFFER_UNAVAILABLE: "Een aanbod is niet meer beschikbaar.",
      QUOTE_CHANGED: "De prijs of het aanbod is gewijzigd. Controleer je mandje opnieuw.",
      QUOTE_EXPIRED: "Je prijsopgave is verlopen. Controleer je mandje opnieuw.",
      IDEMPOTENCY_CONFLICT:
        "Deze poging bevat gewijzigde gegevens. Controleer eerst je bestaande bestelling.",
      PAYMENT_NOT_CONFIRMED: "De betaling is nog niet bevestigd.",
      PAYMENT_RECONCILIATION_REQUIRED:
        "Controleer eerst de betaaluitkomst; de reservering is nog niet vrijgegeven.",
      ORDER_CANCELLATION_PENDING:
        "De annulering wordt nog gecontroleerd. Er is geen nieuwe betaling toegestaan.",
      RESERVATION_NOT_CONFIRMED: "De voorraadreservering is nog niet bevestigd.",
      INVALID_TRANSITION:
        "Deze actie is niet toegestaan in de huidige status. Vernieuw de bestelling.",
      SELLER_SUSPENDED: "Dit verkopersaccount is opgeschort.",
      SHIPPING_ACCOUNTING_BINDING_REQUIRED:
        "Boeking geblokkeerd: de koppeling van verzendkosten met Accounting ontbreekt.",
      SYNTHETIC_ADDRESS_REQUIRED:
        "Gebruik een fictief adres met een e-mailadres dat eindigt op .test.",
    };
    throw new Error(
      errors[value.error] ??
        "De testdienst is tijdelijk niet beschikbaar. Er is geen nieuwe bevestiging ontvangen. Controleer je bestelling voordat je opnieuw probeert.",
    );
  }
  return value as T;
}
type ServerOffer = {
  id: string;
  product: string;
  sku: string;
  seller: string;
  seller_name: string;
  price: number;
  pack: number;
  available: number;
  info: { title: string; variant: string };
};

/** Browser retains only cart preferences. Orders, quotes, identity and roles come from the server. */
export function createServerCommerceAdapter(): CommercialDemoAdapter {
  const boot: DemoSnapshot = {
    ...createCommercialDemoAdapter().getServerSnapshot(),
    products: [],
    offers: [],
    cart: [],
    orders: [],
    restored: false,
    mode: "connected-test",
  };
  let snapshot = boot,
    storage: ShopStorage | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());
  const persistCart = () => {
    try {
      storage?.write(JSON.stringify({ version: 2, cart: snapshot.cart }));
    } catch {
      /* Cart preferences cannot invalidate a durably saved server order. */
    }
  };
  const refresh = async () => {
    try {
      await commerceApi("session", {});
      const { offers } = await commerceApi<{ offers: ServerOffer[] }>("catalog");
      snapshot = {
        ...snapshot,
        restored: true,
        connectionError: undefined,
        products: [
          ...new Map(
            offers.map((o) => [
              o.product,
              { id: o.product, title: o.info.title, category: "Wonen", image: null },
            ]),
          ).values(),
        ],
        offers: offers.map((o) => ({
          id: o.id,
          productId: o.product,
          skuId: o.sku,
          sellerId: o.seller,
          sellerName: o.seller_name,
          priceCents: o.price,
          packQuantity: o.pack,
          availabilityExample: o.available,
          variant: o.info.variant,
          delivery: "Native test · geen vervoerder",
          state: "published",
        })),
      };
    } catch (error) {
      snapshot = {
        ...snapshot,
        restored: true,
        connectionError: error instanceof Error ? error.message : "SERVICE_UNAVAILABLE",
      };
    }
    emit();
  };
  const denied = (): never => {
    throw new Error("Gebruik de beveiligde serverwerkruimte.");
  };
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => boot,
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    restore(next) {
      storage = next;
      try {
        const saved = JSON.parse(next?.read() ?? "null");
        if (saved?.version === 2 && Array.isArray(saved.cart))
          snapshot = {
            ...snapshot,
            cart: saved.cart
              .filter(
                (l: { offerId?: unknown; quantity?: unknown }) =>
                  typeof l?.offerId === "string" &&
                  Number.isInteger(l.quantity) &&
                  Number(l.quantity) >= 1 &&
                  Number(l.quantity) <= 10,
              )
              .slice(0, 30),
          };
      } catch {
        /* Unknown/invalid browser preferences are ignored. No server order is read from them. */
      }
      void refresh();
    },
    refresh,
    setQuantity(offerId, quantity) {
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 10)
        throw new Error("Ongeldig aantal.");
      const offer = snapshot.offers.find((o) => o.id === offerId);
      if (quantity > 0 && (!offer || quantity > offer.availabilityExample))
        throw new Error("Niet beschikbaar. Vernieuw de voorraad.");
      const cart = snapshot.cart.filter((l) => l.offerId !== offerId);
      if (quantity) cart.push({ offerId, quantity });
      snapshot = { ...snapshot, cart };
      persistCart();
      emit();
    },
    async placeServerOrder(input: CheckoutInput, key: string) {
      // Reuse the server quote on a lost POST response, including after a browser document reload.
      const fingerprint = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(JSON.stringify({ cart: snapshot.cart, input })),
          ),
        ),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const attemptKey = "borvat-connected-checkout-v1";
      let attempt: { key: string; fingerprint: string; quoteId: string } | undefined;
      try {
        attempt = JSON.parse(sessionStorage.getItem(attemptKey) ?? "null") ?? undefined;
      } catch {
        /* Same running form still carries the key. */
      }
      if (!attempt || attempt.fingerprint !== fingerprint) {
        const quote = await commerceApi<{ id: string }>("quote", {
          lines: snapshot.cart,
          shippingMethod: input.shippingMethod,
        });
        attempt = { key, fingerprint, quoteId: quote.id };
        sessionStorage.setItem(attemptKey, JSON.stringify(attempt));
      }
      const {
        shippingMethod: _shipping,
        paymentMethod: _payment,
        acceptTest: _accept,
        ...checkout
      } = input;
      const order = await commerceApi<ServerOrder>("orders", {
        quoteId: attempt.quoteId,
        checkout,
        idempotencyKey: attempt.key,
      });
      snapshot = { ...snapshot, cart: [] };
      persistCart();
      emit();
      try {
        sessionStorage.removeItem(attemptKey);
      } catch {
        /* An acknowledged server order remains successful. */
      }
      return order.id;
    },
    quote: denied,
    placeTestOrder: denied,
    submitDemoRequest: denied,
    setOfferPrice: denied,
    requestReview: denied,
    moderate: denied,
    prepareOrder: denied,
    reset: denied,
  };
}
