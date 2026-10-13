-- BORVAT Marketplace - migration 007: append-only audit, idempotency and outbox
-- Audit, money and stock ledgers can only be appended to. The database refuses
-- updates and deletes, so a compromised application path still cannot rewrite history.

create table audit_log (
  id bigserial primary key,
  actor_user_id uuid,
  actor_role text,
  organization_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  correlation_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_entity_idx on audit_log (entity_type, entity_id, id);
create index audit_actor_idx on audit_log (actor_user_id, id);
create index audit_correlation_idx on audit_log (correlation_id);

create or replace function borvat_append_only() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only and rejects %', tg_table_name, tg_op
    using errcode = 'raise_exception';
end $$;

create trigger audit_log_append_only
  before update or delete on audit_log
  for each row execute function borvat_append_only();

create trigger ledger_entries_append_only
  before update or delete on ledger_entries
  for each row execute function borvat_append_only();

create trigger inventory_ledger_append_only
  before update or delete on inventory_ledger
  for each row execute function borvat_append_only();

create trigger quotes_append_only
  before update or delete on quotes
  for each row execute function borvat_append_only();

create table idempotency_keys (
  key text primary key,
  scope text not null,
  actor_user_id uuid,
  request_hash text not null,
  status text not null default 'IN_PROGRESS'
    check (status in ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  response jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index idempotency_actor_idx on idempotency_keys (actor_user_id, created_at desc);

create table outbox_events (
  id bigserial primary key,
  topic text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0)
);

create index outbox_unpublished_idx on outbox_events (id) where published_at is null;