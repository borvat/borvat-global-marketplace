/**
 * Catalogue: the canonical product master.
 *
 * A product is not a seller's listing. It is the shared description that many
 * vendors may offer. Buyers read products in public-read mode.
 */

import { PLATFORM, withApp, type DbPool } from '../db/pool.ts';
import { writeAudit } from './audit.ts';
import { conflict, notFound, validation } from './errors.ts';

const SKU_RE = /^[A-Z0-9][A-Z0-9._-]{2,63}$/;
const GTIN_RE = /^[0-9]{8,14}$/;

export interface Product {
  readonly id: string;
  readonly masterSku: string;
  readonly title: string;
  readonly brand: string | null;
  readonly categoryPath: string;
  readonly gtin: string | null;
  readonly status: string;
}

interface ProductRow {
  id: string;
  master_sku: string;
  title: string;
  brand: string | null;
  category_path: string;
  gtin: string | null;
  status: string;
}

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    masterSku: row.master_sku,
    title: row.title,
    brand: row.brand,
    categoryPath: row.category_path,
    gtin: row.gtin,
    status: row.status,
  };
}

const PRODUCT_COLUMNS = 'id, master_sku, title, brand, category_path, gtin, status';

export async function createProduct(
  pool: DbPool,
  input: {
    actorUserId: string;
    masterSku: string;
    title: string;
    brand?: string | null;
    categoryPath?: string;
    gtin?: string | null;
    description?: string | null;
    status?: 'DRAFT' | 'ACTIVE';
    correlationId?: string | null;
  },
): Promise<Product> {
  const masterSku = input.masterSku.trim().toUpperCase();
  if (!SKU_RE.test(masterSku)) throw validation(`invalid master sku: ${input.masterSku}`);
  const title = input.title.trim();
  if (title.length < 2 || title.length > 300) throw validation('title must be between 2 and 300 characters');
  const gtinRaw = input.gtin?.trim() ?? '';
  if (gtinRaw !== '' && !GTIN_RE.test(gtinRaw)) throw validation(`invalid gtin: ${input.gtin}`);

  return withApp(pool, { ...PLATFORM, userId: input.actorUserId }, async (client) => {
    const inserted = await client.query<ProductRow>(
      `insert into products (master_sku, title, brand, category_path, gtin, description, status, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (master_sku) do nothing
       returning ${PRODUCT_COLUMNS}`,
      [
        masterSku,
        title,
        input.brand?.trim() ?? null,
        (input.categoryPath ?? 'uncategorised').trim(),
        gtinRaw === '' ? null : gtinRaw,
        input.description ?? null,
        input.status ?? 'ACTIVE',
        input.actorUserId,
      ],
    );
    const row = inserted.rows[0];
    if (row === undefined) throw conflict('a product with this master sku already exists', { masterSku });
    await writeAudit(client, {
      actorUserId: input.actorUserId,
      action: 'product.created',
      entityType: 'product',
      entityId: row.id,
      correlationId: input.correlationId ?? null,
      payload: { masterSku, title },
    });
    return mapProduct(row);
  });
}

export async function getProduct(pool: DbPool, productId: string): Promise<Product> {
  return withApp(pool, { publicRead: true }, async (client) => {
    const result = await client.query<ProductRow>(
      `select ${PRODUCT_COLUMNS} from products where id = $1`,
      [productId],
    );
    const row = result.rows[0];
    if (row === undefined) throw notFound('product not found');
    return mapProduct(row);
  });
}

