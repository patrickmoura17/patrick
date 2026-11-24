-- =====================================================================
-- Stoneline OS — Construction CRM & Business Management
-- PostgreSQL / Supabase schema
-- Every table mirrors src/lib/types.ts.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- helpers --------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- company & access ----------------------------------------
create table public.company_settings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  tagline text not null default '',
  logo_url text,
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  address text not null default '',
  license_number text not null default '',
  tax_rate numeric(6,3) not null default 0 check (tax_rate >= 0),
  tax_materials_only boolean not null default false,
  default_markup numeric(6,2) not null default 35,
  default_payment_terms_days int not null default 15,
  default_payment_schedule jsonb not null default '[]',
  estimate_terms text not null default '',
  estimate_exclusions text not null default '',
  invoice_footer text not null default '',
  estimate_valid_days int not null default 30,
  brand_color text not null default '#b08a48',
  number_prefixes jsonb not null default '{}',
  next_numbers jsonb not null default '{}'
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  key text not null unique,
  name text not null,
  description text not null default '',
  permissions text[] not null default '{}',
  system boolean not null default false
);

-- profiles.id == auth.users.id
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  full_name text not null,
  email text not null unique,
  phone text not null default '',
  role_id uuid not null references public.roles(id),
  title text not null default '',
  color text not null default '#4f7190',
  active boolean not null default true
);

-- ---------- CRM --------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  first_name text not null,
  last_name text not null default '',
  company text not null default '',
  type text not null default 'Residential' check (type in ('Residential','Commercial','Builder','Contractor')),
  phone text not null default '',
  email text not null default '',
  billing_address text not null default '',
  project_address text not null default '',
  lead_source text not null default '',
  notes text not null default '',
  tags text[] not null default '{}',
  portal_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  owner_id uuid references public.profiles(id) on delete set null
);
create index customers_name_idx on public.customers (last_name, first_name);
create index customers_email_idx on public.customers (lower(email));

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  position int not null,
  color text not null default '#857d70',
  kind text not null default 'open' check (kind in ('open','won','lost')),
  probability int not null default 10 check (probability between 0 and 100)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  customer_id uuid not null references public.customers(id) on delete cascade,
  title text not null,
  services text[] not null default '{}',
  stage_id uuid not null references public.pipeline_stages(id),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  source text not null default '',
  assigned_to uuid references public.profiles(id) on delete set null,
  estimated_value numeric(12,2) not null default 0,
  follow_up_date date,
  lost_reason text not null default '',
  description text not null default '',
  status text not null default 'open' check (status in ('open','won','lost')),
  converted_at timestamptz,
  inquiry_payload jsonb
);
create index leads_stage_idx on public.leads (stage_id);
create index leads_customer_idx on public.leads (customer_id);
create index leads_assigned_idx on public.leads (assigned_to);

-- ---------- estimating -------------------------------------------------
create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  category text not null check (category in ('tile','flooring','cabinets','countertops','general')),
  section text not null default '',
  name text not null,
  description text not null default '',
  unit text not null check (unit in ('SQFT','LF','EA','HR','LS')),
  material_cost numeric(12,2) not null default 0,
  labor_cost numeric(12,2) not null default 0,
  markup numeric(6,2) not null default 0,
  active boolean not null default true
);

