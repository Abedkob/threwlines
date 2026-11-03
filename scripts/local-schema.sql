-- ============================================================
-- idevelopit-vault - local PostgreSQL schema
-- Consolidates schema, billing, performance, roles, licensing and
-- billing functions for a plain PostgreSQL 14+ database (no Supabase).
-- Run ONCE against an empty database. No RLS, no auth schema: the
-- application authorizes requests and passes the acting user as
-- p_actor_id / p_user_id into every function that needs it.
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Enums -----------------------------------------------------
create type contact_stage    as enum ('new','contacted','replied','negotiating','customer','lost');
create type activity_channel as enum ('instagram','whatsapp','email','in_person','call','other');
create type payment_status   as enum ('paid','pending');
create type task_priority    as enum ('low','normal','high');
create type task_status      as enum ('open','done');

-- Profiles (one row per team member; credentials live here) -
create table profiles (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text not null,
  name          text not null,
  color         text not null default '#3D5AF1',
  created_at    timestamptz not null default now()
);

-- Services --------------------------------------------------
create table services (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  default_price numeric(12,2) not null default 0,
  created_at    timestamptz not null default now()
);

-- Expense categories (relational, so renames cascade for free)
create table expense_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- Contacts (a "lead"/"target" is just a contact pre-customer) -
create table contacts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  instagram   text,
  whatsapp    text,
  email       text,
  location    text,
  met_at      timestamptz,
  stage       contact_stage not null default 'new',
  assigned_to uuid references profiles(id) on delete set null,
  notes       text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on contacts (stage);
create index on contacts (assigned_to);

-- Activities (the touchpoint log; drives "last touched"/heat) -
create table activities (
  id         uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  author     uuid references profiles(id) on delete set null,
  channel    activity_channel,
  note       text not null,
  created_at timestamptz not null default now()
);
create index on activities (contact_id, created_at desc);

-- Payments (a customer contact can have zero, one, or many) ---
create table payments (
  id                 uuid primary key default gen_random_uuid(),
  contact_id         uuid not null references contacts(id) on delete cascade,
  service_id         uuid references services(id) on delete restrict,
  custom_description text,
  amount             numeric(12,2) not null,
  status             payment_status not null default 'pending',
  paid_on            date,
  created_at         timestamptz not null default now()
);
create index on payments (contact_id);

-- Tasks -----------------------------------------------------
create table tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  created_by  uuid references profiles(id) on delete set null,
  assigned_to uuid references profiles(id) on delete set null,
  due_date    date,
  priority    task_priority not null default 'normal',
  status      task_status not null default 'open',
  created_at  timestamptz not null default now()
);

