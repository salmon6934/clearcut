-- rpc_core.test.sql: SQL Integration Tests for Core RPCs
-- Tests: create_group_v1, add_placeholder_v1, upsert_expense_v1, upsert_settlement_v1, pull_changes_v1

begin;
select plan(7);

-- 1. Setup mock user
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.local');

insert into profiles (id, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'Alice');

set local role authenticated;
set local "request.jwt.claim.sub" to '11111111-1111-1111-1111-111111111111';

-- Test 1: Create Group RPC
select is(
  (create_group_v1(
    jsonb_build_object('id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'name', 'Trip to Paris', 'currency', 'EUR'),
    'a1111111-1111-1111-1111-111111111111',
    'm1111111-1111-1111-1111-111111111111'
  )->'replayed')::boolean,
  false,
  'create_group_v1 successfully creates a new group and owner member'
);

-- Test 2: Idempotent Replay on Create Group
select is(
  (create_group_v1(
    jsonb_build_object('id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'name', 'Trip to Paris', 'currency', 'EUR'),
    'a1111111-1111-1111-1111-111111111111',
    'm1111111-1111-1111-1111-111111111111'
  )->'replayed')::boolean,
  true,
  'create_group_v1 replaying same group ID returns replayed: true'
);

-- Test 3: Add Placeholder Member
select is(
  (add_placeholder_v1(
    jsonb_build_object('id', 'b2222222-2222-2222-2222-222222222222', 'group_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'display_name', 'Bob'),
    'm2222222-2222-2222-2222-222222222222'
  )->'member'->>'display_name'),
  'Bob',
  'add_placeholder_v1 adds a member with null user_id'
);

-- Test 4: Upsert Expense enforcing I2
select is(
  (upsert_expense_v1(
    jsonb_build_object(
      'id', 'e1111111-1111-1111-1111-111111111111',
      'group_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'title', 'Museum Tickets',
      'amount_minor', 4000,
      'currency', 'EUR',
      'expense_date', '2026-10-10',
      'split_type', 'equal',
      'splits', jsonb_build_array(
        jsonb_build_object('member_id', 'a1111111-1111-1111-1111-111111111111', 'paid_minor', 4000, 'owed_minor', 2000),
        jsonb_build_object('member_id', 'b2222222-2222-2222-2222-222222222222', 'paid_minor', 0, 'owed_minor', 2000)
      )
    ),
    null,
    'm3333333-3333-3333-3333-333333333333'
  )->'expense'->>'title'),
  'Museum Tickets',
  'upsert_expense_v1 successfully inserts valid expense'
);

-- Test 5: Verify Group Balances in SQL
select results_eq(
  'select net_minor from group_balances(''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'') where member_id = ''a1111111-1111-1111-1111-111111111111''',
  array[2000::bigint],
  'group_balances correctly computes Alice net balance as +2000'
);

-- Test 6: Upsert Settlement
select is(
  (upsert_settlement_v1(
    jsonb_build_object(
      'id', 's1111111-1111-1111-1111-111111111111',
      'group_id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'from_member_id', 'b2222222-2222-2222-2222-222222222222',
      'to_member_id', 'a1111111-1111-1111-1111-111111111111',
      'amount_minor', 2000,
      'method', 'cash'
    ),
    'm4444444-4444-4444-4444-444444444444'
  )->'settlement'->>'amount_minor')::bigint,
  2000::bigint,
  'upsert_settlement_v1 records settlement payment'
);

-- Test 7: Verify Balances are settled up (0 net)
select results_eq(
  'select net_minor from group_balances(''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'') where member_id = ''a1111111-1111-1111-1111-111111111111''',
  array[0::bigint],
  'group_balances reflects settled balance of 0'
);

select * from finish();
rollback;