create table public.estimate_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  category text not null,
  description text not null default '',
  items jsonb not null default '[]',
  exclusions text not null default '',
  terms text not null default ''
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  number text not null unique,
  name text not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  estimate_id uuid, -- fk added after estimates
  lead_id uuid references public.leads(id) on delete set null,
  address text not null default '',
  manager_id uuid references public.profiles(id) on delete set null,
  crew_id uuid,
  member_ids uuid[] not null default '{}',
  services text[] not null default '{}',
  contract_value numeric(12,2) not null default 0,
  original_contract_value numeric(12,2) not null default 0,
  estimated_cost numeric(12,2) not null default 0,
  stage text not null default 'Contract Signed' check (stage in (
    'Contract Signed','Deposit Received','Materials Ordered','Materials Delivered','Ready to Schedule',
    'Scheduled','In Progress','Quality Inspection','Completed','Final Payment','Closed')),
  health text not null default 'on_track' check (health in ('on_track','at_risk','delayed','on_hold')),
  start_date date,
  end_date date,
  completed_at timestamptz,
  notes text not null default '',
  payment_schedule jsonb not null default '[]',
  signed_name text not null default '',
  signed_at timestamptz
);
create index projects_customer_idx on public.projects (customer_id);
create index projects_stage_idx on public.projects (stage);

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  number text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  lead_id uuid references public.leads(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  status text not null default 'draft' check (status in ('draft','sent','viewed','changes_requested','approved','rejected','expired')),
  issue_date date not null default current_date,
  valid_until date not null,
  tax_rate numeric(6,3) not null default 0,
  discount_type text not null default 'percent' check (discount_type in ('percent','amount')),
  discount_value numeric(12,2) not null default 0,
  intro text not null default '',
  customer_notes text not null default '',
  exclusions text not null default '',
  terms text not null default '',
  payment_schedule jsonb not null default '[]',
  timeline jsonb not null default '[]',
  sent_at timestamptz,
  responded_at timestamptz,
  customer_response text not null default '',
  signed_name text not null default '',
  created_by uuid references public.profiles(id) on delete set null
);
create index estimates_customer_idx on public.estimates (customer_id);
create index estimates_status_idx on public.estimates (status);
alter table public.projects add constraint projects_estimate_fk
  foreign key (estimate_id) references public.estimates(id) on delete set null;

create table public.estimate_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  category text not null,
  section text not null default '',
  name text not null,
  description text not null default '',
  quantity numeric(12,3) not null default 0 check (quantity >= 0),
  unit text not null check (unit in ('SQFT','LF','EA','HR','LS')),
  material_cost numeric(12,2) not null default 0,
  labor_cost numeric(12,2) not null default 0,
  markup numeric(6,2) not null default 0,
  unit_price numeric(12,2) not null default 0,
  price_override boolean not null default false,
  taxable boolean not null default true,
  optional boolean not null default false,
  position int not null default 0
);
create index estimate_items_estimate_idx on public.estimate_items (estimate_id, position);

-- ---------- team -------------------------------------------------------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  kind text not null default 'employee' check (kind in ('employee','subcontractor')),
  company text not null default '',
  position text not null default '',
  specialty text[] not null default '{}',
  phone text not null default '',
  email text not null default '',
  rate_type text not null default 'hourly' check (rate_type in ('hourly','daily','contract','per_sqft')),
  rate numeric(10,2) not null default 0,
  availability int[] not null default '{1,2,3,4,5}',
  insurance_expires date,
  license_number text not null default '',
  license_expires date,
  notes text not null default '',
  active boolean not null default true,
  profile_id uuid references public.profiles(id) on delete set null
);

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  color text not null default '#4f7190',
  lead_employee_id uuid references public.employees(id) on delete set null,
  member_ids uuid[] not null default '{}',
  specialty text not null default 'general',
  active boolean not null default true
);
alter table public.projects add constraint projects_crew_fk
  foreign key (crew_id) references public.crews(id) on delete set null;

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  employee_id uuid not null references public.employees(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  date date not null,
  hours numeric(6,2) not null default 0 check (hours >= 0),
  rate numeric(10,2) not null default 0,
  cost numeric(12,2) not null default 0,
  sqft_completed numeric(10,2) not null default 0,
  notes text not null default ''
);
create index time_entries_project_idx on public.time_entries (project_id);

-- ---------- projects ---------------------------------------------------
create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null default 'task' check (kind in ('task','checklist','punch')),
  title text not null,
  assignee_id uuid references public.profiles(id) on delete set null,
  due_date date,
  done boolean not null default false,
  done_at timestamptz,
  position int not null default 0
);
create index project_tasks_project_idx on public.project_tasks (project_id);