-- Task items (bullets + sub-items, exactly two levels) -------
create table task_items (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  parent_id  uuid references task_items(id) on delete cascade,
  content    text not null,
  done       boolean not null default false,
  sort_order int not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on task_items (task_id);

-- Expenses --------------------------------------------------
create table expenses (
  id          uuid primary key default gen_random_uuid(),
  amount      numeric(12,2) not null,
  category_id uuid references expense_categories(id) on delete restrict,
  description text,
  spent_on    date not null default current_date,
  paid_by     uuid references profiles(id) on delete set null,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index on expenses (category_id);

-- Billing foundation ----------------------------------------
alter table public.contacts
  add column if not exists billing_name text,
  add column if not exists billing_contact text,
  add column if not exists billing_address text;

alter table public.services
  add column if not exists description text,
  add column if not exists default_quantity numeric(12,2) not null default 1,
  add column if not exists active boolean not null default true;

do $$ begin
  create type public.document_type as enum ('invoice', 'contract', 'receipt');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.contract_status as enum ('draft', 'active', 'paused', 'ended');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.invoice_status as enum ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.invoice_payment_method as enum ('cash', 'omt', 'whish');
exception when duplicate_object then null; end $$;

create table if not exists public.app_settings (
  id smallint primary key default 1 check (id = 1),
  company_name text not null,
  company_tagline text,
  company_phone text,
  company_email text,
  company_website text,
  logo_url text,
  stamp_url text,
  invoice_prefix text not null default 'INV',
  next_invoice_number bigint not null default 1 check (next_invoice_number > 0),
  invoice_number_padding int not null default 4 check (invoice_number_padding between 1 and 12),
  default_currency text not null default 'USD',
  default_due_days int not null default 7 check (default_due_days >= 0),
  default_terms text,
  default_footer text not null default 'Thank you for your business.',
  default_payment_instructions text,
  cash_enabled boolean not null default true,
  omt_enabled boolean not null default true,
  omt_recipient_name text,
  omt_phone text,
  whish_enabled boolean not null default true,
  whish_recipient_name text,
  whish_phone text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id, company_name)
values (1, 'ThrewLines')
on conflict (id) do nothing;

create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document_type public.document_type not null,
  is_default boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists one_default_template_per_type
  on public.document_templates (document_type) where is_default = true;

insert into public.document_templates (name, document_type, is_default, config)
select 'Classic invoice', 'invoice', true, $$
{
  "paperSize":"A4","orientation":"portrait","primaryColor":"#20242f",
  "fontFamily":"Arial","logoWidth":160,"stampWidth":130,
  "sections":["header","billTo","billingDetails","items","totals","paymentInstructions","terms","stamp"],
  "visibility":{"companyPhone":true,"companyEmail":true,"companyWebsite":true,"clientAddress":true,"clientEmail":true,"clientPhone":true,"contractReference":true,"purchaseOrderReference":true,"discount":true,"previousBalance":false},
  "labels":{"invoiceTitle":"INVOICE","billTo":"BILL TO","services":"SERVICES PROVIDED","totalDue":"TOTAL DUE"}
}
$$::jsonb
where not exists (
  select 1 from public.document_templates where document_type = 'invoice' and is_default
);

create table if not exists public.client_contracts (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  contract_number text unique,
  title text not null,
  start_date date not null,
  end_date date,
  billing_day int not null default 1 check (billing_day between 1 and 28),
  due_days int not null default 7 check (due_days >= 0),
  currency text not null default 'USD',
  status public.contract_status not null default 'draft',
  template_id uuid references public.document_templates(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists client_contracts_contact_idx on public.client_contracts(contact_id);
create index if not exists client_contracts_billing_idx on public.client_contracts(status, billing_day, start_date, end_date);

create table if not exists public.contract_items (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.client_contracts(id) on delete cascade,
  service_id uuid references public.services(id) on delete restrict,
  description text not null,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists contract_items_contract_idx on public.contract_items(contract_id, sort_order, id);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  contract_id uuid references public.client_contracts(id) on delete set null,
  template_id uuid references public.document_templates(id) on delete set null,
  status public.invoice_status not null default 'draft',
  invoice_date date not null default current_date,
  due_date date not null,
  service_period_start date,
  service_period_end date,
  currency text not null default 'USD',
  contract_reference text,
  purchase_order_reference text,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  notes text,
  terms text,
  payment_instructions text,
  company_snapshot jsonb not null default '{}'::jsonb,
  client_snapshot jsonb not null default '{}'::jsonb,
  template_snapshot jsonb not null default '{}'::jsonb,
  pdf_url text,
  finalized_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date >= invoice_date),
  check (service_period_end is null or service_period_start is null or service_period_end >= service_period_start),
  check (discount <= subtotal)
);
create index if not exists invoices_contact_date_idx on public.invoices(contact_id, invoice_date desc, id desc);
create index if not exists invoices_status_due_idx on public.invoices(status, due_date, id);
create unique index if not exists invoices_contract_period_unique
  on public.invoices(contract_id, service_period_start, service_period_end)
  where contract_id is not null and status <> 'cancelled';

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  service_id uuid references public.services(id) on delete restrict,
  description text not null,
  service_period_start date,
  service_period_end date,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) generated always as (quantity * unit_price) stored,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check (service_period_end is null or service_period_start is null or service_period_end >= service_period_start)
);
create index if not exists invoice_items_invoice_idx on public.invoice_items(invoice_id, sort_order, id);

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_method public.invoice_payment_method not null,
  paid_on date not null default current_date,
  transaction_reference text,
  notes text,
  received_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists invoice_payments_invoice_idx on public.invoice_payments(invoice_id, paid_on desc, id desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists app_settings_touch on public.app_settings;
create trigger app_settings_touch before update on public.app_settings
for each row execute function public.touch_updated_at();
drop trigger if exists document_templates_touch on public.document_templates;
create trigger document_templates_touch before update on public.document_templates
for each row execute function public.touch_updated_at();
drop trigger if exists client_contracts_touch on public.client_contracts;
create trigger client_contracts_touch before update on public.client_contracts
for each row execute function public.touch_updated_at();
drop trigger if exists invoices_touch on public.invoices;
create trigger invoices_touch before update on public.invoices
for each row execute function public.touch_updated_at();

create or replace view public.invoice_balances
as
select i.*,
  coalesce(p.amount_paid, 0)::numeric(12,2) as amount_paid,
  greatest(i.total_amount - coalesce(p.amount_paid, 0), 0)::numeric(12,2) as balance_due
from public.invoices i
left join (
  select invoice_id, sum(amount) as amount_paid
  from public.invoice_payments group by invoice_id
) p on p.invoice_id = i.id;

comment on table public.payments is
  'Legacy contact-level expected/received payment ledger. Preserved; new invoice receipts use invoice_payments.';

-- Performance -----------------------------------------------
alter table contacts add column if not exists last_touched_at timestamptz;

update contacts c
set last_touched_at = coalesce(
  (select max(a.created_at) from activities a where a.contact_id = c.id),
  c.met_at,
  c.created_at
)
where c.last_touched_at is null;

alter table contacts alter column last_touched_at set default now();
alter table contacts alter column last_touched_at set not null;

create extension if not exists pg_trgm ;

create or replace function refresh_contact_last_touched(p_contact_id uuid)
returns void
language sql

set search_path = public
as $$
  update contacts c
  set last_touched_at = coalesce(
    (select max(a.created_at) from activities a where a.contact_id = p_contact_id),
    c.met_at,
    c.created_at
  )
  where c.id = p_contact_id;
$$;

create or replace function handle_activity_touch_change()
returns trigger
language plpgsql

set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform refresh_contact_last_touched(old.contact_id);
    return old;
  end if;

  perform refresh_contact_last_touched(new.contact_id);
  if tg_op = 'UPDATE' and old.contact_id is distinct from new.contact_id then
    perform refresh_contact_last_touched(old.contact_id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_activity_touch_change on activities;
create trigger on_activity_touch_change
  after insert or update or delete on activities
  for each row execute function handle_activity_touch_change();

create or replace function handle_contact_touch_base()
returns trigger
language plpgsql

set search_path = public
as $$
begin
  new.last_touched_at := coalesce(
    (select max(a.created_at) from activities a where a.contact_id = new.id),
    new.met_at,
    new.created_at,
    now()
  );
  return new;
end;
$$;

drop trigger if exists on_contact_touch_base on contacts;
create trigger on_contact_touch_base
  before insert or update of met_at on contacts
  for each row execute function handle_contact_touch_base();

create index if not exists contacts_last_touched_idx
  on contacts (last_touched_at asc, id asc);
create index if not exists contacts_stage_touch_idx
  on contacts (stage, last_touched_at asc, id asc);
create index if not exists contacts_active_touch_idx
  on contacts (last_touched_at asc, id asc)
  where stage in ('new','contacted','replied','negotiating');
create index if not exists contacts_name_trgm_idx
  on contacts using gin (name gin_trgm_ops);
create index if not exists contacts_email_trgm_idx
  on contacts using gin (email gin_trgm_ops);
create index if not exists contacts_instagram_trgm_idx
  on contacts using gin (instagram gin_trgm_ops);
create index if not exists contacts_whatsapp_trgm_idx
  on contacts using gin (whatsapp gin_trgm_ops);
create index if not exists contacts_location_trgm_idx
  on contacts using gin (location gin_trgm_ops);
create index if not exists activities_contact_cursor_idx
  on activities (contact_id, created_at desc, id desc);
create index if not exists payments_contact_cursor_idx
  on payments (contact_id, created_at desc, id desc);
create index if not exists expenses_spent_on_idx
  on expenses (spent_on desc, id desc);
create index if not exists expenses_paid_by_idx
  on expenses (paid_by);
create index if not exists tasks_status_assignee_due_idx
  on tasks (status, assigned_to, due_date, id);
create index if not exists tasks_status_due_idx
  on tasks (status, due_date asc nulls last, id asc);

create or replace function navigation_counts()
returns jsonb
language sql
stable

set search_path = public
as $$
  select jsonb_build_object(
    'stale_contacts', (
      select count(*)
      from contacts
      where stage in ('new','contacted','replied','negotiating')
        and last_touched_at < now() - interval '7 days'
    ),
    'open_tasks', (select count(*) from tasks where status = 'open')
  );
$$;

create or replace function dashboard_summary(p_user_id uuid)
returns jsonb
language sql
stable

set search_path = public
as $$
  select jsonb_build_object(
    'need_attention', (
      select count(*) from contacts
      where stage in ('new','contacted','replied','negotiating')
        and last_touched_at < now() - interval '7 days'
    ),
    'active_pipeline', (
      select count(*) from contacts
      where stage in ('new','contacted','replied','negotiating')
    ),
    'negotiating', (select count(*) from contacts where stage = 'negotiating'),
    'collected', (select coalesce(sum(amount), 0) from payments where status = 'paid'),
    'pending', (select coalesce(sum(amount), 0) from payments where status = 'pending'),
    'spent', (select coalesce(sum(amount), 0) from expenses),
    'my_open_tasks', (
      select count(*) from tasks where status = 'open' and assigned_to = p_user_id
    ),
    'pipeline_counts', (
      select coalesce(jsonb_object_agg(stage, total), '{}'::jsonb)
      from (select stage::text as stage, count(*) as total from contacts group by stage) grouped
    ),
    'expense_categories', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'total', total) order by total desc), '[]'::jsonb)
      from (
        select coalesce(ec.name, 'Uncategorized') as name, sum(e.amount) as total
        from expenses e
        left join expense_categories ec on ec.id = e.category_id
        group by coalesce(ec.name, 'Uncategorized')
      ) grouped
    )
  );
$$;

create or replace function expense_summary()
returns jsonb
language sql
stable

set search_path = public
as $$
  select jsonb_build_object(
    'total', (select coalesce(sum(amount), 0) from expenses),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'total', total) order by total desc), '[]'::jsonb)
      from (
        select ec.id, ec.name, coalesce(sum(e.amount), 0) as total
        from expense_categories ec
        left join expenses e on e.category_id = ec.id
        group by ec.id, ec.name
      ) grouped
    ),
    'payers', (
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'color', color, 'total', total, 'entries', entries) order by total desc), '[]'::jsonb)
      from (
        select p.id, p.name, p.color, coalesce(sum(e.amount), 0) as total, count(e.id) as entries
        from profiles p
        left join expenses e on e.paid_by = p.id
        group by p.id, p.name, p.color
      ) grouped
    )
  );
$$;

create or replace function contact_payment_summary(p_contact_id uuid)
returns jsonb
language sql
stable

set search_path = public
as $$
  select jsonb_build_object(
    'collected', coalesce(sum(amount) filter (where status = 'paid'), 0),
    'pending', coalesce(sum(amount) filter (where status = 'pending'), 0),
    'entries', count(*)
  )
  from payments
  where contact_id = p_contact_id;
$$;

