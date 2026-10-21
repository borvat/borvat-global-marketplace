-- BORVAT Marketplace - migration 004: inventory ledger and stock reservations
-- Stock is never overwritten silently: every movement is an append-only ledger row,
-- and reservations are separate rows so a cart hold is auditable and reversible.

create type stock_reason as enum ('RESTOCK', 'ADJUST', 'RESERVE', 'RELEASE', 'SALE', 'RETURN', 'DAMAGE');
create type reservation_status as enum ('HELD', 'COMMITTED', 'RELEASED', 'EXPIRED');

create table inventory_ledger (
  id bigserial primary key,
  offer_id uuid not null references offers (id) on delete restrict,
  vendor_organization_id uuid not null references organizations (id) on delete restrict,
  delta integer not null check (delta <> 0),
  reason stock_reason not null,
  balance_after integer not null check (balance_after >= 0),
  reference text,
  actor_user_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index inventory_ledger_offer_idx on inventory_ledger (offer_id, id);
create index inventory_ledger_vendor_idx on inventory_ledger (vendor_organization_id, id);

create table stock_reservations (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references offers (id) on delete restrict,
  vendor_organization_id uuid not null references organizations (id) on delete restrict,
  cart_id uuid,
  order_id uuid,
  quantity integer not null check (quantity > 0),
  status reservation_status not null default 'HELD',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index stock_reservations_offer_idx on stock_reservations (offer_id) where status = 'HELD';
create index stock_reservations_cart_idx on stock_reservations (cart_id) where status = 'HELD';
create index stock_reservations_expiry_idx on stock_reservations (expires_at) where status = 'HELD';