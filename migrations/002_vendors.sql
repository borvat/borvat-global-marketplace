-- BORVAT Marketplace - migration 002: vendor onboarding and profiles
-- A seller never approves its own application; that rule is enforced by the database.

create type application_status as enum ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN');

create table vendor_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid not null references users (id) on delete restrict,
  legal_name text not null check (length(btrim(legal_name)) between 2 and 200),
  country char(2) not null check (country ~ '^[A-Z]{2}$'),
  company_registration text,
  vat_number text,
  status application_status not null default 'DRAFT',
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references users (id) on delete restrict,
  decision_note text,
  resulting_organization_id uuid references organizations (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint no_self_approval check (decided_by is null or decided_by <> applicant_user_id),
  constraint decision_consistency check (
    (status in ('APPROVED', 'REJECTED') and decided_at is not null and decided_by is not null)
    or (status not in ('APPROVED', 'REJECTED') and decided_at is null and decided_by is null)
  )
);

create index vendor_applications_status_idx on vendor_applications (status, created_at);
create index vendor_applications_applicant_idx on vendor_applications (applicant_user_id, created_at);

create table vendor_profiles (
  organization_id uuid primary key references organizations (id) on delete cascade,
  legal_name text not null check (length(btrim(legal_name)) between 2 and 200),
  country char(2) not null check (country ~ '^[A-Z]{2}$'),
  commission_bps integer not null default 1200 check (commission_bps between 0 and 5000),
  payout_currency char(3) not null check (payout_currency ~ '^[A-Z]{3}$'),
  status org_status not null default 'ACTIVE',
  application_id uuid references vendor_applications (id) on delete set null,
  approved_at timestamptz not null default now(),
  approved_by uuid not null references users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A vendor owner can never approve its own application, even through a direct SQL path.
create or replace function vendor_profile_no_self_approval() returns trigger language plpgsql as $$
declare
  applicant uuid;
begin
  if new.application_id is not null then
    select applicant_user_id into applicant from vendor_applications where id = new.application_id;
    if applicant is not null and applicant = new.approved_by then
      raise exception 'vendor application % cannot be approved by its own applicant', new.application_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger vendor_profiles_no_self_approval
  before insert or update on vendor_profiles
  for each row execute function vendor_profile_no_self_approval();