-- Roles -------------------------------------------------------
-- Authorization source. The first superadmin is created by local-seed.sql.
alter table public.profiles
  add column if not exists app_role text not null default 'member';
alter table public.profiles
  add constraint profiles_app_role_check check (app_role in ('member', 'superadmin'));

create or replace function public.is_superadmin(p_user_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id and app_role = 'superadmin'
  );
$$;

-- Licensing ---------------------------------------------------
do $$ begin
  create type public.license_type as enum ('trial', 'subscription', 'perpetual');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.license_status as enum ('active', 'suspended', 'revoked');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.license_event_type as enum (
    'issued', 'updated', 'activated', 'validated', 'deactivated',
    'activation_reset', 'suspended', 'reactivated', 'revoked', 'rejected'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.licensed_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  name text not null check (char_length(trim(name)) between 2 and 100),
  description text,
  default_max_activations int not null default 1 check (default_max_activations between 1 and 10000),
  default_offline_grace_days int not null default 7 check (default_offline_grace_days between 0 and 365),
  default_validation_hours int not null default 24 check (default_validation_hours between 1 and 720),
  default_entitlements jsonb not null default '{}'::jsonb check (jsonb_typeof(default_entitlements) = 'object'),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete restrict,
  product_id uuid not null references public.licensed_products(id) on delete restrict,
  source_invoice_id uuid references public.invoices(id) on delete set null,
  source_contract_id uuid references public.client_contracts(id) on delete set null,
  key_digest bytea not null unique,
  key_prefix text not null,
  key_last_four text not null,
  license_type public.license_type not null default 'subscription',
  status public.license_status not null default 'active',
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  max_activations int not null default 1 check (max_activations between 1 and 10000),
  offline_grace_days int not null default 7 check (offline_grace_days between 0 and 365),
  validation_hours int not null default 24 check (validation_hours between 1 and 720),
  entitlements jsonb not null default '{}'::jsonb check (jsonb_typeof(entitlements) = 'object'),
  internal_notes text,
  token_version int not null default 1 check (token_version > 0),
  issued_by uuid references public.profiles(id) on delete set null,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at),
  check (license_type <> 'perpetual' or expires_at is null),
  check ((status = 'revoked') = (revoked_at is not null))
);

