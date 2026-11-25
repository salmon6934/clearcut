-- 0024_fix_delete_rpc_signatures.sql
-- Fix parameter signatures for delete_expense_v1 and delete_settlement_v1:
-- Provide p_group_id with default null so calling either with or without p_group_id works seamlessly in PostgREST.

-- 1. delete_expense_v1
create or replace function delete_expense_v1(
  p_expense_id uuid,
  p_base_version int default null,
  p_mutation_id uuid default null,
  p_group_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_expense record;
  v_actor_member_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  select * into v_expense from expenses where id = p_expense_id;
  if not found then
    return jsonb_build_object('id', p_expense_id, 'already_deleted', true);
  end if;

  if not is_member(v_expense.group_id) then
    raise exception 'FORBIDDEN' using errcode = 'PT403';
  end if;

  if v_expense.deleted_at is not null then
    return jsonb_build_object('id', p_expense_id, 'already_deleted', true);
  end if;

  -- Optimistic concurrency check
  if p_base_version is not null and v_expense.version <> p_base_version then
    raise exception 'EXPENSE_CONFLICT' using errcode = 'PT409', detail = row_to_json(v_expense)::text;
  end if;

  select id into v_actor_member_id from group_members
  where group_id = v_expense.group_id and user_id = v_user_id and left_at is null
  limit 1;

  update expenses
  set deleted_at = clock_timestamp(),
      version = version + 1,
      client_mutation_id = p_mutation_id,
      updated_at = clock_timestamp()
  where id = p_expense_id;

  insert into activity_log (group_id, actor_member_id, type, entity_id, payload)
  values (v_expense.group_id, v_actor_member_id, 'expense_deleted', p_expense_id, jsonb_build_object('title', v_expense.title));

  return jsonb_build_object('id', p_expense_id, 'deleted_at', clock_timestamp());
end;
$$;

-- 2. delete_settlement_v1
create or replace function delete_settlement_v1(
  p_settlement_id uuid,
  p_mutation_id uuid default null,
  p_group_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_settlement record;
  v_actor record;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  select * into v_settlement from settlements where id = p_settlement_id;
  if not found or v_settlement.deleted_at is not null then
    return jsonb_build_object('id', p_settlement_id, 'already_deleted', true);
  end if;

  select * into v_actor from group_members
  where group_id = v_settlement.group_id and user_id = v_user_id and left_at is null;

  if not found then
    raise exception 'FORBIDDEN' using errcode = 'PT403';
  end if;

  -- Only creator, admin, or owner can delete settlement
  if v_settlement.created_by <> v_actor.id and v_actor.role not in ('owner', 'admin') then
    raise exception 'FORBIDDEN: Only creator or group admin can undo settlement' using errcode = 'PT403';
  end if;

  update settlements set deleted_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = p_settlement_id;

  insert into activity_log (group_id, actor_member_id, type, entity_id, payload)
  values (
    v_settlement.group_id,
    v_actor.id,
    'settlement_deleted',
    p_settlement_id,
    jsonb_build_object('amount_minor', v_settlement.amount_minor)
  );

  return jsonb_build_object('id', p_settlement_id, 'deleted_at', clock_timestamp());
end;
$$;
