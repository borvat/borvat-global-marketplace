import { z } from "zod";
import { parseCatalog } from "./catalog-contract";

const id = z.string().min(1).max(160);
const bindingSchema = z
  .object({
    catalogCompanyId: id,
    wmsCompanyId: id,
  })
  .strict();
const productSchema = z
  .object({
    id,
    organization_id: id,
    available_qty: z.number().int().min(0).max(1_000_000),
  })
  .passthrough();
const projectionSchema = z
  .object({
    company: id,
    products: z.array(productSchema).max(50_000),
  })
  .strict();

export type WmsCompanyBinding = z.infer<typeof bindingSchema>;
export type WmsAvailabilityProjection = z.infer<typeof projectionSchema>;

/**
 * Maps a company-scoped WMS read projection to explicitly referenced marketplace SKUs.
 * This is a pure boundary adapter: it performs no network request, persistence or stock write.
 * Returned quantities retain the native WMS item UOM; no pack conversion is inferred.
 */
export function projectWmsAvailability(
  catalogInput: unknown,
  bindingInput: unknown,
  projectionInput: unknown,
) {
  const catalog = parseCatalog(catalogInput);
  const binding = bindingSchema.parse(bindingInput);
  const projection = projectionSchema.parse(projectionInput);

  if (!catalog.companies.some((company) => company.id === binding.catalogCompanyId))
    throw new Error("Unknown marketplace company binding");
  if (projection.company !== binding.wmsCompanyId)
    throw new Error("WMS company scope mismatch");

  const nativeById = new Map<string, number>();
  for (const product of projection.products) {
    if (product.organization_id !== binding.wmsCompanyId)
      throw new Error("WMS product company scope mismatch");
    if (nativeById.has(product.id)) throw new Error("Duplicate WMS product identity");
    nativeById.set(product.id, product.available_qty);
  }

  const companyStoreIds = new Set(
    catalog.stores
      .filter((store) => store.companyId === binding.catalogCompanyId)
      .map((store) => store.id),
  );
  const companySkuIds = new Set(
    catalog.offers
      .filter((offer) => companyStoreIds.has(offer.storeId))
      .map((offer) => offer.skuId),
  );
  const skuById = new Map(catalog.skus.map((sku) => [sku.id, sku]));
  const availability: { skuId: string; wmsItemId: string; availableQuantity: number }[] = [];
  const unmappedSkuIds: string[] = [];
  const missingProjectionSkuIds: string[] = [];

  for (const skuId of [...companySkuIds].sort()) {
    const sku = skuById.get(skuId);
    if (!sku) throw new Error("Invalid catalog SKU relationship");
    const reference = sku.references.find(
      (entry) => entry.authority === "wms" && entry.companyId === binding.catalogCompanyId,
    );
    if (!reference) {
      unmappedSkuIds.push(skuId);
      continue;
    }
    const availableQuantity = nativeById.get(reference.externalId);
    if (availableQuantity === undefined) {
      missingProjectionSkuIds.push(skuId);
      continue;
    }
    availability.push({
      skuId,
      wmsItemId: reference.externalId,
      availableQuantity,
    });
  }

  return {
    catalogCompanyId: binding.catalogCompanyId,
    wmsCompanyId: binding.wmsCompanyId,
    catalogRevision: catalog.revision,
    availability,
    unmappedSkuIds,
    missingProjectionSkuIds,
  };
}