create table if not exists public.license_activations (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  installation_hash text not null check (char_length(installation_hash) between 32 and 128),
  device_label text,
  platform text,
  application_version text,
  first_activated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  deactivated_at timestamptz,
  deactivated_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.license_events (
  id bigint generated always as identity primary key,
  license_id uuid references public.licenses(id) on delete cascade,
  activation_id uuid references public.license_activations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete restrict,
  event_type public.license_event_type not null,
  result_code text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  request_id text,
  network_hash text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

create table if not exists public.license_api_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_digest bytea not null unique,
  key_prefix text not null,
  scopes text[] not null default array['licenses:validate']::text[],
  active boolean not null default true,
  last_used_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.license_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  hits int not null default 1,
  updated_at timestamptz not null default now()
);

create index if not exists licenses_contact_idx on public.licenses(contact_id, created_at desc);
create index if not exists licenses_product_status_idx on public.licenses(product_id, status, expires_at);
create index if not exists licenses_expiry_idx on public.licenses(expires_at) where status = 'active' and expires_at is not null;
create index if not exists license_activations_license_idx on public.license_activations(license_id, last_seen_at desc);
create unique index if not exists license_active_installation_unique
  on public.license_activations(license_id, installation_hash) where deactivated_at is null;
create index if not exists license_events_license_idx on public.license_events(license_id, occurred_at desc);
create index if not exists license_events_contact_idx on public.license_events(contact_id, occurred_at desc);
create index if not exists license_events_request_idx on public.license_events(request_id) where request_id is not null;

drop trigger if exists licensed_products_touch on public.licensed_products;
create trigger licensed_products_touch before update on public.licensed_products
for each row execute function public.touch_updated_at();
drop trigger if exists licenses_touch on public.licenses;
create trigger licenses_touch before update on public.licenses
for each row execute function public.touch_updated_at();

create or replace function public.validate_license_commercial_links()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.source_invoice_id is not null and not exists (
    select 1 from public.invoices where id = new.source_invoice_id and contact_id = new.contact_id
  ) then raise exception 'The source invoice must belong to the selected contact'; end if;
  if new.source_contract_id is not null and not exists (
    select 1 from public.client_contracts where id = new.source_contract_id and contact_id = new.contact_id
  ) then raise exception 'The source contract must belong to the selected contact'; end if;
  return new;
end $$;
drop trigger if exists licenses_validate_commercial_links on public.licenses;
create trigger licenses_validate_commercial_links before insert or update on public.licenses
for each row execute function public.validate_license_commercial_links();

create or replace view public.license_registry
as
select
  l.id, l.contact_id, l.product_id, l.source_invoice_id, l.source_contract_id,
  l.key_prefix, l.key_last_four, l.license_type, l.status, l.starts_at, l.expires_at,
  l.max_activations, l.offline_grace_days, l.validation_hours, l.entitlements,
  l.internal_notes, l.token_version, l.issued_by, l.revoked_by, l.revoked_at,
  l.created_at, l.updated_at,
  case
    when l.status = 'revoked' then 'revoked'
    when l.status = 'suspended' then 'suspended'
    when l.starts_at > now() then 'scheduled'
    when l.expires_at is not null and l.expires_at <= now() then 'expired'
    else 'active'
  end as effective_status,
  coalesce(a.active_activations, 0)::int as active_activations,
  coalesce(a.total_activations, 0)::int as total_activations,
  a.last_seen_at,
  row_to_json(c)::jsonb as contact,
  row_to_json(p)::jsonb as product,
  case when i.id is null then null else jsonb_build_object(
    'id', i.id, 'invoice_number', i.invoice_number, 'status', i.status,
    'currency', i.currency, 'total_amount', i.total_amount,
    'amount_paid', i.amount_paid, 'balance_due', i.balance_due
  ) end as source_invoice
from public.licenses l
join lateral (
  select id, name, billing_name, email, whatsapp from public.contacts where id = l.contact_id
) c on true
join lateral (
  select id, code, name, description, active from public.licensed_products where id = l.product_id
) p on true
left join (
  select license_id,
    count(*) filter (where deactivated_at is null) as active_activations,
    count(*) as total_activations,
    max(last_seen_at) as last_seen_at
  from public.license_activations group by license_id
) a on a.license_id = l.id
left join public.invoice_balances i on i.id = l.source_invoice_id;

create or replace function public.save_licensed_product(p_actor_id uuid, p_product jsonb, p_id uuid default null)
returns uuid language plpgsql set search_path = public as $$
declare v_id uuid; v_code text;
begin
  if not public.is_superadmin(p_actor_id) then raise exception 'Superadmin access required'; end if;
  v_code := lower(trim(p_product->>'code'));
  if v_code !~ '^[a-z0-9][a-z0-9_-]{1,39}$' then raise exception 'Product code must use 2-40 lowercase letters, numbers, dashes, or underscores'; end if;
  if coalesce(trim(p_product->>'name'),'') = '' then raise exception 'Product name is required'; end if;
  if p_id is null then
    insert into public.licensed_products(
      code,name,description,default_max_activations,default_offline_grace_days,
      default_validation_hours,default_entitlements,active,created_by
    ) values (
      v_code,trim(p_product->>'name'),nullif(trim(p_product->>'description'),''),
      coalesce((p_product->>'default_max_activations')::int,1),
      coalesce((p_product->>'default_offline_grace_days')::int,7),
      coalesce((p_product->>'default_validation_hours')::int,24),
      coalesce(p_product->'default_entitlements','{}'::jsonb),
      coalesce((p_product->>'active')::boolean,true),p_actor_id
    ) returning id into v_id;
  else
    update public.licensed_products set
      code=v_code,name=trim(p_product->>'name'),description=nullif(trim(p_product->>'description'),''),
      default_max_activations=coalesce((p_product->>'default_max_activations')::int,1),
      default_offline_grace_days=coalesce((p_product->>'default_offline_grace_days')::int,7),
      default_validation_hours=coalesce((p_product->>'default_validation_hours')::int,24),
      default_entitlements=coalesce(p_product->'default_entitlements','{}'::jsonb),
      active=coalesce((p_product->>'active')::boolean,true)
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Product not found'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.issue_license(p_actor_id uuid, p_license jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_id uuid; v_product public.licensed_products%rowtype; v_random text; v_key text;
  v_contact_id uuid := (p_license->>'contact_id')::uuid;
begin
  if not public.is_superadmin(p_actor_id) then raise exception 'Superadmin access required'; end if;
  select * into v_product from public.licensed_products
  where id=(p_license->>'product_id')::uuid and active;
  if not found then raise exception 'Choose an active product'; end if;
  if not exists(select 1 from public.contacts where id=v_contact_id) then raise exception 'Customer not found'; end if;
  v_random := upper(encode(gen_random_bytes(20),'hex'));
  v_key := 'IDV-' || upper(regexp_replace(v_product.code,'[^a-zA-Z0-9]','','g')) || '-' ||
    substr(v_random,1,5) || '-' || substr(v_random,6,5) || '-' ||
    substr(v_random,11,5) || '-' || substr(v_random,16,5) || '-' ||
    substr(v_random,21,5) || '-' || substr(v_random,26,5) || '-' ||
    substr(v_random,31,5) || '-' || substr(v_random,36,5);
  insert into public.licenses(
    contact_id,product_id,source_invoice_id,source_contract_id,key_digest,key_prefix,key_last_four,
    license_type,status,starts_at,expires_at,max_activations,offline_grace_days,
    validation_hours,entitlements,internal_notes,issued_by
  ) values (
    v_contact_id,v_product.id,nullif(p_license->>'source_invoice_id','')::uuid,
    nullif(p_license->>'source_contract_id','')::uuid,digest(v_key,'sha256'),
    split_part(v_key,'-',1)||'-'||split_part(v_key,'-',2),right(v_key,4),
    coalesce((p_license->>'license_type')::public.license_type,'subscription'),'active',
    coalesce(nullif(p_license->>'starts_at','')::timestamptz,now()),
    case when coalesce(p_license->>'license_type','subscription')='perpetual' then null
      else (nullif(p_license->>'expires_at','')::date + 1)::timestamptz - interval '1 second' end,
    coalesce((p_license->>'max_activations')::int,v_product.default_max_activations),
    coalesce((p_license->>'offline_grace_days')::int,v_product.default_offline_grace_days),
    coalesce((p_license->>'validation_hours')::int,v_product.default_validation_hours),
    coalesce(p_license->'entitlements','{}'::jsonb),nullif(trim(p_license->>'internal_notes'),''),p_actor_id
  ) returning id into v_id;
  insert into public.license_events(license_id,contact_id,event_type,result_code,actor_id,metadata)
  values(v_id,v_contact_id,'issued','LICENSE_ISSUED',p_actor_id,jsonb_build_object('product_id',v_product.id));
  return jsonb_build_object('license_id',v_id,'license_key',v_key);
end $$;

create or replace function public.admin_update_license(p_actor_id uuid, p_license_id uuid, p_patch jsonb)
returns void language plpgsql set search_path = public as $$
declare v_before public.licenses%rowtype; v_after public.licenses%rowtype; v_event public.license_event_type := 'updated';
begin
  if not public.is_superadmin(p_actor_id) then raise exception 'Superadmin access required'; end if;
  select * into v_before from public.licenses where id=p_license_id for update;
  if not found then raise exception 'License not found'; end if;
  update public.licenses set
    status=coalesce((p_patch->>'status')::public.license_status,status),
    starts_at=coalesce(nullif(p_patch->>'starts_at','')::timestamptz,starts_at),
    expires_at=case when license_type='perpetual' then null when p_patch ? 'expires_at' then
      case when nullif(p_patch->>'expires_at','') is null then null
        else (nullif(p_patch->>'expires_at','')::date + 1)::timestamptz - interval '1 second' end
      else expires_at end,
    max_activations=coalesce((p_patch->>'max_activations')::int,max_activations),
    offline_grace_days=coalesce((p_patch->>'offline_grace_days')::int,offline_grace_days),
    validation_hours=coalesce((p_patch->>'validation_hours')::int,validation_hours),
    entitlements=coalesce(p_patch->'entitlements',entitlements),
    internal_notes=case when p_patch ? 'internal_notes' then nullif(trim(p_patch->>'internal_notes'),'') else internal_notes end,
    revoked_at=case when coalesce(p_patch->>'status',status::text)='revoked' then coalesce(revoked_at,now()) else null end,
    revoked_by=case when coalesce(p_patch->>'status',status::text)='revoked' then coalesce(revoked_by,p_actor_id) else null end,
    token_version=case when p_patch ? 'status' or p_patch ? 'max_activations' or p_patch ? 'expires_at' then token_version+1 else token_version end
  where id=p_license_id returning * into v_after;
  v_event := case
    when v_after.status='revoked' and v_before.status<>'revoked' then 'revoked'
    when v_after.status='suspended' and v_before.status<>'suspended' then 'suspended'
    when v_after.status='active' and v_before.status='suspended' then 'reactivated'
    else 'updated' end;
  insert into public.license_events(license_id,contact_id,event_type,result_code,actor_id,metadata)
  values(v_after.id,v_after.contact_id,v_event,'LICENSE_'||upper(v_event::text),p_actor_id,p_patch);
end $$;

create or replace function public.admin_deactivate_license_activation(p_actor_id uuid, p_activation_id uuid, p_reason text default 'Removed by superadmin')
returns void language plpgsql set search_path = public as $$
declare v_activation public.license_activations%rowtype; v_contact uuid;
begin
  if not public.is_superadmin(p_actor_id) then raise exception 'Superadmin access required'; end if;
  update public.license_activations set deactivated_at=coalesce(deactivated_at,now()),deactivated_reason=p_reason
  where id=p_activation_id returning * into v_activation;
  if not found then raise exception 'Activation not found'; end if;
  update public.licenses set token_version=token_version+1 where id=v_activation.license_id returning contact_id into v_contact;
  insert into public.license_events(license_id,activation_id,contact_id,event_type,result_code,actor_id)
  values(v_activation.license_id,v_activation.id,v_contact,'deactivated','ACTIVATION_DEACTIVATED',p_actor_id);
end $$;

create or replace function public.admin_reset_license_activations(p_actor_id uuid, p_license_id uuid)
returns void language plpgsql set search_path = public as $$
declare v_contact uuid;
begin
  if not public.is_superadmin(p_actor_id) then raise exception 'Superadmin access required'; end if;
  update public.license_activations set deactivated_at=coalesce(deactivated_at,now()),deactivated_reason='Reset by superadmin'
  where license_id=p_license_id and deactivated_at is null;
  update public.licenses set token_version=token_version+1 where id=p_license_id returning contact_id into v_contact;
  if v_contact is null then raise exception 'License not found'; end if;
  insert into public.license_events(license_id,contact_id,event_type,result_code,actor_id)
  values(p_license_id,v_contact,'activation_reset','ACTIVATIONS_RESET',p_actor_id);
end $$;

create or replace function public.license_api_activate(
  p_license_key text, p_product_code text, p_installation_hash text,
  p_device_label text default null, p_platform text default null,
  p_application_version text default null, p_request_id text default null,
  p_network_hash text default null
) returns jsonb language plpgsql set search_path = public as $$
declare
  v_license public.licenses%rowtype; v_product public.licensed_products%rowtype;
  v_activation public.license_activations%rowtype; v_count int; v_code text;
begin
  select l.* into v_license from public.licenses l
  where l.key_digest=digest(upper(trim(p_license_key)),'sha256') for update;
  if not found then return jsonb_build_object('ok',false,'code','LICENSE_INVALID'); end if;
  select * into v_product from public.licensed_products where id=v_license.product_id;
  v_code := case
    when not v_product.active or lower(v_product.code)<>lower(trim(p_product_code)) then 'PRODUCT_MISMATCH'
    when v_license.status='revoked' then 'LICENSE_REVOKED'
    when v_license.status='suspended' then 'LICENSE_SUSPENDED'
    when v_license.starts_at>now() then 'LICENSE_NOT_STARTED'
    when v_license.expires_at is not null and v_license.expires_at<=now() then 'LICENSE_EXPIRED'
    else null end;
  if v_code is not null then
    insert into public.license_events(license_id,contact_id,event_type,result_code,request_id,network_hash)
    values(v_license.id,v_license.contact_id,'rejected',v_code,p_request_id,p_network_hash);
    return jsonb_build_object('ok',false,'code',v_code);
  end if;
  select * into v_activation from public.license_activations
  where license_id=v_license.id and installation_hash=p_installation_hash and deactivated_at is null for update;
  if not found then
    select count(*) into v_count from public.license_activations where license_id=v_license.id and deactivated_at is null;
    if v_count>=v_license.max_activations then
      insert into public.license_events(license_id,contact_id,event_type,result_code,request_id,network_hash)
      values(v_license.id,v_license.contact_id,'rejected','ACTIVATION_LIMIT_REACHED',p_request_id,p_network_hash);
      return jsonb_build_object('ok',false,'code','ACTIVATION_LIMIT_REACHED');
    end if;
    insert into public.license_activations(license_id,installation_hash,device_label,platform,application_version)
    values(v_license.id,p_installation_hash,nullif(trim(p_device_label),''),nullif(trim(p_platform),''),nullif(trim(p_application_version),''))
    returning * into v_activation;
    insert into public.license_events(license_id,activation_id,contact_id,event_type,result_code,request_id,network_hash,metadata)
    values(v_license.id,v_activation.id,v_license.contact_id,'activated','LICENSE_ACTIVATED',p_request_id,p_network_hash,
      jsonb_build_object('platform',p_platform,'application_version',p_application_version));
  else
    update public.license_activations set last_seen_at=now(),device_label=coalesce(nullif(trim(p_device_label),''),device_label),
      platform=coalesce(nullif(trim(p_platform),''),platform),application_version=coalesce(nullif(trim(p_application_version),''),application_version)
    where id=v_activation.id returning * into v_activation;
  end if;
  return jsonb_build_object(
    'ok',true,'code','LICENSE_ACTIVE','license_id',v_license.id,'activation_id',v_activation.id,
    'product_code',v_product.code,'license_type',v_license.license_type,'expires_at',v_license.expires_at,
    'validation_hours',v_license.validation_hours,'offline_grace_days',v_license.offline_grace_days,
    'token_version',v_license.token_version,'entitlements',v_product.default_entitlements||v_license.entitlements
  );
end $$;

create or replace function public.license_api_validate(
  p_activation_id uuid, p_installation_hash text, p_request_id text default null,
  p_network_hash text default null, p_application_version text default null
) returns jsonb language plpgsql set search_path = public as $$
declare v_activation public.license_activations%rowtype; v_license public.licenses%rowtype; v_product public.licensed_products%rowtype; v_code text;
begin
  select * into v_activation from public.license_activations
  where id=p_activation_id and installation_hash=p_installation_hash and deactivated_at is null for update;
  if not found then return jsonb_build_object('ok',false,'code','INSTALLATION_NOT_FOUND'); end if;
  select * into v_license from public.licenses where id=v_activation.license_id;
  select * into v_product from public.licensed_products where id=v_license.product_id;
  v_code := case
    when v_license.status='revoked' then 'LICENSE_REVOKED'
    when v_license.status='suspended' then 'LICENSE_SUSPENDED'
    when v_license.starts_at>now() then 'LICENSE_NOT_STARTED'
    when v_license.expires_at is not null and v_license.expires_at<=now() then 'LICENSE_EXPIRED'
    when not v_product.active then 'PRODUCT_DISABLED'
    else null end;
  if v_code is not null then
    insert into public.license_events(license_id,activation_id,contact_id,event_type,result_code,request_id,network_hash)
    values(v_license.id,v_activation.id,v_license.contact_id,'rejected',v_code,p_request_id,p_network_hash);
    return jsonb_build_object('ok',false,'code',v_code,'token_version',v_license.token_version);
  end if;
  update public.license_activations set last_seen_at=now(),application_version=coalesce(nullif(trim(p_application_version),''),application_version)
  where id=v_activation.id;
  return jsonb_build_object(
    'ok',true,'code','LICENSE_ACTIVE','license_id',v_license.id,'activation_id',v_activation.id,
    'product_code',v_product.code,'license_type',v_license.license_type,'expires_at',v_license.expires_at,
    'validation_hours',v_license.validation_hours,'offline_grace_days',v_license.offline_grace_days,
    'token_version',v_license.token_version,'entitlements',v_product.default_entitlements||v_license.entitlements
  );
end $$;

create or replace function public.license_api_deactivate(p_activation_id uuid, p_installation_hash text, p_request_id text default null)
returns jsonb language plpgsql set search_path = public as $$
declare v_activation public.license_activations%rowtype; v_contact uuid;
begin
  update public.license_activations set deactivated_at=now(),deactivated_reason='Deactivated by application'
  where id=p_activation_id and installation_hash=p_installation_hash and deactivated_at is null returning * into v_activation;
  if not found then return jsonb_build_object('ok',false,'code','INSTALLATION_NOT_FOUND'); end if;
  update public.licenses set token_version=token_version+1 where id=v_activation.license_id returning contact_id into v_contact;
  insert into public.license_events(license_id,activation_id,contact_id,event_type,result_code,request_id)
  values(v_activation.license_id,v_activation.id,v_contact,'deactivated','ACTIVATION_DEACTIVATED',p_request_id);
  return jsonb_build_object('ok',true,'code','ACTIVATION_DEACTIVATED');
end $$;

create or replace function public.license_rate_limit_hit(p_bucket_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql set search_path = public as $$
declare v_hits int;
begin
  insert into public.license_rate_limits(bucket_key,window_started_at,hits,updated_at)
  values(p_bucket_key,now(),1,now())
  on conflict(bucket_key) do update set
    hits=case when license_rate_limits.window_started_at < now()-(p_window_seconds||' seconds')::interval then 1 else license_rate_limits.hits+1 end,
    window_started_at=case when license_rate_limits.window_started_at < now()-(p_window_seconds||' seconds')::interval then now() else license_rate_limits.window_started_at end,
    updated_at=now()
  returning hits into v_hits;
  return v_hits<=p_limit;
end $$;

comment on table public.licenses is 'Contact-owned product licenses. Plaintext keys are never stored.';
comment on table public.license_events is 'Append-only audit trail for license management and external lifecycle decisions.';

-- Billing functions ---------------------------------------------
create or replace function public.save_contract(p_actor_id uuid, p_contract jsonb, p_items jsonb, p_id uuid default null)
returns uuid
language plpgsql

set search_path = public
as $$
declare v_id uuid; v_item jsonb;
begin
  if not public.is_superadmin(p_actor_id) then raise exception 'Superadmin access required'; end if;
  if coalesce(trim(p_contract->>'title'), '') = '' then raise exception 'Contract title is required'; end if;
  if p_contract->>'contact_id' is null then raise exception 'Customer is required'; end if;
  if coalesce(jsonb_typeof(p_items),'null') <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one contract item'; end if;

  if p_id is null then
    insert into public.client_contracts (
      contact_id, contract_number, title, start_date, end_date, billing_day,
      due_days, currency, status, template_id, notes, created_by
    ) values (
      (p_contract->>'contact_id')::uuid, nullif(trim(p_contract->>'contract_number'), ''), trim(p_contract->>'title'),
      (p_contract->>'start_date')::date, nullif(p_contract->>'end_date','')::date,
      coalesce((p_contract->>'billing_day')::int,1), coalesce((p_contract->>'due_days')::int,7),
      coalesce(nullif(trim(p_contract->>'currency'),''),'USD'),
      coalesce((p_contract->>'status')::contract_status,'draft'),
      nullif(p_contract->>'template_id','')::uuid, nullif(trim(p_contract->>'notes'),''), p_actor_id
    ) returning id into v_id;
  else
    update public.client_contracts set
      contact_id=(p_contract->>'contact_id')::uuid,
      contract_number=nullif(trim(p_contract->>'contract_number'),''), title=trim(p_contract->>'title'),
      start_date=(p_contract->>'start_date')::date, end_date=nullif(p_contract->>'end_date','')::date,
      billing_day=coalesce((p_contract->>'billing_day')::int,1), due_days=coalesce((p_contract->>'due_days')::int,7),
      currency=coalesce(nullif(trim(p_contract->>'currency'),''),'USD'), status=(p_contract->>'status')::contract_status,
      template_id=nullif(p_contract->>'template_id','')::uuid, notes=nullif(trim(p_contract->>'notes'),'')
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Contract not found'; end if;
    delete from public.contract_items where contract_id=v_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(trim(v_item->>'description'),'')='' then raise exception 'Item description is required'; end if;
    if coalesce((v_item->>'quantity')::numeric,0)<=0 then raise exception 'Item quantity must be greater than zero'; end if;
    if coalesce((v_item->>'unit_price')::numeric,-1)<0 then raise exception 'Item price cannot be negative'; end if;
    insert into public.contract_items(contract_id,service_id,description,quantity,unit_price,sort_order)
    values(v_id,nullif(v_item->>'service_id','')::uuid,trim(v_item->>'description'),(v_item->>'quantity')::numeric,(v_item->>'unit_price')::numeric,coalesce((v_item->>'sort_order')::int,0));
  end loop;
  return v_id;
end $$;

create or replace function public.save_document_template(p_actor_id uuid, p_template jsonb, p_id uuid default null)
returns uuid
language plpgsql

set search_path = public
as $$
declare v_id uuid; v_type document_type; v_default boolean;
begin
  if not public.is_superadmin(p_actor_id) then raise exception 'Superadmin access required'; end if;
  if coalesce(trim(p_template->>'name'),'')='' then raise exception 'Template name is required'; end if;
  v_type := (p_template->>'document_type')::document_type;
  v_default := coalesce((p_template->>'is_default')::boolean,false);
  if v_default then update public.document_templates set is_default=false where document_type=v_type and id is distinct from p_id; end if;
  if p_id is null then
    insert into public.document_templates(name,document_type,is_default,config,created_by)
    values(trim(p_template->>'name'),v_type,v_default,coalesce(p_template->'config','{}'::jsonb),p_actor_id) returning id into v_id;
  else
    update public.document_templates set name=trim(p_template->>'name'),document_type=v_type,is_default=v_default,config=coalesce(p_template->'config','{}'::jsonb)
    where id=p_id returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.create_invoice(p_actor_id uuid, p_invoice jsonb, p_items jsonb)
returns uuid
language plpgsql

set search_path = public
as $$
declare
  v_settings app_settings%rowtype; v_id uuid; v_item jsonb; v_subtotal numeric(12,2):=0;
  v_discount numeric(12,2):=coalesce((p_invoice->>'discount')::numeric,0); v_number text; v_template uuid;
begin
  if not public.is_superadmin(p_actor_id) then raise exception 'Superadmin access required'; end if;
  if p_invoice->>'contact_id' is null then raise exception 'Customer is required'; end if;
  if coalesce(jsonb_typeof(p_items),'null')<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Add at least one invoice item'; end if;
  if (p_invoice->>'due_date')::date < (p_invoice->>'invoice_date')::date then raise exception 'Due date cannot be before invoice date'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(trim(v_item->>'description'),'')='' then raise exception 'Item description is required'; end if;
    if coalesce((v_item->>'quantity')::numeric,0)<=0 then raise exception 'Item quantity must be greater than zero'; end if;
    if coalesce((v_item->>'unit_price')::numeric,-1)<0 then raise exception 'Item price cannot be negative'; end if;
    v_subtotal := v_subtotal + (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric;
  end loop;
  if v_discount<0 or v_discount>v_subtotal then raise exception 'Discount cannot exceed subtotal'; end if;

  select * into v_settings from public.app_settings where id=1 for update;
  if not found then raise exception 'Company settings are not configured'; end if;
  v_number := v_settings.invoice_prefix || '-' || lpad(v_settings.next_invoice_number::text,v_settings.invoice_number_padding,'0');
  update public.app_settings set next_invoice_number=next_invoice_number+1,updated_by=p_actor_id where id=1;
  v_template := nullif(p_invoice->>'template_id','')::uuid;
  if v_template is null then select id into v_template from public.document_templates where document_type='invoice' and is_default limit 1; end if;

  insert into public.invoices(
    invoice_number,contact_id,contract_id,template_id,status,invoice_date,due_date,
    service_period_start,service_period_end,currency,contract_reference,purchase_order_reference,
    subtotal,discount,total_amount,notes,terms,payment_instructions,created_by
  ) values (
    v_number,(p_invoice->>'contact_id')::uuid,nullif(p_invoice->>'contract_id','')::uuid,v_template,'draft',
    (p_invoice->>'invoice_date')::date,(p_invoice->>'due_date')::date,
    nullif(p_invoice->>'service_period_start','')::date,nullif(p_invoice->>'service_period_end','')::date,
    coalesce(nullif(trim(p_invoice->>'currency'),''),v_settings.default_currency),
    nullif(trim(p_invoice->>'contract_reference'),''),nullif(trim(p_invoice->>'purchase_order_reference'),''),
    v_subtotal,v_discount,v_subtotal-v_discount,nullif(trim(p_invoice->>'notes'),''),
    coalesce(nullif(p_invoice->>'terms',''),v_settings.default_terms),
    coalesce(nullif(p_invoice->>'payment_instructions',''),v_settings.default_payment_instructions),p_actor_id
  ) returning id into v_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.invoice_items(invoice_id,service_id,description,service_period_start,service_period_end,quantity,unit_price,sort_order)
    values(v_id,nullif(v_item->>'service_id','')::uuid,trim(v_item->>'description'),
      nullif(v_item->>'service_period_start','')::date,nullif(v_item->>'service_period_end','')::date,
      (v_item->>'quantity')::numeric,(v_item->>'unit_price')::numeric,coalesce((v_item->>'sort_order')::int,0));
  end loop;
  return v_id;
end $$;

create or replace function public.create_invoice_from_contract(p_actor_id uuid, p_contract_id uuid, p_period_start date, p_period_end date)
returns uuid
language plpgsql

set search_path = public
as $$
declare v_contract client_contracts%rowtype; v_items jsonb; v_invoice jsonb; v_invoice_date date; v_template uuid;
begin
  if not public.is_superadmin(p_actor_id) then raise exception 'Superadmin access required'; end if;
  select * into v_contract from public.client_contracts where id=p_contract_id and status='active';
  if not found then raise exception 'Active contract not found'; end if;
  if p_period_end<p_period_start then raise exception 'Invalid service period'; end if;
  v_invoice_date := greatest(p_period_start, make_date(extract(year from p_period_start)::int,extract(month from p_period_start)::int,v_contract.billing_day));
  v_template := v_contract.template_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'service_id',service_id,'description',description,'quantity',quantity,'unit_price',unit_price,'sort_order',sort_order,
    'service_period_start',p_period_start,'service_period_end',p_period_end
  ) order by sort_order,id),'[]'::jsonb) into v_items from public.contract_items where contract_id=p_contract_id;
  v_invoice := jsonb_build_object(
    'contact_id',v_contract.contact_id,'contract_id',v_contract.id,'template_id',v_template,
    'invoice_date',v_invoice_date,'due_date',v_invoice_date+v_contract.due_days,
    'service_period_start',p_period_start,'service_period_end',p_period_end,'currency',v_contract.currency,
    'contract_reference',coalesce(v_contract.contract_number,v_contract.title),'discount',0,'notes',v_contract.notes
  );
  return public.create_invoice(p_actor_id,v_invoice,v_items);
