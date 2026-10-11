-- isolation.test.sql: SQL / pgTAP Verification for RLS Data Isolation
-- Verifies: NFR-07 (Data Isolation), D-01, Section 4.3

begin;
select plan(6);

-- 1. Create mock users
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'stranger@example.com');

insert into profiles (id, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'Alice'),
  ('22222222-2222-2222-2222-222222222222', 'Bob'),
  ('33333333-3333-3333-3333-333333333333', 'Stranger');

-- 2. Alice creates group G1 with Bob
insert into groups (id, name, currency, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Trip to Goa', 'INR', '11111111-1111-1111-1111-111111111111');

insert into group_members (id, group_id, user_id, display_name, role) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Alice', 'owner'),
  ('b2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Bob', 'member');

-- Add expense to G1
insert into expenses (id, group_id, title, amount_minor, currency, expense_date, split_type, created_by) values
  ('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Dinner', 2000, 'INR', '2026-10-10', 'equal', 'a1111111-1111-1111-1111-111111111111');

insert into expense_splits (expense_id, member_id, paid_minor, owed_minor) values
  ('e1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 2000, 1000),
  ('e1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222', 0, 1000);

-- 3. Switch auth context to Stranger
set local role authenticated;
set local "request.jwt.claim.sub" to '33333333-3333-3333-3333-333333333333';

-- Test 1: Stranger cannot see G1
select is_empty(
  'select * from groups where id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
  'Non-member cannot view foreign group'
);

-- Test 2: Stranger cannot see G1 expenses
select is_empty(
  'select * from expenses where group_id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
  'Non-member cannot view expenses of foreign group'
);

-- Test 3: Stranger cannot directly insert into expenses
select throws_ok(
  'insert into expenses (id, group_id, title, amount_minor, currency, expense_date, split_type, created_by)
   values (gen_random_uuid(), ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'', ''Hack'', 1000, ''INR'', current_date, ''equal'', gen_random_uuid())',
  '42501', -- insufficient privilege / RLS error
  'Direct client insert into expenses is rejected'
);

-- 4. Switch context to Bob (active member)
set local "request.jwt.claim.sub" to '22222222-2222-2222-2222-222222222222';

-- Test 4: Bob can see G1
select results_eq(
  'select count(*)::int from groups where id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
  array[1],
  'Active member Bob can view group G1'
);

-- Test 5: Bob can see G1 expenses
select results_eq(
  'select count(*)::int from expenses where group_id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
  array[1],
  'Active member Bob can view expenses of group G1'
);

-- 5. Bob leaves group
set local role postgres;
update group_members set left_at = now() where id = 'b2222222-2222-2222-2222-222222222222';

set local role authenticated;
set local "request.jwt.claim.sub" to '22222222-2222-2222-2222-222222222222';

-- Test 6: Bob (now left) loses read access to G1
select is_empty(
  'select * from groups where id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
  'Left member loses read privileges to group'
);

select * from finish();
rollback;
