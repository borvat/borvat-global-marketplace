import { z } from "zod";
const id = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/);
const label = z.string().trim().min(1).max(500);
const schema = z
  .object({
    version: z.literal("borvat.catalog.v1"),
    mode: z.literal("synthetic-memory-only"),
    revision: id,
    products: z
      .array(
        z
          .object({
            id,
            title: label,
            category: label,
            media: z
              .array(
                z
                  .object({
                    id,
                    url: z
                      .string()
                      .url()
                      .refine((v) => new URL(v).protocol === "https:"),
                    rightsReference: label,
                    source: z.literal("owner-controlled"),
                  })
                  .strict(),
              )
              .max(30),
          })
          .strict(),
      )
      .max(10000),
    skus: z
      .array(
        z
          .object({
            id,
            productId: id,
            variant: label,
            packQuantity: z.number().int().min(1).max(10000),
            references: z
              .array(
                z
                  .object({
                    authority: z.enum(["wms", "accounting"]),
                    companyId: id.optional(),
                    externalId: id,
                  })
                  .strict(),
              )
              .max(100),
          })
          .strict(),
      )
      .max(20000),
    companies: z.array(z.object({ id, name: label }).strict()).max(10000),
    stores: z.array(z.object({ id, companyId: id, name: label }).strict()).max(10000),
    offers: z
      .array(
        z
          .object({
            id,
            skuId: id,
            storeId: id,
            priceCents: z.number().int().min(1).max(100_000_000),
            currency: z.literal("EUR"),
            countries: z
              .array(z.enum(["NL", "BE"]))
              .min(1)
              .max(2),
            state: z.enum(["published", "draft", "review"]),
            delivery: label,
            availabilityExample: z.number().int().min(0).max(1_000_000),
          })
          .strict(),
      )
      .max(50000),
  })
  .strict()
  .superRefine((c, ctx) => {
    const fail = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    for (const key of ["products", "skus", "companies", "stores", "offers"] as const) {
      const seen = new Set<string>();
      c[key].forEach((entry, i) => {
        if (seen.has(entry.id)) fail([key, i, "id"], "Duplicate identity");
        seen.add(entry.id);
      });
    }
    const products = new Set(c.products.map((p) => p.id));
    const skus = new Set(c.skus.map((s) => s.id));
    const companies = new Set(c.companies.map((s) => s.id));
    const stores = new Set(c.stores.map((s) => s.id));
    const nativeIdentityOwners = new Map<string, string>();
    c.skus.forEach((s, i) => {
      if (!products.has(s.productId)) fail(["skus", i, "productId"], "Unknown product");
      const scopedAuthorities = new Set<string>();
      s.references.forEach((reference, j) => {
        if (reference.companyId && !companies.has(reference.companyId))
          fail(["skus", i, "references", j, "companyId"], "Unknown reference company");
        const scopeKey = JSON.stringify([reference.authority, reference.companyId ?? null]);
        if (scopedAuthorities.has(scopeKey))
          fail(["skus", i, "references", j], "Duplicate authority and company scope");
        scopedAuthorities.add(scopeKey);
        const identityKey = JSON.stringify([
          reference.authority,
          reference.companyId ?? null,
          reference.externalId,
        ]);
        const owner = nativeIdentityOwners.get(identityKey);
        if (owner && owner !== s.id)
          fail(["skus", i, "references", j], "Native identity maps to multiple SKUs");
        nativeIdentityOwners.set(identityKey, s.id);
      });
    });
    c.stores.forEach((s, i) => {
      if (!companies.has(s.companyId)) fail(["stores", i, "companyId"], "Unknown company");
    });
    c.offers.forEach((o, i) => {
      if (!skus.has(o.skuId)) fail(["offers", i, "skuId"], "Unknown SKU");
      if (!stores.has(o.storeId)) fail(["offers", i, "storeId"], "Unknown store");
      if (new Set(o.countries).size !== o.countries.length)
        fail(["offers", i, "countries"], "Duplicate country");
    });
  });
export type CanonicalCatalog = z.infer<typeof schema>;
/** Atomic validation of the entire synthetic import; no stock or financial writes. */
export function parseCatalog(input: unknown): CanonicalCatalog {
  return schema.parse(input);
}

/** Parses canonical JSON as one atomic, validated catalog snapshot. */
export function parseCanonicalCatalogJson(source: string): CanonicalCatalog {
  if (typeof source !== "string") throw new TypeError("Catalog JSON must be a string");
  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch {
    throw new Error("Invalid canonical catalog JSON");
  }
  return parseCatalog(input);
}

