-- Countertop drawing & quoting (step-by-step CAD-style quote builder).
create table public.countertop_quotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  name text not null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  estimate_id uuid references public.estimates(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','sent','accepted')),
  step int not null default 1 check (step between 1 and 6),
  counters jsonb not null default '[]',   -- parametric shapes: kind, params, rotation, edges, corners
  cutouts jsonb not null default '[]',    -- sinks / cooktops / faucet holes
  texts jsonb not null default '[]',
  material jsonb not null default '{"catalog_item_id":null,"color":"","thickness":"3cm"}',
  edge_profile text not null default 'eased',
  splash_height numeric(6,2) not null default 18,
  options jsonb not null default '{"tearout":false,"waste_percent":0}',
  rates_override jsonb not null default '{}',
  revisions jsonb not null default '[]',
  notes text not null default ''
);
create index countertop_quotes_customer_idx on public.countertop_quotes (customer_id);

create trigger countertop_quotes_updated before update on public.countertop_quotes for each row execute function public.set_updated_at();
-- drawing edits autosave continuously, so only creation and deletion are audited
create trigger countertop_quotes_audit after insert or delete on public.countertop_quotes for each row execute function public.audit_row();

alter table public.countertop_quotes enable row level security;
create policy countertop_quotes_read on public.countertop_quotes for select using (public.has_perm('estimates.view'));
create policy countertop_quotes_insert on public.countertop_quotes for insert with check (public.has_perm('estimates.edit'));
create policy countertop_quotes_update on public.countertop_quotes for update using (public.has_perm('estimates.edit'));
create policy countertop_quotes_delete on public.countertop_quotes for delete using (public.has_perm('estimates.edit'));

do $$ begin
  execute 'alter publication supabase_realtime add table public.countertop_quotes';
exception when undefined_object then null;
end $$;
