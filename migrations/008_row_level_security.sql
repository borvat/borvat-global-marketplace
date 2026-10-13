-- BORVAT Marketplace - migration 008: row level security and least privilege
--
-- Tenant isolation is enforced by PostgreSQL, not only by application code.
-- The API connects as `borvat_app`, which is not the table owner, so every policy
-- below applies to it. Session context is set per transaction by trusted server code:
--
--   borvat.platform = 'on'      -> trusted platform operation (checkout, approvals)
--   borvat.public_read = 'on'   -> buyer-facing catalogue read of ACTIVE offers
--   borvat.curator = 'on'       -> catalogue curation by a trusted reviewer path
--   borvat.org = '<uuid>'       -> the vendor organization acting right now
--   borvat.user_id = '<uuid>'   -> the authenticated user acting right now
--   borvat.guest_token = '...'  -> an anonymous cart owner
--
-- Request input never reaches these settings directly.

create or replace function current_app_user() returns uuid language sql stable as $$
  select nullif(current_setting('borvat.user_id', true), '')::uuid
$$;

create or replace function current_org() returns uuid language sql stable as $$
  select nullif(current_setting('borvat.org', true), '')::uuid
$$;

create or replace function current_guest_token() returns text language sql stable as $$
  select nullif(current_setting('borvat.guest_token', true), '')
$$;

create or replace function platform_mode() returns boolean language sql stable as $$
  select coalesce(current_setting('borvat.platform', true) = 'on', false)
$$;

create or replace function public_read_mode() returns boolean language sql stable as $$
  select coalesce(current_setting('borvat.public_read', true) = 'on', false)
$$;

create or replace function curator_mode() returns boolean language sql stable as $$
  select coalesce(current_setting('borvat.curator', true) = 'on', false)
$$;

create or replace function is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.organization_id = p_org
      and m.user_id = current_app_user()
      and m.status = 'ACTIVE'
  )
$$;

-- ---------------------------------------------------------------- identity

alter table organizations enable row level security;
create policy organizations_read on organizations for select using (true);
create policy organizations_write on organizations for all
  using (platform_mode()) with check (platform_mode());

alter table users enable row level security;
create policy users_self_read on users for select
  using (platform_mode() or id = current_app_user());
create policy users_self_write on users for all
  using (platform_mode() or id = current_app_user())
  with check (platform_mode() or id = current_app_user());

alter table memberships enable row level security;
create policy memberships_read on memberships for select
  using (platform_mode() or user_id = current_app_user() or is_org_member(organization_id));
create policy memberships_write on memberships for all
  using (platform_mode()) with check (platform_mode());

alter table sessions enable row level security;
create policy sessions_self on sessions for all
  using (platform_mode() or user_id = current_app_user())
  with check (platform_mode() or user_id = current_app_user());

-- ---------------------------------------------------------------- vendors

alter table vendor_applications enable row level security;
create policy vendor_applications_access on vendor_applications for all
  using (platform_mode() or applicant_user_id = current_app_user())
  with check (platform_mode() or applicant_user_id = current_app_user());

alter table vendor_profiles enable row level security;
create policy vendor_profiles_read on vendor_profiles for select
  using (platform_mode() or is_org_member(organization_id) or public_read_mode());
create policy vendor_profiles_write on vendor_profiles for all
  using (platform_mode() or is_org_member(organization_id))
  with check (platform_mode() or is_org_member(organization_id));

-- ---------------------------------------------------------------- catalogue

alter table products enable row level security;
create policy products_read on products for select using (true);
create policy products_write on products for all
  using (platform_mode() or curator_mode())
  with check (platform_mode() or curator_mode());

alter table product_attributes enable row level security;
create policy product_attributes_read on product_attributes for select using (true);
create policy product_attributes_write on product_attributes for all
  using (platform_mode() or curator_mode())
  with check (platform_mode() or curator_mode());

alter table offers enable row level security;
create policy offers_public_read on offers for select
  using (status = 'ACTIVE' and public_read_mode());