function compareId(a: { id: string }, b: { id: string }) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
function compareText(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function normalizeCatalog(input: unknown): CanonicalCatalog {
  const catalog = parseCatalog(input);
  return {
    ...catalog,
    products: catalog.products
      .map((product) => ({ ...product, media: [...product.media].sort(compareId) }))
      .sort(compareId),
    skus: catalog.skus
      .map((sku) => ({
        ...sku,
        references: [...sku.references].sort(
          (a, b) =>
            compareText(a.authority, b.authority) ||
            compareText(a.companyId ?? "", b.companyId ?? "") ||
            compareText(a.externalId, b.externalId),
        ),
      }))
      .sort(compareId),
    companies: [...catalog.companies].sort(compareId),
    stores: [...catalog.stores].sort(compareId),
    offers: catalog.offers
      .map((offer) => ({ ...offer, countries: [...offer.countries].sort(compareText) }))
      .sort(compareId),
  };
}
/** Stable JSON interchange for validated catalog snapshots; it does not imply source-system export. */
export function serializeCanonicalCatalog(input: unknown): string {
  return `${JSON.stringify(normalizeCatalog(input), null, 2)}\n`;
}
const entityCollections = ["products", "skus", "companies", "stores", "offers"] as const;
type EntityCollection = (typeof entityCollections)[number];
function diffById<T extends { id: string }>(previous: T[], incoming: T[]) {
  const previousById = new Map(previous.map((entry) => [entry.id, JSON.stringify(entry)]));
  const incomingById = new Map(incoming.map((entry) => [entry.id, JSON.stringify(entry)]));
  return {
    added: [...incomingById.keys()].filter((id) => !previousById.has(id)).sort(),
    changed: [...incomingById.keys()]
      .filter((id) => previousById.has(id) && previousById.get(id) !== incomingById.get(id))
      .sort(),
    removed: [...previousById.keys()].filter((id) => !incomingById.has(id)).sort(),
    unchanged: [...incomingById.keys()].filter(
      (id) => previousById.has(id) && previousById.get(id) === incomingById.get(id),
    ).length,
  };
}
export type CatalogImportPreview = {
  previousRevision: string;
  incomingRevision: string;
  hasChanges: boolean;
  collections: Record<EntityCollection, ReturnType<typeof diffById>>;
};
/** Read-only, validated diff for an import review; performs no persistence or upstream writes. */
export function previewCanonicalCatalogImport(
  previousInput: unknown,
  incomingInput: unknown,
): CatalogImportPreview {
  const previous = normalizeCatalog(previousInput);
  const incoming = normalizeCatalog(incomingInput);
  const collections = {
    products: diffById(previous.products, incoming.products),
    skus: diffById(previous.skus, incoming.skus),
    companies: diffById(previous.companies, incoming.companies),
    stores: diffById(previous.stores, incoming.stores),
    offers: diffById(previous.offers, incoming.offers),
  };
  const hasChanges = entityCollections.some((key) => {
    const diff = collections[key];
    return diff.added.length > 0 || diff.changed.length > 0 || diff.removed.length > 0;
  });
  return {
    previousRevision: previous.revision,
    incomingRevision: incoming.revision,
    hasChanges,
    collections,
  };
}
const querySchema = z
  .object({
    country: z.enum(["NL", "BE"]),
    query: z.string().max(200).default(""),
    category: z.string().max(500).optional(),
    sort: z.enum(["title", "price"]).default("title"),
    limit: z.number().int().min(1).max(100).default(24),
    cursor: z.string().max(2000).optional(),
  })
  .strict();
export type CatalogPageQuery = z.input<typeof querySchema>;
/** Cursors are read offsets bound to revision and filters, never authorization tokens. */
export function catalogPage(catalog: CanonicalCatalog, input: CatalogPageQuery) {
  const q = querySchema.parse(input);
  const query = q.query.trim().toLocaleLowerCase("nl");
  const key = JSON.stringify([
    catalog.revision,
    q.country,
    query,
    q.category ?? null,
    q.sort,
    q.limit,
  ]);
  let offset = 0;
  if (q.cursor) {
    let raw: unknown;
    try {
      raw = JSON.parse(decodeURIComponent(q.cursor));
    } catch {
      throw Error("Invalid catalog cursor");
    }
    const cursor = z
      .object({ key: z.string(), offset: z.number().int().min(0) })
      .strict()
      .safeParse(raw);
    if (!cursor.success || cursor.data.key !== key)
      throw Error("Stale or mismatched catalog cursor");
    offset = cursor.data.offset;
  }
  const skuById = new Map(catalog.skus.map((s) => [s.id, s]));
  const visible = catalog.offers.filter(
    (o) => o.state === "published" && o.countries.includes(q.country),
  );
  const byProduct = new Map<string, typeof visible>();
  for (const offer of visible) {
    const productId = skuById.get(offer.skuId)?.productId;
    if (!productId) throw Error("Invalid catalog relationship");
    const offers = byProduct.get(productId) ?? [];
    offers.push(offer);
    byProduct.set(productId, offers);
  }
  const price = (id: string) => Math.min(...byProduct.get(id)!.map((o) => o.priceCents));
  const rows = catalog.products
    .filter(
      (p) =>
        byProduct.has(p.id) &&
        p.title.toLocaleLowerCase("nl").includes(query) &&
        (!q.category || p.category === q.category),
    )
    .sort(
      (a, b) =>
        (q.sort === "price" ? price(a.id) - price(b.id) : a.title.localeCompare(b.title, "nl")) ||
        a.id.localeCompare(b.id, "en"),
    );
  if (offset > rows.length) throw Error("Invalid catalog cursor offset");
  const products = rows.slice(offset, offset + q.limit);
  const productIds = new Set(products.map((p) => p.id));
  const offers = visible.filter((o) => productIds.has(skuById.get(o.skuId)!.productId));
  const skus = catalog.skus.filter((s) => productIds.has(s.productId));
  const storeIds = new Set(offers.map((o) => o.storeId));
  const stores = catalog.stores.filter((s) => storeIds.has(s.id));
  const companyIds = new Set(stores.map((s) => s.companyId));
  return {
    version: catalog.version,
    revision: catalog.revision,
    products,
    skus,
    offers,
    stores,
    companies: catalog.companies.filter((c) => companyIds.has(c.id)),
    total: rows.length,
    nextCursor:
      offset + q.limit < rows.length
        ? encodeURIComponent(JSON.stringify({ key, offset: offset + q.limit }))
        : null,
  };
}
