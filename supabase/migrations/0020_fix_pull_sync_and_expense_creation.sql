-- 0020_fix_pull_sync_and_expense_creation.sql
-- 1. Fixes pull_changes_v1 missing table alias 'c' in FROM counted clause
-- 2. Fixes upsert_expense_v1 created_by resolution (handles user_id vs member_id)
-- 3. Ensures expense_splits respects check constraint (paid_minor > 0 or owed_minor > 0)

-- 1. Updated pull_changes_v1 with proper alias 'counted c'
create or replace function pull_changes_v1(
  p_since jsonb,
  p_limit int default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_limit int := least(greatest(coalesce(p_limit, 500), 1), 1000);
  v_since_groups timestamptz;
  v_since_members timestamptz;
  v_since_expenses timestamptz;
  v_since_settlements timestamptz;

  v_res_groups jsonb;
  v_res_members jsonb;
  v_res_expenses jsonb;
  v_res_settlements jsonb;
  v_active_group_ids jsonb;

  v_has_more_groups boolean := false;
  v_has_more_members boolean := false;
  v_has_more_expenses boolean := false;
  v_has_more_settlements boolean := false;
  v_server_time timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  v_since_groups := coalesce((p_since->>'groups')::timestamptz, '-infinity'::timestamptz);
  v_since_members := coalesce((p_since->>'members')::timestamptz, '-infinity'::timestamptz);
  v_since_expenses := coalesce((p_since->>'expenses')::timestamptz, '-infinity'::timestamptz);
  v_since_settlements := coalesce((p_since->>'settlements')::timestamptz, '-infinity'::timestamptz);

  -- Collect active group IDs currently accessible to this user
  select coalesce(jsonb_agg(g.id), '[]'::jsonb)
  into v_active_group_ids
  from groups g
  where is_member(g.id);

  -- Groups
  with user_groups as (
    select g.*
    from groups g
    where is_member(g.id) and g.updated_at > v_since_groups
    order by g.updated_at asc
    limit v_limit + 1
  ),
  counted as (
    select *, (row_number() over () > v_limit) as is_extra from user_groups
  )
  select
    coalesce(jsonb_agg((to_jsonb(c) - 'is_extra')) filter (where not is_extra), '[]'::jsonb),
    coalesce(bool_or(is_extra), false)
  into v_res_groups, v_has_more_groups
  from counted c;

  -- Members
  with member_rows as (
    select gm.*
    from group_members gm
    where is_member(gm.group_id) and gm.updated_at > v_since_members
    order by gm.updated_at asc
    limit v_limit + 1
  ),
  counted as (
    select *, (row_number() over () > v_limit) as is_extra from member_rows
  )
  select
    coalesce(jsonb_agg((to_jsonb(c) - 'is_extra')) filter (where not is_extra), '[]'::jsonb),
    coalesce(bool_or(is_extra), false)
  into v_res_members, v_has_more_members
  from counted c;

  -- Expenses with nested splits
  with expense_rows as (
    select
      e.*,
      coalesce((
        select jsonb_agg(row_to_json(s))
        from expense_splits s
        where s.expense_id = e.id
      ), '[]'::jsonb) as splits
    from expenses e
    where is_member(e.group_id) and e.updated_at > v_since_expenses
    order by e.updated_at asc
    limit v_limit + 1
  ),
  counted as (
    select *, (row_number() over () > v_limit) as is_extra from expense_rows
  )
  select
    coalesce(jsonb_agg((to_jsonb(c) - 'is_extra')) filter (where not is_extra), '[]'::jsonb),
    coalesce(bool_or(is_extra), false)
  into v_res_expenses, v_has_more_expenses
  from counted c;

  -- Settlements
  with settlement_rows as (
    select st.*
    from settlements st
    where is_member(st.group_id) and st.updated_at > v_since_settlements
    order by st.updated_at asc
    limit v_limit + 1
  ),
  counted as (
    select *, (row_number() over () > v_limit) as is_extra from settlement_rows
  )
  select
    coalesce(jsonb_agg((to_jsonb(c) - 'is_extra')) filter (where not is_extra), '[]'::jsonb),
    coalesce(bool_or(is_extra), false)
  into v_res_settlements, v_has_more_settlements
  from counted c;

  return jsonb_build_object(
    'groups', v_res_groups,
    'members', v_res_members,
    'expenses', v_res_expenses,
    'settlements', v_res_settlements,
    'active_group_ids', v_active_group_ids,
    'has_more', (v_has_more_groups or v_has_more_members or v_has_more_expenses or v_has_more_settlements),
    'server_time', v_server_time
  );
end;
$$;

-- 2. Updated upsert_expense_v1 with resilient created_by resolution & splits check
create or replace function upsert_expense_v1(
  p_expense jsonb,
  p_base_version int,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_expense_id uuid;
  v_group_id uuid;
  v_title text;
  v_notes text;
  v_amount_minor bigint;
  v_currency text;
  v_category text;
  v_expense_date date;
  v_split_type text;
  v_created_by uuid;
  v_group record;
  v_existing_expense record;
  v_saved_expense record;
  v_saved_splits jsonb;
  v_split record;
  v_total_paid bigint := 0;
  v_total_owed bigint := 0;
  v_splits_arr jsonb;
  v_actor_member_id uuid;
  v_is_new boolean := false;
  v_new_version int;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  v_expense_id := (p_expense->>'id')::uuid;
  v_group_id := (p_expense->>'group_id')::uuid;
  v_title := trim(p_expense->>'title');
  v_notes := p_expense->>'notes';
  v_amount_minor := (p_expense->>'amount_minor')::bigint;
  v_currency := upper(p_expense->>'currency');
  v_category := p_expense->>'category';
  v_expense_date := (p_expense->>'expense_date')::date;
  v_split_type := p_expense->>'split_type';
  v_created_by := (p_expense->>'created_by')::uuid;
  v_splits_arr := p_expense->'splits';

  -- Verify group membership
  if not is_member(v_group_id) then
    raise exception 'FORBIDDEN: Must be an active group member' using errcode = 'PT403';
  end if;

  -- Verify group currency
  select * into v_group from groups where id = v_group_id and deleted_at is null;
  if not found then
    raise exception 'GROUP_NOT_FOUND' using errcode = 'PT404';
  end if;

  if v_group.currency <> v_currency then
    raise exception 'EXPENSE_CURRENCY_MISMATCH: Expense currency does not match group' using errcode = 'PT400';
  end if;

  -- Validate amount bounds
  if v_amount_minor <= 0 or v_amount_minor > 10000000000 then
    raise exception 'EXPENSE_INVALID_AMOUNT: Invalid amount' using errcode = 'PT400';
  end if;

  -- Actor member id
  select id into v_actor_member_id from group_members
  where group_id = v_group_id and user_id = v_user_id and left_at is null
  limit 1;

  -- Resilient resolution of created_by:
  -- If v_created_by is not already a valid member_id in this group, check if it was passed as a user_id
  if v_created_by is null or not exists (select 1 from group_members where id = v_created_by and group_id = v_group_id) then
    select id into v_created_by from group_members
    where group_id = v_group_id and user_id = (p_expense->>'created_by')::uuid and left_at is null
    limit 1;

    if v_created_by is null then
      v_created_by := v_actor_member_id;
    end if;
  end if;

  -- Check existing expense for idempotency or conflict
  select * into v_existing_expense from expenses where id = v_expense_id;
  if found then
    -- Idempotency check: if last applied mutation is identical, replay stored aggregate
    if v_existing_expense.client_mutation_id = p_mutation_id then
      select jsonb_agg(row_to_json(s)) into v_saved_splits
      from expense_splits s where s.expense_id = v_expense_id;
      return jsonb_build_object(
        'expense', row_to_json(v_existing_expense),
        'splits', coalesce(v_saved_splits, '[]'::jsonb),
        'replayed', true
      );
    end if;

    -- Concurrency check: optimistic locking on version
    if p_base_version is not null and v_existing_expense.version <> p_base_version then
      raise exception 'EXPENSE_CONFLICT: Optimistic lock mismatch'
        using errcode = 'PT409',
        detail = row_to_json(v_existing_expense)::text;
    end if;

    v_new_version := v_existing_expense.version + 1;
  else
    v_is_new := true;
    v_new_version := 1;
  end if;

  -- Verify splits and sum conservation Invariant I2
  if jsonb_array_length(v_splits_arr) = 0 then
    raise exception 'EXPENSE_INVALID_SPLIT: At least one split required' using errcode = 'PT400';
  end if;

  for v_split in select * from jsonb_to_recordset(v_splits_arr) as (
    member_id uuid,
    paid_minor bigint,
    owed_minor bigint,
    split_value numeric
  ) loop
    -- Verify member exists in group
    if not exists (select 1 from group_members where id = v_split.member_id and group_id = v_group_id) then
      raise exception 'MEMBER_NOT_IN_GROUP: Split member % not in group', v_split.member_id using errcode = 'PT400';
    end if;

    if v_split.paid_minor < 0 or v_split.owed_minor < 0 then
      raise exception 'EXPENSE_INVALID_SPLIT: Negative split amounts prohibited' using errcode = 'PT400';
    end if;

    v_total_paid := v_total_paid + v_split.paid_minor;
    v_total_owed := v_total_owed + v_split.owed_minor;
  end loop;

  if v_total_paid <> v_amount_minor or v_total_owed <> v_amount_minor then
    raise exception 'EXPENSE_INVALID_SPLIT: Invariant I2 violated' using errcode = 'PT400';
  end if;

  -- Upsert expense
  insert into expenses (
    id, group_id, title, notes, amount_minor, currency, category, expense_date,
    split_type, created_by, version, client_mutation_id, deleted_at, updated_at
  ) values (
    v_expense_id, v_group_id, v_title, v_notes, v_amount_minor, v_currency, v_category, v_expense_date,
    v_split_type, v_created_by, v_new_version, p_mutation_id, null, clock_timestamp()
  )
  on conflict (id) do update set
    title = excluded.title,
    notes = excluded.notes,
    amount_minor = excluded.amount_minor,
    category = excluded.category,
    expense_date = excluded.expense_date,
    split_type = excluded.split_type,
    version = v_new_version,
    client_mutation_id = excluded.client_mutation_id,
    deleted_at = null,
    updated_at = clock_timestamp()
  returning * into v_saved_expense;

  -- Replace splits atomically, filtering for active participants to respect check constraint
  delete from expense_splits where expense_id = v_expense_id;

  insert into expense_splits (expense_id, member_id, paid_minor, owed_minor, split_value)
  select
    v_expense_id,
    (s->>'member_id')::uuid,
    (s->>'paid_minor')::bigint,
    (s->>'owed_minor')::bigint,
    (s->>'split_value')::numeric
  from jsonb_array_elements(v_splits_arr) as s
  where (s->>'paid_minor')::bigint > 0 or (s->>'owed_minor')::bigint > 0;

  -- Log activity (supports expense_added, expense_restored, and expense_edited)
  if v_is_new then
    insert into activity_log (group_id, actor_member_id, type, entity_id, payload)
    values (v_group_id, v_actor_member_id, 'expense_added', v_expense_id, jsonb_build_object('title', v_title, 'amount_minor', v_amount_minor));
  elsif v_existing_expense.deleted_at is not null then
    insert into activity_log (group_id, actor_member_id, type, entity_id, payload)
    values (v_group_id, v_actor_member_id, 'expense_restored', v_expense_id, jsonb_build_object('title', v_title, 'amount_minor', v_amount_minor));
  else
    insert into activity_log (group_id, actor_member_id, type, entity_id, payload)
    values (v_group_id, v_actor_member_id, 'expense_edited', v_expense_id, jsonb_build_object('title', v_title, 'amount_minor', v_amount_minor));
  end if;

  select jsonb_agg(row_to_json(s)) into v_saved_splits
  from expense_splits s where s.expense_id = v_expense_id;

  return jsonb_build_object(
    'expense', row_to_json(v_saved_expense),
    'splits', coalesce(v_saved_splits, '[]'::jsonb),
    'replayed', false
  );
end;
$$;

-- Ensure all synced tables are in supabase_realtime publication for instant cross-device updates
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'groups'
  ) then
    alter publication supabase_realtime add table groups;
  end if;
end;
$$;
