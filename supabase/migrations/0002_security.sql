-- =====================================================================
-- Role-based access control (RLS), customer portal RPCs, storage, realtime
-- =====================================================================

-- Current user's permission check. Permissions live on roles.permissions and
-- are edited from Settings → Roles & Permissions.
create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles pr
    join public.roles r on r.id = pr.role_id
    where pr.id = auth.uid() and pr.active and p = any(r.permissions)
  );
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

-- table -> permission module
do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      ('customers','customers'), ('activities','customers'), ('messages','customers'),
      ('pipeline_stages','leads'), ('leads','leads'),
      ('estimates','estimates'), ('estimate_items','estimates'), ('catalog_items','estimates'), ('estimate_templates','estimates'),
      ('projects','projects'), ('project_tasks','projects'), ('project_updates','projects'), ('change_orders','projects'),
      ('measurements','measurements'),
      ('events','calendar'),
      ('employees','team'), ('crews','team'), ('time_entries','team'),
      ('suppliers','inventory'), ('inventory_items','inventory'), ('purchase_orders','inventory'), ('stock_movements','inventory'),
      ('invoices','finance'), ('payments','finance'), ('expenses','finance'),
      ('files','documents')
    ) as t(tbl, module)
  loop
    execute format('alter table public.%I enable row level security', rec.tbl);
    execute format('create policy %I on public.%I for select using (public.has_perm(%L))', rec.tbl || '_read', rec.tbl, rec.module || '.view');
    execute format('create policy %I on public.%I for insert with check (public.has_perm(%L))', rec.tbl || '_insert', rec.tbl, rec.module || '.edit');
    execute format('create policy %I on public.%I for update using (public.has_perm(%L))', rec.tbl || '_update', rec.tbl, rec.module || '.edit');
    execute format('create policy %I on public.%I for delete using (public.has_perm(%L))', rec.tbl || '_delete', rec.tbl, rec.module || '.edit');
  end loop;
end $$;

-- Everyone on staff can read reference data; only admins change it.
alter table public.company_settings enable row level security;
create policy company_read on public.company_settings for select using (public.is_staff());
create policy company_write on public.company_settings for all using (public.has_perm('settings.manage')) with check (public.has_perm('settings.manage'));

alter table public.roles enable row level security;
create policy roles_read on public.roles for select using (public.is_staff());
create policy roles_write on public.roles for all using (public.has_perm('users.manage')) with check (public.has_perm('users.manage'));

alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select using (public.is_staff());
create policy profiles_self on public.profiles for update using (id = auth.uid());
create policy profiles_admin on public.profiles for all using (public.has_perm('users.manage')) with check (public.has_perm('users.manage'));

alter table public.automations enable row level security;
create policy automations_read on public.automations for select using (public.is_staff());
create policy automations_write on public.automations for all using (public.has_perm('automations.manage')) with check (public.has_perm('automations.manage'));

alter table public.automation_runs enable row level security;
create policy automation_runs_rw on public.automation_runs for all using (public.is_staff()) with check (public.is_staff());

alter table public.notifications enable row level security;
create policy notifications_rw on public.notifications for all using (public.is_staff()) with check (public.is_staff());

-- Audit log: readable by admins, written only by the trigger (security definer).
alter table public.audit_logs enable row level security;
create policy audit_read on public.audit_logs for select using (public.has_perm('settings.manage'));

-- ---------------------------------------------------------------------
-- Customer portal: anonymous access via unguessable customer.portal_token.
-- All portal access goes through these security-definer functions; the
-- anon role has no direct table access.
-- ---------------------------------------------------------------------
create or replace function public.portal_customer(p_token text) returns public.customers
language sql stable security definer set search_path = public as $$
  select * from public.customers where portal_token = p_token and length(p_token) >= 32;
$$;