end $$;

create or replace function public.update_draft_invoice(p_actor_id uuid, p_invoice_id uuid, p_invoice jsonb, p_items jsonb)
returns void
language plpgsql

set search_path = public
as $$
declare v_item jsonb; v_subtotal numeric(12,2):=0; v_discount numeric(12,2):=coalesce((p_invoice->>'discount')::numeric,0);
begin
  if not public.is_superadmin(p_actor_id) then raise exception 'Superadmin access required'; end if;
  if not exists(select 1 from public.invoices where id=p_invoice_id and status='draft' for update) then raise exception 'Only draft invoices can be edited'; end if;
  if p_invoice->>'contact_id' is null then raise exception 'Customer is required'; end if;
  if coalesce(jsonb_typeof(p_items),'null')<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Add at least one invoice item'; end if;
  if (p_invoice->>'due_date')::date < (p_invoice->>'invoice_date')::date then raise exception 'Due date cannot be before invoice date'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(trim(v_item->>'description'),'')='' then raise exception 'Item description is required'; end if;
    if coalesce((v_item->>'quantity')::numeric,0)<=0 then raise exception 'Item quantity must be greater than zero'; end if;
    if coalesce((v_item->>'unit_price')::numeric,-1)<0 then raise exception 'Item price cannot be negative'; end if;
    v_subtotal:=v_subtotal+(v_item->>'quantity')::numeric*(v_item->>'unit_price')::numeric;
  end loop;
  if v_discount<0 or v_discount>v_subtotal then raise exception 'Discount cannot exceed subtotal'; end if;
  update public.invoices set contact_id=(p_invoice->>'contact_id')::uuid,contract_id=nullif(p_invoice->>'contract_id','')::uuid,
    template_id=nullif(p_invoice->>'template_id','')::uuid,invoice_date=(p_invoice->>'invoice_date')::date,due_date=(p_invoice->>'due_date')::date,
    service_period_start=nullif(p_invoice->>'service_period_start','')::date,service_period_end=nullif(p_invoice->>'service_period_end','')::date,
    currency=coalesce(nullif(trim(p_invoice->>'currency'),''),'USD'),contract_reference=nullif(trim(p_invoice->>'contract_reference'),''),
    purchase_order_reference=nullif(trim(p_invoice->>'purchase_order_reference'),''),subtotal=v_subtotal,discount=v_discount,total_amount=v_subtotal-v_discount,
    notes=nullif(trim(p_invoice->>'notes'),''),terms=nullif(p_invoice->>'terms',''),payment_instructions=nullif(p_invoice->>'payment_instructions','')
  where id=p_invoice_id;
  delete from public.invoice_items where invoice_id=p_invoice_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.invoice_items(invoice_id,service_id,description,service_period_start,service_period_end,quantity,unit_price,sort_order)
    values(p_invoice_id,nullif(v_item->>'service_id','')::uuid,trim(v_item->>'description'),nullif(v_item->>'service_period_start','')::date,
      nullif(v_item->>'service_period_end','')::date,(v_item->>'quantity')::numeric,(v_item->>'unit_price')::numeric,coalesce((v_item->>'sort_order')::int,0));
  end loop;
