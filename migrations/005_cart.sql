-- BORVAT Marketplace - migration 005: multi-vendor cart
-- One cart can hold offers from many vendors. Prices are snapshotted at add time
-- and always revalidated server side before any quote or checkout.

create type cart_status as enum ('OPEN', 'CHECKED_OUT', 'ABANDONED');

create table carts (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid references users (id) on delete cascade,
  guest_token text unique,
  market char(2) not null check (market ~ '^[A-Z]{2}$'),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status cart_status not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_user_id is not null or guest_token is not null)
);

create index carts_buyer_idx on carts (buyer_user_id, status);

create table cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts (id) on delete cascade,
  offer_id uuid not null references offers (id) on delete restrict,
  vendor_organization_id uuid not null references organizations (id) on delete restrict,
  quantity integer not null check (quantity between 1 and 999),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, offer_id)
);

create index cart_items_cart_idx on cart_items (cart_id);
create index cart_items_vendor_idx on cart_items (vendor_organization_id);

alter table stock_reservations
  add constraint stock_reservations_cart_fk
  foreign key (cart_id) references carts (id) on delete set null;