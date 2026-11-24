-- Smoke test for the Supabase schema: run after the stub + migrations.
-- Every check raises an exception on failure.
\set ON_ERROR_STOP 1
begin;
-- first auth user becomes owner; second user gets field_employee
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.example', '{"full_name":"Owner"}'),
  ('22222222-2222-2222-2222-222222222222', 'field@test.example', '{"full_name":"Field"}');
do $$ begin
  assert (select r.key from profiles p join roles r on r.id = p.role_id where p.email = 'owner@test.example') = 'owner', 'first user should be owner';
  assert (select r.key from profiles p join roles r on r.id = p.role_id where p.email = 'field@test.example') = 'field_employee', 'second user should be field employee';
end $$;

-- RLS: field employee cannot read customers; owner can
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
insert into customers (id, first_name, last_name, email, phone) values ('33333333-3333-3333-3333-333333333333', 'Pat', 'Lee', 'pat@x.example', '5125551234');
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin assert (select count(*) from customers) = 0, 'field employee must not see customers'; end $$;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin assert (select count(*) from customers) = 1, 'owner must see customers'; end $$;
reset role;

-- audit trigger records insert + update diff
update customers set phone = '5125550000' where id = '33333333-3333-3333-3333-333333333333';
do $$ begin
  assert (select count(*) from audit_logs where record_id = '33333333-3333-3333-3333-333333333333') = 2, 'audit insert+update expected';
  assert (select changes ? 'phone' from audit_logs where record_id = '33333333-3333-3333-3333-333333333333' and action = 'update'), 'audit diff should include phone';
end $$;

-- estimate + portal approval
insert into leads (id, customer_id, title, stage_id) select '44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'Bath', id from pipeline_stages order by position limit 1;
insert into estimates (id, number, customer_id, lead_id, title, status, valid_until) values ('55555555-5555-5555-5555-555555555555', 'EST-1', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444', 'Bath', 'sent', current_date + 30);
insert into estimate_items (estimate_id, category, name, quantity, unit, material_cost, labor_cost, markup, unit_price) values ('55555555-5555-5555-5555-555555555555', 'tile', 'Floor tile', 100, 'SQFT', 2, 5, 40, 9.8);
set local role anon;
do $$
declare tok text; j jsonb;
begin
  -- anon has no direct table access
  begin perform 1 from customers; raise exception 'anon read customers'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$
declare tok text := (select portal_token from customers where id = '33333333-3333-3333-3333-333333333333'); j jsonb;
begin
  j := portal_get(tok);
  assert jsonb_array_length(j->'estimates') = 1, 'portal shows sent estimate';
  assert not ((j->'estimate_items'->0) ? 'material_cost'), 'portal must hide internal costs';
  perform portal_respond_estimate(tok, '55555555-5555-5555-5555-555555555555', 'approved', 'Pat Lee', '');
  assert (select status from estimates where id = '55555555-5555-5555-5555-555555555555') = 'approved', 'estimate approved';
  begin perform portal_get('bogus-token-bogus-token-bogus-token-xx'); raise exception 'bad token accepted'; exception when raise_exception then null; end;
end $$;

-- change order approval folds into contract
insert into projects (id, number, name, customer_id, contract_value, original_contract_value, estimated_cost) values ('66666666-6666-6666-6666-666666666666', 'PRJ-1', 'Bath', '33333333-3333-3333-3333-333333333333', 1000, 1000, 600);
insert into change_orders (id, number, project_id, title, status, items) values ('77777777-7777-7777-7777-777777777777', 'CO-1', '66666666-6666-6666-6666-666666666666', 'Add niche', 'sent',
  '[{"id":"a","action":"add","description":"Niche","quantity":1,"unit":"EA","unit_price":300,"material_cost":50,"labor_cost":100},{"id":"b","action":"remove","description":"Trim","quantity":10,"unit":"LF","unit_price":10,"material_cost":3,"labor_cost":2}]');
do $$
declare tok text := (select portal_token from customers where id = '33333333-3333-3333-3333-333333333333');
begin
  perform portal_respond_change_order(tok, '77777777-7777-7777-7777-777777777777', 'approved', 'Pat Lee', '');
  assert (select contract_value from projects where id = '66666666-6666-6666-6666-666666666666') = 1200, 'contract 1000 + 300 - 100';
  assert (select estimated_cost from projects where id = '66666666-6666-6666-6666-666666666666') = 700, 'cost 600 + 150 - 50';
end $$;

-- duplicate project for same estimate is rejected
update projects set estimate_id = '55555555-5555-5555-5555-555555555555' where id = '66666666-6666-6666-6666-666666666666';
do $$ begin
  begin
    insert into projects (number, name, customer_id, estimate_id) values ('PRJ-2', 'dup', '33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555');
    raise exception 'duplicate project allowed';
  exception when unique_violation then null; end;
end $$;

-- website inquiry dedupes by email
do $$
declare l1 uuid; l2 uuid;
begin
  l1 := submit_inquiry('{"name":"Pat Lee","email":"PAT@x.example","services":["tile","flooring"],"message":"hi"}');
  l2 := submit_inquiry('{"name":"New Person","phone":"(512) 555-9999","services":[]}');
  assert (select customer_id from leads where id = l1) = '33333333-3333-3333-3333-333333333333', 'inquiry dedupes existing customer';
  assert (select count(*) from customers) = 2, 'new inquiry creates one customer';
  assert (select title from leads where id = l1) = 'tile + flooring inquiry', 'lead title from services';
end $$;
select 'ALL SQL SMOKE CHECKS PASSED' as result;
rollback;
