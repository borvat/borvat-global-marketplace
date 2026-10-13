/**
 * Live platform status, read from the real database.
 * Nothing here is cached or hard coded: it is what the marketplace actually holds.
 */

import { PLATFORM, withApp, type DbPool } from '../db/pool.ts';
import { searchProducts } from './catalog.ts';

export interface PlatformCounts {
  readonly activeProducts: number;
  readonly activeOffers: number;
  readonly approvedVendors: number;
  readonly accounts: number;
  readonly paidOrders: number;
  readonly vendorOrders: number;
  readonly ledgerEntries: number;
}

export interface CataloguePreview {
  readonly masterSku: string;
  readonly title: string;
  readonly offerCount: number;
  readonly bestTotalMinor: string | null;
  readonly bestCurrency: string | null;
  readonly bestVendorName: string | null;
}

export interface PlatformStatus {
  readonly service: string;
  readonly status: 'ok';
  readonly time: string;
  readonly postgresVersion: string;
  readonly counts: PlatformCounts;
  readonly paidVolume: { readonly currency: string; readonly totalMinor: string }[];
  readonly catalogue: CataloguePreview[];
}

export async function getPlatformStatus(pool: DbPool): Promise<PlatformStatus> {
  const counts = await withApp(pool, PLATFORM, async (client) => {
    const result = await client.query<{
      active_products: string;
      active_offers: string;
      approved_vendors: string;
      accounts: string;
      paid_orders: string;
      vendor_orders: string;
      ledger_entries: string;
      postgres_version: string;
    }>(
      `select
         (select count(*) from products where status = 'ACTIVE')::text as active_products,
         (select count(*) from offers where status = 'ACTIVE')::text as active_offers,
         (select count(*) from vendor_profiles where status = 'ACTIVE')::text as approved_vendors,
         (select count(*) from users)::text as accounts,
         (select count(*) from orders where status <> 'PENDING_PAYMENT')::text as paid_orders,
         (select count(*) from vendor_orders)::text as vendor_orders,
         (select count(*) from ledger_entries)::text as ledger_entries,
         version() as postgres_version`,
    );
    const row = result.rows[0];
    return {
      activeProducts: Number(row?.active_products ?? '0'),
      activeOffers: Number(row?.active_offers ?? '0'),
      approvedVendors: Number(row?.approved_vendors ?? '0'),
      accounts: Number(row?.accounts ?? '0'),
      paidOrders: Number(row?.paid_orders ?? '0'),
      vendorOrders: Number(row?.vendor_orders ?? '0'),
      ledgerEntries: Number(row?.ledger_entries ?? '0'),
      postgresVersion: (row?.postgres_version ?? 'unknown').split(' on ')[0] ?? 'unknown',
    };
  });

  const volume = await withApp(pool, PLATFORM, async (client) => {
    const result = await client.query<{ currency: string; total_minor: string }>(
      `select currency, sum(total_minor)::text as total_minor
         from orders where status <> 'PENDING_PAYMENT'
        group by currency order by currency`,
    );
    return result.rows.map((row) => ({ currency: row.currency, totalMinor: row.total_minor }));
  });

  const catalogue = await searchProducts(pool, { market: 'NL', limit: 6 });

  return {
    service: 'borvat-marketplace',
    status: 'ok',
    time: new Date().toISOString(),
    postgresVersion: counts.postgresVersion,
    counts: {
      activeProducts: counts.activeProducts,
      activeOffers: counts.activeOffers,
      approvedVendors: counts.approvedVendors,
      accounts: counts.accounts,
      paidOrders: counts.paidOrders,
      vendorOrders: counts.vendorOrders,
      ledgerEntries: counts.ledgerEntries,
    },
    paidVolume: volume,
    catalogue: catalogue.map((entry) => ({
      masterSku: entry.product.masterSku,
      title: entry.product.title,
      offerCount: entry.offerCount,
      bestTotalMinor: entry.bestTotalMinor,
      bestCurrency: entry.bestCurrency,
      bestVendorName: entry.bestVendorName,
    })),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(minor: string | null, currency: string | null): string {
  if (minor === null || currency === null) return '—';
  const value = BigInt(minor);
  const whole = value / 100n;
  const cents = (value % 100n).toString().padStart(2, '0');
  return `${whole}.${cents} ${currency}`;
}

/** A live status page rendered from real database contents. */
export function renderStatusPage(status: PlatformStatus): string {
  const rows = status.catalogue
    .map(
      (entry) => `<tr>
        <td><code>${escapeHtml(entry.masterSku)}</code></td>
        <td>${escapeHtml(entry.title)}</td>
        <td class="num">${entry.offerCount}</td>
        <td class="num">${escapeHtml(money(entry.bestTotalMinor, entry.bestCurrency))}</td>
        <td>${escapeHtml(entry.bestVendorName ?? '—')}</td>
      </tr>`,
    )
    .join('\n');

  const volume = status.paidVolume.length === 0
    ? '<li>no paid orders yet</li>'
    : status.paidVolume
        .map((entry) => `<li>${escapeHtml(money(entry.totalMinor, entry.currency))} paid volume</li>`)
        .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BORVAT Marketplace — live status</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; padding: 2rem; line-height: 1.5; }
  main { max-width: 62rem; margin: 0 auto; }
  h1 { font-size: 1.4rem; margin-bottom: .25rem; }
  h2 { font-size: 1.05rem; margin-top: 2rem; border-bottom: 1px solid #8884; padding-bottom: .35rem; }
  .badge { display: inline-block; padding: .15rem .55rem; border-radius: 999px; background: #16a34a22; color: #15803d; font-weight: 600; font-size: .8rem; }
  table { border-collapse: collapse; width: 100%; font-size: .9rem; }
  th, td { text-align: left; padding: .45rem .5rem; border-bottom: 1px solid #8883; }
  td.num, th.num { text-align: right; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: .75rem; margin-top: .75rem; }
  .card { border: 1px solid #8884; border-radius: .6rem; padding: .7rem .85rem; }
  .card b { display: block; font-size: 1.5rem; }
  .card span { font-size: .8rem; opacity: .75; }
  code { background: #8882; padding: .1rem .3rem; border-radius: .25rem; }
  ul { padding-left: 1.1rem; }
</style>
</head>
<body>
<main>
  <h1>BORVAT Global Marketplace</h1>
  <p><span class="badge">live</span> multi-vendor commerce core — ${escapeHtml(status.postgresVersion)}</p>
  <p>This page is rendered from the running database, not from a mock. Time: ${escapeHtml(status.time)}</p>

  <div class="grid">
    <div class="card"><b>${status.counts.activeProducts}</b><span>active products</span></div>
    <div class="card"><b>${status.counts.activeOffers}</b><span>active vendor offers</span></div>
    <div class="card"><b>${status.counts.approvedVendors}</b><span>approved vendors</span></div>
    <div class="card"><b>${status.counts.accounts}</b><span>accounts</span></div>
    <div class="card"><b>${status.counts.paidOrders}</b><span>paid orders</span></div>
    <div class="card"><b>${status.counts.vendorOrders}</b><span>vendor sub-orders</span></div>
    <div class="card"><b>${status.counts.ledgerEntries}</b><span>ledger entries</span></div>
  </div>

  <h2>Paid volume</h2>
  <ul>${volume}</ul>

  <h2>Live catalogue, cheapest offer per product</h2>
  <table>
    <thead><tr><th>Master SKU</th><th>Product</th><th class="num">Offers</th><th class="num">Best total</th><th>Vendor</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>

  <h2>API</h2>
  <ul>
    <li><code>GET /api/status</code> — this data as JSON</li>
    <li><code>GET /api/catalog/search?market=NL&amp;q=stove</code> — public catalogue search</li>
    <li><code>GET /api/catalog/products/:id/offers?market=NL&amp;quantity=1</code> — competing offers ranked by total payable</li>
    <li><code>POST /api/auth/register</code>, <code>POST /api/auth/login</code></li>
    <li><code>POST /api/cart</code>, <code>POST /api/cart/:id/items</code>, <code>POST /api/cart/:id/quote</code></li>
    <li><code>POST /api/checkout</code> with an <code>Idempotency-Key</code> header</li>
    <li><code>GET /api/vendor/orders</code>, <code>GET /api/vendor/ledger</code> — seller scope</li>
  </ul>
</main>
</body>
</html>`;
}