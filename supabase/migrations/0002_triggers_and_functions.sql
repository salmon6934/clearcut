-- 0002_triggers_and_functions.sql: Triggers, Invariant Constraints & Authoritative SQL Balances
-- Specification Baseline: Technical Specification v1.0 Section 4.3

-- 1. Timestamp trigger function (uses clock_timestamp() for commit-time sequencing)
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

-- Attach touch_updated_at triggers
drop trigger if exists trg_profiles_touch_updated on profiles;
create trigger trg_profiles_touch_updated
  before insert or update on profiles
  for each row execute function touch_updated_at();

drop trigger if exists trg_groups_touch_updated on groups;
create trigger trg_groups_touch_updated
  before insert or update on groups
  for each row execute function touch_updated_at();

drop trigger if exists trg_group_members_touch_updated on group_members;
create trigger trg_group_members_touch_updated
  before insert or update on group_members
  for each row execute function touch_updated_at();

drop trigger if exists trg_expenses_touch_updated on expenses;
create trigger trg_expenses_touch_updated
  before insert or update on expenses
  for each row execute function touch_updated_at();

drop trigger if exists trg_settlements_touch_updated on settlements;
create trigger trg_settlements_touch_updated
  before insert or update on settlements
  for each row execute function touch_updated_at();

-- 2. Helper function: is_member(g uuid)
create or replace function is_member(g uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from group_members
    where group_id = g and user_id = auth.uid() and left_at is null
  );
$$;

-- 3. Deferred Invariant I2 Constraint: sum(paid) = amount = sum(owed)
create or replace function check_expense_conservation()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_expense_id uuid;
  v_amount bigint;
  v_deleted timestamptz;
  v_paid bigint;
  v_owed bigint;
begin
  if tg_table_name = 'expenses' then
    v_expense_id := coalesce(new.id, old.id);
  else
    v_expense_id := coalesce(new.expense_id, old.expense_id);
  end if;

  select amount_minor, deleted_at into v_amount, v_deleted
  from expenses where id = v_expense_id;

  -- If expense does not exist or is soft-deleted, bypass check
  if not found or v_deleted is not null then
    return coalesce(new, old);
  end if;

  select coalesce(sum(paid_minor), 0), coalesce(sum(owed_minor), 0)
  into v_paid, v_owed
  from expense_splits where expense_id = v_expense_id;

  if v_paid <> v_amount or v_owed <> v_amount then
    raise exception 'EXPENSE_INVALID_SPLIT: Invariant I2 violated for expense %. Expected amount %, got paid % and owed %',
      v_expense_id, v_amount, v_paid, v_owed
      using errcode = 'PT400';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_expenses_conservation on expenses;
create constraint trigger trg_expenses_conservation
  after insert or update on expenses
  deferrable initially deferred
  for each row execute function check_expense_conservation();

drop trigger if exists trg_expense_splits_conservation on expense_splits;
create constraint trigger trg_expense_splits_conservation
  after insert or update or delete on expense_splits
  deferrable initially deferred
  for each row execute function check_expense_conservation();

-- 4. Authoritative SQL Balance View/Function: group_balances(p_group uuid)
-- Positive net (+) = Creditor (is owed money)
-- Negative net (-) = Debtor (owes money)
create or replace function group_balances(p_group uuid)
returns table(member_id uuid, net_minor bigint) language sql stable security definer
set search_path = public as $$
  with e as (
    select s.member_id, sum(s.paid_minor - s.owed_minor) as n
    from expense_splits s
    join expenses x on x.id = s.expense_id
    where x.group_id = p_group and x.deleted_at is null
    group by s.member_id
  ),
  st as (
    -- Sent settlement increases member's net balance (paid back debt)
    select from_member_id as m, sum(amount_minor) as n
    from settlements
    where group_id = p_group and deleted_at is null
    group by from_member_id
    union all
    -- Received settlement decreases member's net balance (received payment)
    select to_member_id as m, -sum(amount_minor) as n
    from settlements
    where group_id = p_group and deleted_at is null
    group by to_member_id
  )
  select
    gm.id as member_id,
    coalesce(e.n, 0) + coalesce((select sum(n) from st where st.m = gm.id), 0) as net_minor
  from group_members gm
  left join e on e.member_id = gm.id
  where gm.group_id = p_group and is_member(p_group);
$$;
