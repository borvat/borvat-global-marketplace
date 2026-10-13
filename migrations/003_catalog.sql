-- BORVAT Marketplace - migration 003: canonical product master and vendor offers
-- One canonical product, many independent vendor offers. The catalogue is the master;
-- an offer is a seller's own price, stock and promise for that product.

create type product_status as enum ('DRAFT', 'ACTIVE', 'BLOCKED', 'ARCHIVED');
create type attribute_source as enum ('BOL', 'IMPORTED', 'INFERRED', 'MANUAL');
create type attribute_status as enum ('CONFIRMED', 'SUGGESTED', 'CONFLICT', 'UNKNOWN');
create type offer_status as enum ('DRAFT', 'ACTIVE', 'PAUSED', 'BLOCKED');
create type item_condition as enum ('NEW', 'REFURBISHED', 'USED_LIKE_NEW', 'USED_GOOD');

create table products (
  id uuid primary key default gen_random_uuid(),
  master_sku text not null unique check (master_sku ~ '^[A-Z0-9][A-Z0-9._-]{2,63}$'),
  title text not null check (length(btrim(title)) between 2 and 300),
  brand text,
  category_path text not null default 'uncategorised' check (length(category_path) between 1 and 200),
  gtin text check (gtin is null or gtin ~ '^[0-9]{8,14}$'),
  description text,
  status product_status not null default 'DRAFT',
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_category_idx on products (category_path) where status = 'ACTIVE';
create index products_gtin_idx on products (gtin) where gtin is not null;
create index products_search_idx on products using gin (to_tsvector('simple', title || ' ' || coalesce(brand, '')));

create table product_attributes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{2,40}$'),
  value_text text,
  value_json jsonb,
  source attribute_source not null,
  status attribute_status not null default 'SUGGESTED',
  updated_at timestamptz not null default now(),
  unique (product_id, key),
  check (value_text is not null or value_json is not null)
);

create table offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete restrict,
  vendor_organization_id uuid not null references organizations (id) on delete restrict,
  offer_ref text not null check (length(btrim(offer_ref)) between 1 and 64),
  condition item_condition not null default 'NEW',
  price_minor bigint not null check (price_minor >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  tax_inclusive boolean not null default true,
  shipping_minor bigint not null default 0 check (shipping_minor >= 0),
  free_shipping_threshold_minor bigint
    check (free_shipping_threshold_minor is null or free_shipping_threshold_minor >= 0),
  stock_available integer not null default 0 check (stock_available >= 0),
  handling_days integer not null default 1 check (handling_days between 0 and 60),
  max_per_order integer not null default 10 check (max_per_order between 1 and 999),
  ships_to char(2)[] not null default '{NL,BE}',
  status offer_status not null default 'DRAFT',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_organization_id, offer_ref),
  check (cardinality(ships_to) >= 1)
);

create index offers_product_idx on offers (product_id) where status = 'ACTIVE';
create index offers_vendor_idx on offers (vendor_organization_id) where status = 'ACTIVE';
create index offers_rank_idx on offers (product_id, price_minor) where status = 'ACTIVE';
create index offers_ships_to_idx on offers using gin (ships_to);