create or replace function public.portal_get(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c public.customers;
begin
  c := public.portal_customer(p_token);
  if c.id is null then raise exception 'invalid portal link'; end if;
  return jsonb_build_object(
    'company', (select to_jsonb(s) - 'next_numbers' from public.company_settings s limit 1),
    'customer', to_jsonb(c) - 'notes' - 'owner_id',
    'estimates', coalesce((select jsonb_agg(to_jsonb(e)) from public.estimates e where e.customer_id = c.id and e.status <> 'draft'), '[]'),
    'estimate_items', coalesce((select jsonb_agg(to_jsonb(i) - 'material_cost' - 'labor_cost' - 'markup')
                                from public.estimate_items i join public.estimates e on e.id = i.estimate_id
                                where e.customer_id = c.id and e.status <> 'draft'), '[]'),
    'projects', coalesce((select jsonb_agg(to_jsonb(p) - 'estimated_cost' - 'notes') from public.projects p where p.customer_id = c.id), '[]'),
    'change_orders', coalesce((select jsonb_agg(to_jsonb(co)) from public.change_orders co join public.projects p on p.id = co.project_id
                               where p.customer_id = c.id and co.status <> 'draft'), '[]'),
    'invoices', coalesce((select jsonb_agg(to_jsonb(i)) from public.invoices i where i.customer_id = c.id and i.status <> 'draft'), '[]'),
    'payments', coalesce((select jsonb_agg(to_jsonb(pm)) from public.payments pm where pm.customer_id = c.id), '[]'),
    'updates', coalesce((select jsonb_agg(to_jsonb(u)) from public.project_updates u join public.projects p on p.id = u.project_id
                         where p.customer_id = c.id and u.visible_to_customer), '[]'),
    'files', coalesce((select jsonb_agg(to_jsonb(f)) from public.files f
                       where f.customer_id = c.id and (f.shared_with_customer or f.uploaded_by_customer)), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', ev.id, 'title', ev.title, 'type', ev.type, 'start', ev.start, 'end', ev."end", 'project_id', ev.project_id, 'status', ev.status))
                        from public.events ev where ev.customer_id = c.id and ev.status <> 'cancelled'
                          and ev.type in ('site_visit','estimate','installation','delivery','inspection')), '[]'),
    'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from public.messages m where m.customer_id = c.id), '[]')
  );
end $$;

