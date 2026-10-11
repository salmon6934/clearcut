-- 0006_rpc_settlements.sql: Transactional Settlements & Group Leave RPCs
-- Specification Baseline: Technical Specification v1.0 Section 5.3

-- 1. upsert_settlement_v1
create or replace function upsert_settlement_v1(
  p_settlement jsonb,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_settlement_id uuid;
  v_group_id uuid;
  v_from_id uuid;
  v_to_id uuid;
  v_amount_minor bigint;
  v_method text;
  v_note text;
  v_settled_on date;
  v_actor_member_id uuid;
  v_saved_settlement record;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  v_settlement_id := (p_settlement->>'id')::uuid;
  v_group_id := (p_settlement->>'group_id')::uuid;
  v_from_id := (p_settlement->>'from_member_id')::uuid;
  v_to_id := (p_settlement->>'to_member_id')::uuid;
  v_amount_minor := (p_settlement->>'amount_minor')::bigint;
  v_method := p_settlement->>'method';
  v_note := p_settlement->>'note';
  v_settled_on := coalesce((p_settlement->>'settled_on')::date, current_date);

  if not is_member(v_group_id) then
    raise exception 'FORBIDDEN: Must be active group member' using errcode = 'PT403';
  end if;

  if v_from_id = v_to_id then
    raise exception 'SETTLEMENT_INVALID: Payer and payee must be different' using errcode = 'PT400';
  end if;

  if v_amount_minor <= 0 or v_amount_minor > 10000000000 then
    raise exception 'SETTLEMENT_INVALID: Invalid settlement amount' using errcode = 'PT400';
  end if;

  -- Verify members belong to the group
  if not exists (select 1 from group_members where id = v_from_id and group_id = v_group_id)
     or not exists (select 1 from group_members where id = v_to_id and group_id = v_group_id) then
    raise exception 'SETTLEMENT_INVALID: Members do not belong to group' using errcode = 'PT400';
  end if;

  select id into v_actor_member_id from group_members
  where group_id = v_group_id and user_id = v_user_id and left_at is null
  limit 1;

  -- Idempotent insert: settlements are immutable / append-only
  insert into settlements (
    id, group_id, from_member_id, to_member_id, amount_minor, method, note, settled_on, created_by
  ) values (
    v_settlement_id, v_group_id, v_from_id, v_to_id, v_amount_minor, v_method, v_note, v_settled_on, v_actor_member_id
  )
  on conflict (id) do nothing
  returning * into v_saved_settlement;

  if not found then
    select * into v_saved_settlement from settlements where id = v_settlement_id;
    return jsonb_build_object('settlement', row_to_json(v_saved_settlement), 'replayed', true);
  end if;

  -- Log activity
  insert into activity_log (group_id, actor_member_id, type, entity_id, payload)
  values (
    v_group_id,
    v_actor_member_id,
    'settlement_added',
    v_settlement_id,
    jsonb_build_object('amount_minor', v_amount_minor, 'from_member_id', v_from_id, 'to_member_id', v_to_id)
  );

  return jsonb_build_object('settlement', row_to_json(v_saved_settlement), 'replayed', false);
end;
$$;

-- 2. delete_settlement_v1
create or replace function delete_settlement_v1(
  p_settlement_id uuid,
  p_mutation_id uuid
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

-- 3. leave_group_v1
create or replace function leave_group_v1(
  p_group_id uuid,
  p_member_id uuid
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

  -- Check owner transfer rule
  if v_member.role = 'owner' then
    select count(*) into v_other_owners from group_members
    where group_id = p_group_id and role = 'owner' and left_at is null and id <> p_member_id;

    select count(*) into v_active_members from group_members
    where group_id = p_group_id and left_at is null and id <> p_member_id;

    if v_other_owners = 0 and v_active_members > 0 then
      raise exception 'LAST_OWNER: Must transfer ownership before leaving' using errcode = 'PT409';
    end if;
  end if;

  update group_members set left_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = p_member_id;

  insert into activity_log (group_id, actor_member_id, type, entity_id, payload)
  values (p_group_id, p_member_id, 'member_left', p_member_id, jsonb_build_object('display_name', v_member.display_name));

  return jsonb_build_object('group_id', p_group_id, 'member_id', p_member_id, 'left_at', clock_timestamp());
end;
$$;
