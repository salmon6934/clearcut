-- 0007_rpc_sync.sql: Pull Synchronization & Activity Feed RPCs
-- Specification Baseline: Technical Specification v1.0 Section 5.3

-- 1. pull_changes_v1
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

  -- Groups: groups where user is an active member
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
    coalesce(jsonb_agg(row_to_json(c)) filter (where not is_extra), '[]'::jsonb),
    coalesce(bool_or(is_extra), false)
  into v_res_groups, v_has_more_groups
  from counted;

  -- Members: members of user's active groups
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
    coalesce(jsonb_agg(row_to_json(c)) filter (where not is_extra), '[]'::jsonb),
    coalesce(bool_or(is_extra), false)
  into v_res_members, v_has_more_members
  from counted;

  -- Expenses: expenses of user's active groups with nested splits
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
    coalesce(jsonb_agg(row_to_json(c)) filter (where not is_extra), '[]'::jsonb),
    coalesce(bool_or(is_extra), false)
  into v_res_expenses, v_has_more_expenses
  from counted;

  -- Settlements: settlements of user's active groups
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
    coalesce(jsonb_agg(row_to_json(c)) filter (where not is_extra), '[]'::jsonb),
    coalesce(bool_or(is_extra), false)
  into v_res_settlements, v_has_more_settlements
  from counted;

  return jsonb_build_object(
    'groups', v_res_groups,
    'members', v_res_members,
    'expenses', v_res_expenses,
    'settlements', v_res_settlements,
    'has_more', jsonb_build_object(
      'groups', v_has_more_groups,
      'members', v_has_more_members,
      'expenses', v_has_more_expenses,
      'settlements', v_has_more_settlements
    ),
    'server_time', v_server_time
  );
end;
$$;

-- 2. list_activity_v1 (keyset pagination)
create or replace function list_activity_v1(
  p_group uuid,
  p_before jsonb default null,
  p_limit int default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_limit int := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_before_ts timestamptz;
  v_before_id uuid;
  v_items jsonb;
  v_next jsonb := null;
  v_last_row record;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  if not is_member(p_group) then
    raise exception 'FORBIDDEN' using errcode = 'PT403';
  end if;

  if p_before is not null then
    v_before_ts := (p_before->>'created_at')::timestamptz;
    v_before_id := (p_before->>'id')::uuid;
  end if;

  with feed as (
    select a.*
    from activity_log a
    where a.group_id = p_group
      and (
        p_before is null
        or (a.created_at, a.id) < (v_before_ts, v_before_id)
      )
    order by a.created_at desc, a.id desc
    limit v_limit + 1
  ),
  counted as (
    select *, (row_number() over () > v_limit) as is_extra from feed
  )
  select
    coalesce(jsonb_agg(row_to_json(c)) filter (where not is_extra), '[]'::jsonb)
  into v_items
  from counted;

  -- Keyset cursor for next page
  if jsonb_array_length(v_items) = v_limit then
    select * into v_last_row
    from activity_log
    where group_id = p_group
      and (
        p_before is null
        or (created_at, id) < (v_before_ts, v_before_id)
      )
    order by created_at desc, id desc
    offset v_limit - 1 limit 1;

    if found then
      v_next := jsonb_build_object(
        'created_at', v_last_row.created_at,
        'id', v_last_row.id
      );
    end if;
  end if;

  return jsonb_build_object(
    'items', v_items,
    'next', v_next
  );
end;
$$;
