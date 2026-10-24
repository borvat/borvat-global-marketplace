import { parseCatalog, type CanonicalCatalog } from "./catalog-contract";
import type { DemoSnapshot } from "./demo-adapter";
let sequence = 0;
const revisions = new WeakMap<
  DemoSnapshot["offers"],
  { products: DemoSnapshot["products"]; id: string }
>();
/** Fixture mapping only: demo seller IDs identify stores, not verified legal entities. */
export function rehearsalCatalog(snapshot: DemoSnapshot): CanonicalCatalog {
  let revision = revisions.get(snapshot.offers);
  if (revision?.products !== snapshot.products) {
    revision = { products: snapshot.products, id: `rehearsal-${++sequence}` };
    revisions.set(snapshot.offers, revision);
  }
  const stores = [
    ...new Map(
      snapshot.offers.map((o) => [
        o.sellerId,
        {
          id: o.sellerId,
          companyId: `company-${o.sellerId}`,
          name: o.sellerName,
        },
      ]),
    ).values(),
  ];
  return parseCatalog({
    version: "borvat.catalog.v1",
    mode: snapshot.mode,
    revision: revision!.id,
    products: snapshot.products.map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      media: [],
    })),
    skus: [
      ...new Map(
        snapshot.offers.map((offer) => [
          offer.skuId,
          {
            id: offer.skuId,
            productId: offer.productId,
            variant: offer.variant,
            packQuantity: offer.packQuantity,
            references: [],
          },
        ]),
      ).values(),
    ],
    companies: stores.map((s) => ({ id: s.companyId, name: `Voorbeeldbedrijf ${s.id}` })),
    stores,
    offers: snapshot.offers.map((o) => ({
      id: o.id,
      skuId: o.skuId,
      storeId: o.sellerId,
      priceCents: o.priceCents,
      currency: "EUR",
      countries: ["NL", "BE"],
      state: o.state,
      delivery: o.delivery,
      availabilityExample: o.availabilityExample,
    })),
  });
}
/** Compatibility projection retains original cart commands and selected offer identities. */
export function buyerCatalog(catalog: CanonicalCatalog) {
  const skus = new Map(catalog.skus.map((s) => [s.id, s]));
  const stores = new Map(catalog.stores.map((s) => [s.id, s]));
  return {
    skus: catalog.skus.map(({ id, productId, variant, packQuantity }) => ({
      id,
      productId,
      variant,
      packQuantity,
    })),
    products: catalog.products.map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      image: null,
    })),
    offers: catalog.offers.map((o) => {
      const sku = skus.get(o.skuId),
        store = stores.get(o.storeId);
      if (!sku || !store) throw Error("Invalid catalog relationship");
      return {
        id: o.id,
        skuId: sku.id,
        variant: sku.variant,
        packQuantity: sku.packQuantity,
        productId: sku.productId,
        sellerId: store.id,
        sellerName: store.name,
        priceCents: o.priceCents,
        state: o.state,
        delivery: o.delivery,
        availabilityExample: o.availabilityExample,
      };
    }),
  };
}
