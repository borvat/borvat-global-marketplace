-- BORVAT Marketplace - migration 001: identity and tenancy
-- Every business row belongs either to an organization (vendor) or to a user (buyer).

create extension if not exists pgcrypto;
create extension if not exists citext;

create type org_kind as enum ('PLATFORM', 'VENDOR');
create type org_status as enum ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');
create type member_status as enum ('INVITED', 'ACTIVE', 'DISABLED');
create type role_kind as enum (
  'BUYER',
  'SELLER_OWNER',
  'SELLER_STAFF',
  'PLATFORM_ADMIN',
  'CATALOG_REVIEWER',
  'RISK_REVIEWER',
  'FINANCE_OPERATOR',
  'SUPPORT_AGENT'
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  kind org_kind not null,
  name text not null check (length(btrim(name)) between 2 and 200),
  slug citext not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  country char(2) not null check (country ~ '^[A-Z]{2}$'),
  default_currency char(3) not null check (default_currency ~ '^[A-Z]{3}$'),
  status org_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  password_hash text not null,
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  country char(2) not null check (country ~ '^[A-Z]{2}$'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED', 'DELETED')),
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  role role_kind not null,
  status member_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  unique (user_id, organization_id, role)
);

create index memberships_user_idx on memberships (user_id) where status = 'ACTIVE';
create index memberships_org_idx on memberships (organization_id) where status = 'ACTIVE';

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  active_organization_id uuid references organizations (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index sessions_user_idx on sessions (user_id);
create index sessions_expiry_idx on sessions (expires_at);