-- A buyer must still see the offer behind an item already in their own cart,
-- even when it was paused or blocked after the item was added, so the cart can
-- tell them the item is no longer available instead of silently hiding it.
create policy offers_in_own_cart on offers for select
  using (
    exists (
      select 1 from cart_items ci
      join carts c on c.id = ci.cart_id
      where ci.offer_id = offers.id
        and (
          c.buyer_user_id = current_app_user()
          or (c.guest_token is not null and c.guest_token = current_guest_token())
        )
    )
  );
create policy offers_tenant_access on offers for all
  using (platform_mode() or vendor_organization_id = current_org())
  with check (platform_mode() or vendor_organization_id = current_org());

-- ---------------------------------------------------------------- inventory

alter table inventory_ledger enable row level security;
create policy inventory_ledger_read on inventory_ledger for select
  using (platform_mode() or vendor_organization_id = current_org() or is_org_member(vendor_organization_id));
create policy inventory_ledger_insert on inventory_ledger for insert
  with check (platform_mode() or vendor_organization_id = current_org());

alter table stock_reservations enable row level security;
create policy stock_reservations_read on stock_reservations for select
  using (
    platform_mode()
    or vendor_organization_id = current_org()
    or exists (
      select 1 from carts c
      where c.id = stock_reservations.cart_id
        and c.buyer_user_id = current_app_user()
    )
  );
create policy stock_reservations_write on stock_reservations for all
  using (platform_mode() or vendor_organization_id = current_org())
  with check (platform_mode() or vendor_organization_id = current_org());

-- ---------------------------------------------------------------- cart

alter table carts enable row level security;
create policy carts_owner on carts for all
  using (
    platform_mode()
    or buyer_user_id = current_app_user()
    or (guest_token is not null and guest_token = current_guest_token())
  )
  with check (
    platform_mode()
    or buyer_user_id = current_app_user()
    or (guest_token is not null and guest_token = current_guest_token())
  );

alter table cart_items enable row level security;
create policy cart_items_owner on cart_items for all
  using (
    platform_mode()
    or exists (
      select 1 from carts c
      where c.id = cart_items.cart_id
        and (
          c.buyer_user_id = current_app_user()
          or (c.guest_token is not null and c.guest_token = current_guest_token())
        )
    )
  )
  with check (
    platform_mode()
    or exists (
      select 1 from carts c
      where c.id = cart_items.cart_id
        and (
          c.buyer_user_id = current_app_user()
          or (c.guest_token is not null and c.guest_token = current_guest_token())
        )
    )
  );

-- ---------------------------------------------------------------- orders and money

alter table quotes enable row level security;
create policy quotes_owner on quotes for select
  using (
    platform_mode()
    or buyer_user_id = current_app_user()
    or exists (
      select 1 from carts c
      where c.id = quotes.cart_id and c.buyer_user_id = current_app_user()
    )
  );
create policy quotes_insert on quotes for insert with check (platform_mode());

alter table orders enable row level security;
create policy orders_read on orders for select
  using (platform_mode() or buyer_user_id = current_app_user());
-- A vendor may see the customer order only when it contains one of that vendor's
-- own sub-orders, which is what makes the vendor order list possible without
-- exposing the rest of the marketplace.
create policy orders_vendor_read on orders for select
  using (
    exists (
      select 1 from vendor_orders vo
      where vo.order_id = orders.id
        and vo.vendor_organization_id = current_org()
    )
  );
create policy orders_write on orders for all
  using (platform_mode() or buyer_user_id = current_app_user())
  with check (platform_mode() or buyer_user_id = current_app_user());

alter table vendor_orders enable row level security;
create policy vendor_orders_read on vendor_orders for select
  using (platform_mode() or vendor_organization_id = current_org() or is_org_member(vendor_organization_id));
create policy vendor_orders_write on vendor_orders for all
  using (platform_mode() or vendor_organization_id = current_org())
  with check (platform_mode() or vendor_organization_id = current_org());