end $$;

create or replace function public.admin_update_invoice(p_actor_id uuid, p_invoice_id uuid, p_invoice jsonb, p_items jsonb)
returns void
language plpgsql

set search_path = public
as $$
declare
  v_invoice public.invoices%rowtype;
  v_contact public.contacts%rowtype;
  v_template public.document_templates%rowtype;
  v_item jsonb;
  v_template_id uuid;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := coalesce((p_invoice->>'discount')::numeric, 0);
  v_total numeric(12,2);
  v_paid numeric(12,2);
begin
  if not public.is_superadmin(p_actor_id) then raise exception 'Superadmin access required'; end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if p_invoice->>'contact_id' is null then raise exception 'Customer is required'; end if;
  if coalesce(jsonb_typeof(p_items), 'null') <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one invoice item';
  end if;
  if (p_invoice->>'due_date')::date < (p_invoice->>'invoice_date')::date then
    raise exception 'Due date cannot be before invoice date';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(trim(v_item->>'description'), '') = '' then raise exception 'Item description is required'; end if;
    if coalesce((v_item->>'quantity')::numeric, 0) <= 0 then raise exception 'Item quantity must be greater than zero'; end if;
    if coalesce((v_item->>'unit_price')::numeric, -1) < 0 then raise exception 'Item price cannot be negative'; end if;
    v_subtotal := v_subtotal + (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric;
  end loop;

  if v_discount < 0 or v_discount > v_subtotal then raise exception 'Discount cannot exceed subtotal'; end if;
  v_total := v_subtotal - v_discount;
  select coalesce(sum(amount), 0) into v_paid from public.invoice_payments where invoice_id = p_invoice_id;
  if v_total < v_paid then
    raise exception 'Revised total cannot be below the amount already received (%)', v_paid;
  end if;

  v_template_id := nullif(p_invoice->>'template_id', '')::uuid;
  if v_template_id is null then
    select id into v_template_id from public.document_templates where document_type = 'invoice' and is_default limit 1;
  end if;
  select * into v_contact from public.contacts where id = (p_invoice->>'contact_id')::uuid;
  if not found then raise exception 'Customer not found'; end if;
  select * into v_template from public.document_templates where id = v_template_id;

  update public.invoices set
    contact_id = (p_invoice->>'contact_id')::uuid,
    contract_id = nullif(p_invoice->>'contract_id', '')::uuid,
    template_id = v_template_id,
    invoice_date = (p_invoice->>'invoice_date')::date,
    due_date = (p_invoice->>'due_date')::date,
    service_period_start = nullif(p_invoice->>'service_period_start', '')::date,
    service_period_end = nullif(p_invoice->>'service_period_end', '')::date,
    currency = coalesce(nullif(trim(p_invoice->>'currency'), ''), 'USD'),
    contract_reference = nullif(trim(p_invoice->>'contract_reference'), ''),
    purchase_order_reference = nullif(trim(p_invoice->>'purchase_order_reference'), ''),
    subtotal = v_subtotal,
    discount = v_discount,
    total_amount = v_total,
    notes = nullif(trim(p_invoice->>'notes'), ''),
    terms = nullif(p_invoice->>'terms', ''),
    payment_instructions = nullif(p_invoice->>'payment_instructions', ''),
    client_snapshot = case when v_invoice.finalized_at is not null then
      jsonb_build_object(
        'billingName', coalesce(v_contact.billing_name, v_contact.name),
        'contactName', v_contact.billing_contact,
        'address', v_contact.billing_address,
        'email', v_contact.email,
        'phone', v_contact.whatsapp
      )
      else v_invoice.client_snapshot end,
    template_snapshot = case when v_invoice.finalized_at is not null
      then coalesce(v_template.config, '{}'::jsonb)
      else v_invoice.template_snapshot end,
    status = case
      when v_invoice.status = 'draft' then 'draft'::public.invoice_status
      when v_invoice.status = 'cancelled' then 'cancelled'::public.invoice_status
      when v_paid >= v_total then 'paid'::public.invoice_status
      when v_paid > 0 then 'partially_paid'::public.invoice_status
      when (p_invoice->>'due_date')::date < current_date then 'overdue'::public.invoice_status
      else 'sent'::public.invoice_status
    end
  where id = p_invoice_id;

  delete from public.invoice_items where invoice_id = p_invoice_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.invoice_items(
      invoice_id, service_id, description, service_period_start,
      service_period_end, quantity, unit_price, sort_order
    ) values (
      p_invoice_id,
      nullif(v_item->>'service_id', '')::uuid,
      trim(v_item->>'description'),
      nullif(v_item->>'service_period_start', '')::date,
      nullif(v_item->>'service_period_end', '')::date,
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric,
      coalesce((v_item->>'sort_order')::int, 0)
    );
  end loop;
end $$;

create or replace function public.delete_invoice(p_actor_id uuid, p_invoice_id uuid)
returns void
language plpgsql

set search_path = public
as $$
begin
  if not public.is_superadmin(p_actor_id) then raise exception 'Superadmin access required'; end if;
  delete from public.invoices where id = p_invoice_id;
  if not found then raise exception 'Invoice not found'; end if;
end $$;

create or replace function public.cancel_invoice(p_actor_id uuid, p_invoice_id uuid)
returns void language plpgsql set search_path=public as $$
begin
  if not public.is_superadmin(p_actor_id) then raise exception 'Superadmin access required'; end if;
  if exists(select 1 from public.invoice_payments where invoice_id=p_invoice_id) then raise exception 'An invoice with payments cannot be cancelled'; end if;
  update public.invoices set status='cancelled' where id=p_invoice_id and status<>'paid';
  if not found then raise exception 'Invoice cannot be cancelled'; end if;
end $$;

create or replace function public.sync_invoice_status(p_invoice_id uuid)
returns void
language plpgsql

set search_path = public
as $$
declare v_invoice invoices%rowtype; v_paid numeric(12,2);
begin
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if not found or v_invoice.status='cancelled' then return; end if;
  select coalesce(sum(amount),0) into v_paid from public.invoice_payments where invoice_id=p_invoice_id;
  update public.invoices set status=case
    when v_invoice.status='draft' then 'draft'::invoice_status
    when v_paid>=v_invoice.total_amount then 'paid'::invoice_status
    when v_paid>0 then 'partially_paid'::invoice_status
    when v_invoice.due_date<current_date then 'overdue'::invoice_status
    else 'sent'::invoice_status end
  where id=p_invoice_id;
end $$;

create or replace function public.finalize_invoice(p_actor_id uuid, p_invoice_id uuid)
returns void
language plpgsql

set search_path = public
as $$
declare v_invoice invoices%rowtype; v_settings app_settings%rowtype; v_contact contacts%rowtype; v_template document_templates%rowtype;
begin
  if not public.is_superadmin(p_actor_id) then raise exception 'Superadmin access required'; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status<>'draft' then raise exception 'Only draft invoices can be finalized'; end if;
  select * into v_settings from public.app_settings where id=1;
  select * into v_contact from public.contacts where id=v_invoice.contact_id;
  select * into v_template from public.document_templates where id=v_invoice.template_id;
  update public.invoices set
    company_snapshot=jsonb_build_object('name',v_settings.company_name,'tagline',v_settings.company_tagline,'phone',v_settings.company_phone,'email',v_settings.company_email,'website',v_settings.company_website,'logoUrl',v_settings.logo_url,'stampUrl',v_settings.stamp_url,'footer',v_settings.default_footer,'cashEnabled',v_settings.cash_enabled,'omtEnabled',v_settings.omt_enabled,'omtRecipientName',v_settings.omt_recipient_name,'omtPhone',v_settings.omt_phone,'whishEnabled',v_settings.whish_enabled,'whishRecipientName',v_settings.whish_recipient_name,'whishPhone',v_settings.whish_phone),
    client_snapshot=jsonb_build_object('billingName',coalesce(v_contact.billing_name,v_contact.name),'contactName',v_contact.billing_contact,'address',v_contact.billing_address,'email',v_contact.email,'phone',v_contact.whatsapp),
    template_snapshot=coalesce(v_template.config,'{}'::jsonb),status='sent',finalized_at=now()
  where id=p_invoice_id;
  perform public.sync_invoice_status(p_invoice_id);
end $$;

create or replace function public.refresh_invoice_statuses(p_actor_id uuid)
returns integer
language plpgsql

set search_path = public
as $$
declare v_count integer;
begin
  if not public.is_superadmin(p_actor_id) then raise exception 'Superadmin access required'; end if;
  update public.invoices
  set status = 'overdue'
  where status = 'sent' and due_date < current_date
    and total_amount > coalesce((select sum(p.amount) from public.invoice_payments p where p.invoice_id=invoices.id),0);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.record_invoice_payment(p_actor_id uuid, p_invoice_id uuid,p_amount numeric,p_method invoice_payment_method,p_paid_on date,
  p_transaction_reference text default null,p_notes text default null
)
returns uuid
language plpgsql

set search_path = public
as $$
declare v_invoice invoices%rowtype; v_paid numeric(12,2); v_id uuid;
begin
  if not public.is_superadmin(p_actor_id) then raise exception 'Superadmin access required'; end if;
  if p_amount<=0 then raise exception 'Payment amount must be greater than zero'; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status in ('draft','cancelled') then raise exception 'Payments cannot be recorded for this invoice'; end if;
  select coalesce(sum(amount),0) into v_paid from public.invoice_payments where invoice_id=p_invoice_id;
  if p_amount>v_invoice.total_amount-v_paid then raise exception 'Payment exceeds the remaining balance'; end if;
  insert into public.invoice_payments(invoice_id,amount,payment_method,paid_on,transaction_reference,notes,received_by)
  values(p_invoice_id,p_amount,p_method,coalesce(p_paid_on,current_date),nullif(trim(p_transaction_reference),''),nullif(trim(p_notes),''),p_actor_id) returning id into v_id;
  perform public.sync_invoice_status(p_invoice_id);
  return v_id;
end $$;

create or replace function public.generate_monthly_invoices(p_actor_id uuid, p_month date default date_trunc('month',current_date)::date)
returns jsonb
language plpgsql

set search_path = public
as $$
declare v_contract client_contracts%rowtype; v_start date:=date_trunc('month',p_month)::date; v_end date; v_billing date; v_id uuid;
  v_created jsonb:='[]'::jsonb; v_skipped jsonb:='[]'::jsonb; v_errors jsonb:='[]'::jsonb;
begin
  if not public.is_superadmin(p_actor_id) then raise exception 'Superadmin access required'; end if;
  v_end := (v_start+interval '1 month-1 day')::date;
  for v_contract in select * from public.client_contracts where status='active' and start_date<=v_end and (end_date is null or end_date>=v_start) order by id loop
    v_billing := make_date(extract(year from v_start)::int,extract(month from v_start)::int,v_contract.billing_day);
    if v_billing>current_date then
      v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object('contractId',v_contract.id,'reason','Not due yet')); continue;
    end if;
    if exists(select 1 from public.invoices where contract_id=v_contract.id and service_period_start=v_start and service_period_end=v_end and status<>'cancelled') then
      v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object('contractId',v_contract.id,'reason','Invoice already exists')); continue;
    end if;
    begin
      v_id:=public.create_invoice_from_contract(p_actor_id,v_contract.id,v_start,v_end);
      v_created:=v_created||jsonb_build_array(jsonb_build_object('contractId',v_contract.id,'invoiceId',v_id));
    exception when others then
      v_errors:=v_errors||jsonb_build_array(jsonb_build_object('contractId',v_contract.id,'error',sqlerrm));
    end;
  end loop;
  return jsonb_build_object('created',v_created,'skipped',v_skipped,'errors',v_errors);
end $$;