create or replace function public.portal_respond_estimate(p_token text, p_estimate uuid, p_action text, p_name text, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.customers;
begin
  c := public.portal_customer(p_token);
  if c.id is null then raise exception 'invalid portal link'; end if;
  if p_action not in ('approved','rejected','changes_requested') then raise exception 'invalid action'; end if;
  if p_action = 'approved' and coalesce(trim(p_name), '') = '' then raise exception 'signature required'; end if;
  update public.estimates
     set status = p_action, responded_at = now(), signed_name = coalesce(p_name, ''), customer_response = coalesce(p_comment, '')
   where id = p_estimate and customer_id = c.id and status in ('sent','viewed','changes_requested');
  if not found then raise exception 'estimate not available'; end if;
  insert into public.activities (type, subject, body, customer_id, estimate_id)
  values ('portal', 'Estimate ' || replace(p_action, '_', ' ') || ' in portal', coalesce(p_comment, ''), c.id, p_estimate);
  insert into public.notifications (title, body, link, kind, role_keys)
  values ('Estimate ' || replace(p_action, '_', ' '), c.first_name || ' ' || c.last_name, '/estimates/' || p_estimate,
          case when p_action = 'approved' then 'success' else 'warning' end, '{owner,office_manager,sales_rep,estimator}');
end $$;

create or replace function public.portal_respond_change_order(p_token text, p_co uuid, p_action text, p_name text, p_comment text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.customers;
begin
  c := public.portal_customer(p_token);
  if c.id is null then raise exception 'invalid portal link'; end if;
  if p_action not in ('approved','rejected') then raise exception 'invalid action'; end if;
  update public.change_orders co
     set status = p_action, signed_name = coalesce(p_name,''), customer_comment = coalesce(p_comment,''),
         approved_at = case when p_action = 'approved' then now() else null end
    from public.projects p
   where co.id = p_co and p.id = co.project_id and p.customer_id = c.id and co.status = 'sent';
  if not found then raise exception 'change order not available'; end if;
  if p_action = 'approved' then
    -- fold the approved change into the contract (same math as src/lib/calc.ts changeOrderTotals)
    update public.projects p
       set contract_value = p.contract_value + t.amount,
           estimated_cost = p.estimated_cost + t.cost,
           end_date = case when p.end_date is not null then p.end_date + co.schedule_impact_days else null end
      from public.change_orders co,
           lateral (select coalesce(sum((case when i->>'action' = 'remove' then -1 else 1 end) * (i->>'quantity')::numeric * (i->>'unit_price')::numeric), 0) as amount,
                           coalesce(sum((case when i->>'action' = 'remove' then -1 else 1 end) * (i->>'quantity')::numeric * ((i->>'material_cost')::numeric + (i->>'labor_cost')::numeric)), 0) as cost
                      from jsonb_array_elements(co.items) i) t
     where co.id = p_co and p.id = co.project_id;
  end if;
  insert into public.notifications (title, body, link, kind, role_keys)
  values ('Change order ' || p_action, c.first_name || ' ' || c.last_name, '/change-orders', 'info', '{owner,office_manager,project_manager}');
end $$;

create or replace function public.portal_sign_contract(p_token text, p_project uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.customers;
begin
  c := public.portal_customer(p_token);
  if c.id is null or coalesce(trim(p_name),'') = '' then raise exception 'invalid request'; end if;
  update public.projects set signed_name = p_name, signed_at = now()
   where id = p_project and customer_id = c.id and signed_at is null;
end $$;

create or replace function public.portal_send_message(p_token text, p_project uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.customers;
begin
  c := public.portal_customer(p_token);
  if c.id is null or coalesce(trim(p_body),'') = '' then raise exception 'invalid request'; end if;
  insert into public.messages (customer_id, project_id, sender, body) values (c.id, p_project, 'customer', left(p_body, 4000));
end $$;

-- Payment stub: in production, Stripe Checkout + webhook (edge function) inserts
-- the payment with processor='stripe'. This records a portal payment intent.
create or replace function public.portal_pay_invoice(p_token text, p_invoice uuid, p_amount numeric, p_reference text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.customers; inv public.invoices;
begin
  c := public.portal_customer(p_token);
  select * into inv from public.invoices where id = p_invoice and customer_id = c.id and status in ('sent','partially_paid','overdue');
  if inv.id is null or p_amount <= 0 then raise exception 'invoice not payable'; end if;
  insert into public.payments (invoice_id, customer_id, project_id, amount, method, reference, processor)
  values (inv.id, c.id, inv.project_id, p_amount, 'card', coalesce(p_reference,''), 'portal');
end $$;

create or replace function public.portal_register_file(p_token text, p_project uuid, p_name text, p_mime text, p_size bigint, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.customers;
begin
  c := public.portal_customer(p_token);
  if c.id is null or p_path not like 'portal/' || p_token || '/%' then raise exception 'invalid request'; end if;
  insert into public.files (name, mime, size, category, customer_id, project_id, storage_path, uploaded_by_customer, shared_with_customer)
  values (p_name, p_mime, p_size, 'inspiration', c.id, p_project, p_path, true, true);
end $$;

grant execute on function public.portal_get, public.portal_respond_estimate, public.portal_respond_change_order,
  public.portal_sign_contract, public.portal_send_message, public.portal_pay_invoice, public.portal_register_file to anon, authenticated;
revoke execute on function public.portal_customer from anon;

-- ---------- storage ------------------------------------------------------
insert into storage.buckets (id, name, public) values ('files', 'files', false) on conflict do nothing;
create policy files_staff_read on storage.objects for select using (bucket_id = 'files' and public.has_perm('documents.view'));
create policy files_staff_write on storage.objects for insert with check (bucket_id = 'files' and public.is_staff());
create policy files_staff_delete on storage.objects for delete using (bucket_id = 'files' and public.has_perm('documents.edit'));
create policy files_portal_upload on storage.objects for insert to anon with check (
  bucket_id = 'files' and (storage.foldername(name))[1] = 'portal'
  and exists (select 1 from public.customers where portal_token = (storage.foldername(name))[2])
);

-- ---------- realtime -----------------------------------------------------
do $$
declare t text;
begin
  for t in select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
  loop
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
exception when undefined_object then
  raise notice 'supabase_realtime publication not found (not running on Supabase)';
end $$;

-- ---------- new auth user -> profile ----------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare default_role uuid;
begin
  -- first user becomes owner; everyone else starts as field employee until promoted
  if not exists (select 1 from public.profiles) then
    select id into default_role from public.roles where key = 'owner';
  else
    select id into default_role from public.roles where key = coalesce(new.raw_user_meta_data->>'role', 'field_employee');
  end if;
  insert into public.profiles (id, full_name, email, role_id)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), new.email, default_role);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- public website inquiry intake --------------------------------
-- Dedupes the customer by email/phone, creates the lead in the first pipeline
-- stage and notifies the sales team. Rate limiting belongs at the edge (e.g.
-- Cloudflare / Supabase Edge Function with captcha) in production.
create or replace function public.submit_inquiry(p_payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_name text := trim(coalesce(p_payload->>'name', ''));
  v_email text := lower(trim(coalesce(p_payload->>'email', '')));
  v_phone text := trim(coalesce(p_payload->>'phone', ''));
  v_cust uuid;
  v_lead uuid;
  v_stage uuid;
  v_services text[];
begin
  if v_name = '' or (v_email = '' and v_phone = '') then raise exception 'name and email or phone are required'; end if;
  if length(coalesce(p_payload->>'message', '')) > 5000 then raise exception 'message too long'; end if;
  select array(select jsonb_array_elements_text(coalesce(p_payload->'services', '[]'::jsonb))) into v_services;
  select id into v_cust from public.customers
   where (v_email <> '' and lower(email) = v_email)
      or (length(regexp_replace(v_phone, '\D', '', 'g')) >= 7 and regexp_replace(phone, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g'))
   limit 1;
  if v_cust is null then
    insert into public.customers (first_name, last_name, email, phone, billing_address, project_address, lead_source)
    values (split_part(v_name, ' ', 1), nullif(substr(v_name, length(split_part(v_name, ' ', 1)) + 2), ''), v_email, v_phone,
            coalesce(p_payload->>'address', ''), coalesce(p_payload->>'address', ''), coalesce(p_payload->>'source', 'Website'))
    returning id into v_cust;
  end if;
  select id into v_stage from public.pipeline_stages order by position limit 1;
  insert into public.leads (customer_id, title, services, stage_id, priority, source, estimated_value, follow_up_date, description, inquiry_payload)
  values (v_cust, coalesce(nullif(array_to_string(v_services, ' + '), ''), 'Website') || ' inquiry', v_services, v_stage, 'high',
          coalesce(p_payload->>'source', 'Website'), coalesce((p_payload->>'budget')::numeric, 0), current_date + 1,
          coalesce(p_payload->>'message', ''), p_payload)
  returning id into v_lead;
  insert into public.activities (type, subject, body, customer_id, lead_id) values ('email', 'Website inquiry received', coalesce(p_payload->>'message', ''), v_cust, v_lead);
  insert into public.notifications (title, body, link, kind, role_keys)
  values ('New website inquiry', v_name, '/leads/' || v_lead, 'info', '{owner,sales_rep,office_manager}');
  return v_lead;
end $$;
grant execute on function public.submit_inquiry to anon, authenticated;