alter table vendor_order_lines enable row level security;
create policy vendor_order_lines_read on vendor_order_lines for select
  using (
    platform_mode()
    or exists (
      select 1 from vendor_orders vo
      where vo.id = vendor_order_lines.vendor_order_id
        and (vo.vendor_organization_id = current_org() or is_org_member(vo.vendor_organization_id))
    )
  );
create policy vendor_order_lines_write on vendor_order_lines for all
  using (
    platform_mode()
    or exists (
      select 1 from vendor_orders vo
      where vo.id = vendor_order_lines.vendor_order_id
        and vo.vendor_organization_id = current_org()
    )
  )
  with check (
    platform_mode()
    or exists (
      select 1 from vendor_orders vo
      where vo.id = vendor_order_lines.vendor_order_id
        and vo.vendor_organization_id = current_org()
    )
  );

alter table payments enable row level security;
create policy payments_read on payments for select
  using (
    platform_mode()
    or exists (
      select 1 from orders o
      where o.id = payments.order_id and o.buyer_user_id = current_app_user()
    )
  );
create policy payments_write on payments for all
  using (platform_mode())
  with check (platform_mode());

alter table ledger_entries enable row level security;
create policy ledger_entries_read on ledger_entries for select
  using (platform_mode() or vendor_organization_id = current_org() or is_org_member(vendor_organization_id));
create policy ledger_entries_insert on ledger_entries for insert
  with check (platform_mode());

alter table refunds enable row level security;
create policy refunds_read on refunds for select
  using (
    platform_mode()
    or exists (
      select 1 from vendor_orders vo
      where vo.id = refunds.vendor_order_id
        and (vo.vendor_organization_id = current_org() or is_org_member(vo.vendor_organization_id))
    )
    or exists (
      select 1 from orders o
      where o.id = refunds.order_id and o.buyer_user_id = current_app_user()
    )
  );
create policy refunds_write on refunds for all
  using (
    platform_mode()
    or exists (
      select 1 from vendor_orders vo
      where vo.id = refunds.vendor_order_id and vo.vendor_organization_id = current_org()
    )
  )
  with check (
    platform_mode()
    or exists (
      select 1 from vendor_orders vo
      where vo.id = refunds.vendor_order_id and vo.vendor_organization_id = current_org()
    )
  );

-- ---------------------------------------------------------------- platform internals

alter table audit_log enable row level security;
create policy audit_log_read on audit_log for select
  using (
    platform_mode()
    or organization_id = current_org()
    or actor_user_id = current_app_user()
  );
create policy audit_log_insert on audit_log for insert with check (true);

alter table idempotency_keys enable row level security;
create policy idempotency_keys_platform on idempotency_keys for all
  using (platform_mode()) with check (platform_mode());

alter table outbox_events enable row level security;
-- The outbox is internal plumbing written by trusted server paths. Reading it is
-- restricted to platform operations; appending is allowed for any authenticated
-- or platform context, because a submitted action must be able to emit its event
-- inside the same transaction that created it.
create policy outbox_events_read on outbox_events for select using (platform_mode());
create policy outbox_events_insert on outbox_events for insert
  with check (platform_mode() or current_app_user() is not null);

alter table currency_precisions enable row level security;
create policy currency_precisions_read on currency_precisions for select using (true);
create policy currency_precisions_write on currency_precisions for all
  using (platform_mode()) with check (platform_mode());

alter table tax_rates enable row level security;
create policy tax_rates_read on tax_rates for select using (true);
create policy tax_rates_write on tax_rates for all
  using (platform_mode()) with check (platform_mode());

-- ---------------------------------------------------------------- grants

grant usage on schema public to borvat_app;
grant select, insert, update, delete on all tables in schema public to borvat_app;
grant usage, select on all sequences in schema public to borvat_app;
grant execute on all functions in schema public to borvat_app;

alter default privileges in schema public
  grant select, insert, update, delete on tables to borvat_app;
alter default privileges in schema public
  grant usage, select on sequences to borvat_app;
alter default privileges in schema public
  grant execute on functions to borvat_app;
