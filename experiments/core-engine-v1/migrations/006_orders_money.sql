-- BORVAT Marketplace - migration 006: quotes, orders, vendor split and money ledger
-- Money is stored as integer minor units with ISO 4217 precision, never as a float.
-- One customer order is split into one order per vendor, each with its own commission.

create type order_status as enum ('PENDING_PAYMENT', 'PAID', 'PARTIALLY_SHIPPED', 'SHIPPED', 'CANCELLED', 'REFUNDED');
create type vendor_order_status as enum ('CREATED', 'CONFIRMED', 'SHIPPED', 'CANCELLED', 'REFUNDED');
create type payment_status as enum ('INITIATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED');
create type ledger_kind as enum ('SALE', 'COMMISSION', 'SHIPPING', 'TAX', 'REFUND', 'PAYOUT', 'ADJUSTMENT');

create table currency_precisions (
  code char(3) primary key check (code ~ '^[A-Z]{3}$'),
  minor_units integer not null check (minor_units between 0 and 4),
  symbol text
);

insert into currency_precisions (code, minor_units, symbol) values
  ('EUR', 2, '€'), ('USD', 2, '$'), ('GBP', 2, '£'), ('JPY', 0, '¥'),
  ('SYP', 2, 'SYP'), ('TRY', 2, '₺'), ('AED', 2, 'AED'), ('SAR', 2, 'SAR'),
  ('SEK', 2, 'kr'), ('PLN', 2, 'zł')
on conflict (code) do nothing;

create table tax_rates (
  id uuid primary key default gen_random_uuid(),
  country char(2) not null check (country ~ '^[A-Z]{2}$'),
  tax_kind text not null default 'VAT',
  rate_bps integer not null check (rate_bps between 0 and 4000),
  effective_from date not null default date '2020-01-01',
  unique (country, tax_kind, effective_from)
);

insert into tax_rates (country, tax_kind, rate_bps, effective_from) values
  ('NL', 'VAT', 2100, '2020-01-01'), ('BE', 'VAT', 2100, '2020-01-01'),
  ('DE', 'VAT', 1900, '2020-01-01'), ('FR', 'VAT', 2000, '2020-01-01'),
  ('ES', 'VAT', 2100, '2020-01-01'), ('IT', 'VAT', 2200, '2020-01-01'),
  ('SY', 'VAT', 0, '2020-01-01')
on conflict do nothing;

create table quotes (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts (id) on delete restrict,
  buyer_user_id uuid references users (id) on delete set null,
  market char(2) not null,
  currency char(3) not null,
  items_subtotal_minor bigint not null check (items_subtotal_minor >= 0),
  shipping_minor bigint not null check (shipping_minor >= 0),
  tax_minor bigint not null check (tax_minor >= 0),
  total_minor bigint not null check (total_minor >= 0),
  tax_rate_bps integer not null check (tax_rate_bps between 0 and 4000),
  line_count integer not null check (line_count > 0),
  vendor_count integer not null check (vendor_count > 0),
  snapshot jsonb not null,
  content_hash text not null,
  created_at timestamptz not null default now()
);

create index quotes_cart_idx on quotes (cart_id, created_at desc);

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  buyer_user_id uuid not null references users (id) on delete restrict,
  cart_id uuid not null references carts (id) on delete restrict,
  quote_id uuid not null references quotes (id) on delete restrict,
  market char(2) not null,
  currency char(3) not null,
  items_subtotal_minor bigint not null check (items_subtotal_minor >= 0),
  shipping_minor bigint not null check (shipping_minor >= 0),
  tax_minor bigint not null check (tax_minor >= 0),
  total_minor bigint not null check (total_minor >= 0),
  status order_status not null default 'PENDING_PAYMENT',
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index orders_buyer_idx on orders (buyer_user_id, created_at desc);

create table vendor_orders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  vendor_organization_id uuid not null references organizations (id) on delete restrict,
  vendor_order_number text not null unique,
  items_subtotal_minor bigint not null check (items_subtotal_minor >= 0),
  shipping_minor bigint not null check (shipping_minor >= 0),
  tax_minor bigint not null check (tax_minor >= 0),
  total_minor bigint not null check (total_minor >= 0),
  commission_bps integer not null check (commission_bps between 0 and 5000),
  commission_minor bigint not null check (commission_minor >= 0),
  payout_minor bigint not null check (payout_minor >= 0),
  status vendor_order_status not null default 'CREATED',
  created_at timestamptz not null default now(),
  unique (order_id, vendor_organization_id),
  check (payout_minor + commission_minor = items_subtotal_minor + shipping_minor)
);

create index vendor_orders_vendor_idx on vendor_orders (vendor_organization_id, created_at desc);

create table vendor_order_lines (
  id uuid primary key default gen_random_uuid(),
  vendor_order_id uuid not null references vendor_orders (id) on delete cascade,
  offer_id uuid not null references offers (id) on delete restrict,
  product_id uuid not null references products (id) on delete restrict,
  product_title text not null,
  quantity integer not null check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  line_total_minor bigint not null check (line_total_minor >= 0),
  created_at timestamptz not null default now()
);

create index vendor_order_lines_order_idx on vendor_order_lines (vendor_order_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete restrict,
  provider text not null,
  provider_ref text,
  amount_minor bigint not null check (amount_minor >= 0),
  currency char(3) not null,
  status payment_status not null default 'INITIATED',
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ledger_entries (
  id bigserial primary key,
  vendor_organization_id uuid references organizations (id) on delete restrict,
  order_id uuid references orders (id) on delete restrict,
  vendor_order_id uuid references vendor_orders (id) on delete restrict,
  kind ledger_kind not null,
  amount_minor bigint not null,
  currency char(3) not null,
  note text,
  created_at timestamptz not null default now()
);

create index ledger_vendor_idx on ledger_entries (vendor_organization_id, id);
create index ledger_order_idx on ledger_entries (order_id, id);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  vendor_order_id uuid not null references vendor_orders (id) on delete restrict,
  order_id uuid not null references orders (id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null,
  reason text not null check (length(btrim(reason)) >= 3),
  status text not null default 'REQUESTED'
    check (status in ('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED')),
  requested_by uuid references users (id) on delete set null,
  decided_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint no_self_refund_approval check (decided_by is null or decided_by is distinct from requested_by)
);

alter table stock_reservations
  add constraint stock_reservations_order_fk
  foreign key (order_id) references orders (id) on delete set null;