create table public.project_updates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  project_id uuid not null references public.projects(id) on delete cascade,
  date date not null default current_date,
  body text not null,
  user_id uuid references public.profiles(id) on delete set null,
  visible_to_customer boolean not null default false,
  file_ids uuid[] not null default '{}'
);

create table public.change_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  number text not null unique,
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  reason text not null default '',
  status text not null default 'draft' check (status in ('draft','sent','approved','rejected')),
  items jsonb not null default '[]',
  schedule_impact_days int not null default 0,
  sent_at timestamptz,
  approved_at timestamptz,
  signed_name text not null default '',
  customer_comment text not null default ''
);

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  project_id uuid references public.projects(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  room text not null,
  area_type text not null default 'floor',
  length numeric(10,2) not null default 0,
  width numeric(10,2) not null default 0,
  height numeric(10,2) not null default 0,
  sqft numeric(12,2) not null default 0,
  lf numeric(12,2) not null default 0,
  units int not null default 0,
  waste_percent numeric(5,2) not null default 10,
  material_spec text not null default '',
  install_requirements text not null default '',
  existing_conditions text not null default '',
  demolition text not null default '',
  notes text not null default '',
  shape jsonb not null default '[]',
  file_ids uuid[] not null default '{}',
  measured_by uuid references public.profiles(id) on delete set null,
  measured_on date,
  constraint measurements_parent check (project_id is not null or lead_id is not null or customer_id is not null)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  title text not null,
  type text not null check (type in ('site_visit','estimate','installation','delivery','inspection','reminder','meeting','time_off')),
  start timestamptz not null,
  "end" timestamptz not null,
  all_day boolean not null default false,
  project_id uuid references public.projects(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  crew_id uuid references public.crews(id) on delete set null,
  employee_ids uuid[] not null default '{}',
  location text not null default '',
  notes text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled','confirmed','completed','cancelled')),
  reminder_minutes int,
  constraint events_range check ("end" >= start)
);
create index events_start_idx on public.events (start);
create index events_crew_idx on public.events (crew_id, start);

-- ---------- materials & purchasing -------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  contact_name text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  categories text[] not null default '{}',
  account_number text not null default '',
  payment_terms text not null default '',
  notes text not null default ''
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  category text not null,
  sku text not null default '',
  manufacturer text not null default '',
  color text not null default '',
  finish text not null default '',
  size text not null default '',
  quantity numeric(12,2) not null default 0,
  unit text not null default 'EA',
  cost numeric(12,2) not null default 0,
  price numeric(12,2) not null default 0,
  location text not null default '',
  reorder_level numeric(12,2) not null default 0
);
create index inventory_items_sku_idx on public.inventory_items (sku);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  number text not null unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','ordered','partially_received','received','cancelled')),
  order_date date not null default current_date,
  expected_date date,
  delivered_date date,
  delivery_address text not null default '',
  items jsonb not null default '[]',
  shipping numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  notes text not null default ''
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  type text not null check (type in ('receive','allocate','return','damage','adjust')),
  quantity numeric(12,2) not null,
  unit_cost numeric(12,2) not null default 0,
  date date not null default current_date,
  notes text not null default ''
);