export async function setProductAttribute(
  pool: DbPool,
  input: {
    actorUserId: string;
    productId: string;
    key: string;
    valueText?: string | null;
    valueJson?: unknown;
    source: 'BOL' | 'IMPORTED' | 'INFERRED' | 'MANUAL';
    status: 'CONFIRMED' | 'SUGGESTED' | 'CONFLICT' | 'UNKNOWN';
  },
): Promise<void> {
  const key = input.key.trim().toLowerCase();
  if (!/^[a-z0-9_]{2,40}$/.test(key)) throw validation(`invalid attribute key: ${input.key}`);
  if ((input.valueText ?? null) === null && input.valueJson === undefined) {
    throw validation('an attribute needs a text or json value');
  }
  await withApp(pool, { ...PLATFORM, userId: input.actorUserId }, async (client) => {
    await client.query(
      `insert into product_attributes (product_id, key, value_text, value_json, source, status)
       values ($1, $2, $3, $4::jsonb, $5, $6)
       on conflict (product_id, key) do update
         set value_text = excluded.value_text,
             value_json = excluded.value_json,
             source = excluded.source,
             status = excluded.status,
             updated_at = now()`,
      [
        input.productId,
        key,
        input.valueText ?? null,
        input.valueJson === undefined ? null : JSON.stringify(input.valueJson),
        input.source,
        input.status,
      ],
    );
  });
}

export interface ProductSearchResult {
  readonly product: Product;
  readonly offerCount: number;
  readonly bestTotalMinor: string | null;
  readonly bestCurrency: string | null;
  readonly bestVendorName: string | null;
  readonly bestHandlingDays: number | null;
}

export async function searchProducts(
  pool: DbPool,
  input: { query?: string | null; categoryPath?: string | null; market: string; limit?: number; offset?: number },
): Promise<ProductSearchResult[]> {
  const market = input.market.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(market)) throw validation(`invalid market: ${input.market}`);
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);
  const query = input.query?.trim() ?? '';
  const pattern = query === '' ? null : `%${query.replace(/[%_]/g, '')}%`;

  return withApp(pool, { publicRead: true }, async (client) => {
    const result = await client.query<{
      id: string;
      master_sku: string;
      title: string;
      brand: string | null;
      category_path: string;
      gtin: string | null;
      status: string;
      offer_count: string;
      best_total_minor: string | null;
      best_currency: string | null;
      best_vendor_name: string | null;
      best_handling_days: number | null;
    }>(
      `with available as (
         select o.product_id,
                count(*) over (partition by o.product_id) as offer_count,
                o.price_minor + o.shipping_minor as total_minor,
                o.currency,
                o.handling_days,
                o.vendor_organization_id,
                row_number() over (
                  partition by o.product_id
                  order by (o.price_minor + o.shipping_minor) asc, o.handling_days asc, o.id asc
                ) as rank
           from offers o
          where o.status = 'ACTIVE'
            and o.stock_available > 0
            and $1 = any (o.ships_to)
       )
       select p.id, p.master_sku, p.title, p.brand, p.category_path, p.gtin, p.status,
              coalesce(a.offer_count, 0) as offer_count,
              a.total_minor as best_total_minor,
              a.currency as best_currency,
              org.name as best_vendor_name,
              a.handling_days as best_handling_days
         from products p
         left join available a on a.product_id = p.id and a.rank = 1
         left join organizations org on org.id = a.vendor_organization_id
        where p.status = 'ACTIVE'
          and ($2::text is null or p.category_path = $2::text)
          and (
            $3::text is null
            or p.title ilike $3::text
            or coalesce(p.brand, '') ilike $3::text
            or p.master_sku ilike $3::text
          )
        order by (a.total_minor is null), a.total_minor asc, p.title asc
        limit $4 offset $5`,
      [market, input.categoryPath ?? null, pattern, limit, offset],
    );
    return result.rows.map((row) => ({
      product: {
        id: row.id,
        masterSku: row.master_sku,
        title: row.title,
        brand: row.brand,
        categoryPath: row.category_path,
        gtin: row.gtin,
        status: row.status,
      },
      offerCount: Number(row.offer_count),
      bestTotalMinor: row.best_total_minor,
      bestCurrency: row.best_currency,
      bestVendorName: row.best_vendor_name,
      bestHandlingDays: row.best_handling_days,
    }));
  });
}