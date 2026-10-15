-- 0018_delete_group.sql: Comprehensive Fix for Group Deletion, Membership Invariants & Active Group Pruning

-- 1. Restore owner active status for any groups where left_at was inadvertently set
update group_members gm
set left_at = null,
    updated_at = clock_timestamp()
from groups g
where gm.group_id = g.id
  and (gm.role = 'owner' or g.created_by = gm.user_id)
  and gm.left_at is not null;

-- 2. Update is_member helper to ensure group creators are never locked out of their groups
create or replace function is_member(g uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from group_members gm
    join groups gr on gr.id = gm.group_id
    where gm.group_id = g
      and gm.user_id = auth.uid()
      and (gm.left_at is null or gr.created_by = auth.uid())
      and gr.deleted_at is null
  );
$$;

-- 3. delete_group_v1: Actually removes group from the database (CASCADE removes members, expenses, settlements)
create or replace function delete_group_v1(
  p_group_id uuid,
  p_mutation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_caller record;
  v_group record;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  select * into v_group from groups where id = p_group_id;
  if not found then
    -- Already deleted (idempotent)
    return jsonb_build_object('success', true, 'group_id', p_group_id, 'replayed', true);
  end if;

  -- Verify caller is creator or owner
  if v_group.created_by <> v_user_id then
    select * into v_caller from group_members
    where group_id = p_group_id and user_id = v_user_id and role = 'owner';
    if not found then
      raise exception 'FORBIDDEN: Only the group owner can delete the group' using errcode = 'PT403';
    end if;
  end if;

  -- Hard delete: foreign keys with ON DELETE CASCADE remove members, expenses, splits, and settlements
  delete from groups where id = p_group_id;

  return jsonb_build_object('success', true, 'group_id', p_group_id);
end;
$$;

-- 4. leave_group_v1: Marks member left, or deletes group if caller is the last member
create or replace function leave_group_v1(
  p_group_id uuid,
  p_member_id uuid,
  p_mutation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_member record;
  v_net_minor bigint;
  v_other_owners int;
  v_active_members int;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  select * into v_member from group_members
  where id = p_member_id and group_id = p_group_id and user_id = v_user_id and left_at is null;

  if not found then
    raise exception 'FORBIDDEN: Member not found or already left' using errcode = 'PT403';
  end if;

  -- Check zero-balance invariant: member must have 0 net balance
  select net_minor into v_net_minor from group_balances(p_group_id)
  where member_id = p_member_id;

  if coalesce(v_net_minor, 0) <> 0 then
    raise exception 'MEMBER_HAS_BALANCE: Must settle balance of % before leaving', v_net_minor
      using errcode = 'PT409',
      detail = jsonb_build_object('net_minor', v_net_minor)::text;
  end if;

  -- Count remaining active members
  select count(*) into v_active_members from group_members
  where group_id = p_group_id and left_at is null and id <> p_member_id;

  if v_member.role = 'owner' and v_active_members > 0 then
    select count(*) into v_other_owners from group_members
    where group_id = p_group_id and role = 'owner' and left_at is null and id <> p_member_id;

    if v_other_owners = 0 then
      raise exception 'LAST_OWNER: Must transfer ownership before leaving' using errcode = 'PT409';
    end if;
  end if;

  if v_active_members = 0 then
    delete from groups where id = p_group_id;
  else
    update group_members set left_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = p_member_id;

    insert into activity_log (group_id, actor_member_id, type, entity_id, payload)
    values (p_group_id, p_member_id, 'member_left', p_member_id, jsonb_build_object('display_name', v_member.display_name));
  end if;

  return jsonb_build_object('group_id', p_group_id, 'member_id', p_member_id, 'left_at', clock_timestamp());
end;
$$;

-- 5. pull_changes_v1: Return active_group_ids so client automatically prunes deleted groups
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