-- ---------- financials -------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  number text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,
  milestone_id text,
  kind text not null default 'standard' check (kind in ('deposit','progress','final','standard','change_order')),
  status text not null default 'draft' check (status in ('draft','sent','partially_paid','paid','overdue','void')),
  issue_date date not null default current_date,
  due_date date not null,
  items jsonb not null default '[]',
  tax_rate numeric(6,3) not null default 0,
  discount numeric(12,2) not null default 0,
  notes text not null default '',
  sent_at timestamptz,
  external_ref text -- QuickBooks invoice id
);
create index invoices_customer_idx on public.invoices (customer_id);
create index invoices_status_idx on public.invoices (status, due_date);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'check',
  date date not null default current_date,
  reference text not null default '',
  notes text not null default '',
  processor text not null default 'manual' check (processor in ('manual','stripe','portal')),
  external_ref text -- Stripe payment_intent id
);
create index payments_invoice_idx on public.payments (invoice_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  project_id uuid references public.projects(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  category text not null check (category in ('material','labor','subcontractor','equipment','disposal','permit','overhead','other')),
  description text not null,
  amount numeric(12,2) not null,
  date date not null default current_date,
  due_date date,
  status text not null default 'unpaid' check (status in ('unpaid','paid')),
  paid_date date,
  reference text not null default ''
);
create index expenses_project_idx on public.expenses (project_id);

-- ---------- documents, comms -------------------------------------------
create table public.files (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  mime text not null default 'application/octet-stream',
  size bigint not null default 0,
  category text not null default 'other',
  photo_phase text check (photo_phase in ('before','progress','after')),
  customer_id uuid references public.customers(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  estimate_id uuid references public.estimates(id) on delete set null,
  measurement_id uuid references public.measurements(id) on delete set null,
  storage_path text not null,
  url text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_by_customer boolean not null default false,
  shared_with_customer boolean not null default false,
  notes text not null default ''
);
create index files_project_idx on public.files (project_id);
create index files_customer_idx on public.files (customer_id);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  type text not null,
  subject text not null,
  body text not null default '',
  customer_id uuid references public.customers(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  estimate_id uuid references public.estimates(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null
);
create index activities_customer_idx on public.activities (customer_id, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  customer_id uuid not null references public.customers(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  sender text not null check (sender in ('customer','staff')),
  user_id uuid references public.profiles(id) on delete set null,
  body text not null,
  read boolean not null default false
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  user_id uuid references public.profiles(id) on delete cascade,
  role_keys text[] not null default '{}',
  title text not null,
  body text not null default '',
  link text not null default '',
  read_by uuid[] not null default '{}',
  kind text not null default 'info'
);

-- ---------- automation & audit ----------------------------------------
create table public.automations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  description text not null default '',
  trigger text not null,
  conditions jsonb not null default '[]',
  actions jsonb not null default '[]',
  active boolean not null default true,
  run_count int not null default 0,
  last_run_at timestamptz
);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  automation_id uuid not null references public.automations(id) on delete cascade,
  trigger text not null,
  record_id uuid,
  status text not null check (status in ('success','skipped','error')),
  detail text not null default ''
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert','update','delete')),
  user_id uuid,
  summary text not null default '',
  changes jsonb
);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id, created_at desc);

-- ---------- updated_at triggers ----------------------------------------
do $$
declare t text;
begin
  for t in select table_name from information_schema.tables
           where table_schema = 'public' and table_type = 'BASE TABLE'
  loop
    execute format('create trigger %I_updated before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------- server-side audit trail (tamper-proof) ---------------------
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  diff jsonb := '{}';
  k text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      if k <> 'updated_at' and (to_jsonb(new)->k) is distinct from (to_jsonb(old)->k) then
        diff := diff || jsonb_build_object(k, jsonb_build_object('from', to_jsonb(old)->k, 'to', to_jsonb(new)->k));
      end if;
    end loop;
    if diff = '{}' then return new; end if;
  end if;
  insert into public.audit_logs (table_name, record_id, action, user_id, summary, changes)
  values (tg_table_name,
          coalesce(new.id, old.id),
          lower(tg_op),
          auth.uid(),
          lower(tg_op) || ' ' || tg_table_name,
          case when tg_op = 'UPDATE' then diff else null end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['customers','leads','estimates','projects','change_orders','invoices','payments',
                           'expenses','purchase_orders','profiles','roles','company_settings','automations']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
  end loop;
end $$;
