-- 0010_member_management.sql: Member Removal, Role Management & Ownership Transfer RPCs
-- Specification Baseline: Technical Specification v1.0 Section 5.2, US-20 & T-2.7.1

-- 1. remove_member_v1
create or replace function remove_member_v1(
  p_group_id uuid,
  p_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_caller record;
  v_target record;
  v_net_minor bigint;
  v_owner_count int;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  -- 1. Verify caller is an active owner or admin of the group
  select * into v_caller from group_members
  where group_id = p_group_id and user_id = v_user_id and left_at is null;

  if not found or v_caller.role not in ('owner', 'admin') then
    raise exception 'FORBIDDEN: Must be an active group owner or admin to remove members' using errcode = 'PT403';
  end if;

  -- 2. Fetch target member
  select * into v_target from group_members
  where id = p_member_id and group_id = p_group_id and left_at is null;

  if not found then
    raise exception 'MEMBER_NOT_FOUND: Member does not exist or has already left' using errcode = 'PT404';
  end if;

  -- 3. Check role constraints
  if v_target.role = 'owner' then
    if v_caller.role <> 'owner' then
      raise exception 'FORBIDDEN: Admins cannot remove group owners' using errcode = 'PT403';
    end if;

    select count(*) into v_owner_count from group_members
    where group_id = p_group_id and role = 'owner' and left_at is null;

    if v_owner_count <= 1 then
      raise exception 'SOLE_OWNER: Sole owner cannot be removed. Transfer ownership first.' using errcode = 'PT409';
    end if;
  end if;

  -- 4. Check zero-balance invariant: member net balance must be exactly 0
  select coalesce(net_minor, 0) into v_net_minor
  from group_balances(p_group_id)
  where member_id = p_member_id;

  if coalesce(v_net_minor, 0) <> 0 then
    raise exception 'MEMBER_HAS_BALANCE: Member has non-zero balance of %', v_net_minor
      using errcode = 'PT409',
      detail = jsonb_build_object('net_minor', v_net_minor, 'member_id', p_member_id)::text;
  end if;

  -- 5. Mark member as left
  update group_members
  set left_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_member_id;

  -- 6. Log activity
  insert into activity_log (group_id, actor_member_id, type, entity_id, payload)
  values (
    p_group_id,
    v_caller.id,
    'member_removed',
    p_member_id,
    jsonb_build_object('display_name', v_target.display_name, 'member_id', p_member_id)
  );

  return jsonb_build_object(
    'success', true,
    'group_id', p_group_id,
    'member_id', p_member_id,
    'left_at', clock_timestamp()
  );
end;
$$;

-- 2. update_member_role_v1
create or replace function update_member_role_v1(
  p_group_id uuid,
  p_member_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_caller record;
  v_target record;
  v_new_role text := lower(trim(p_role));
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  if v_new_role not in ('admin', 'member') then
    raise exception 'VALIDATION_FAILED: Role must be admin or member. Use transfer_group_ownership_v1 for owner role.' using errcode = 'PT400';
  end if;

  -- Verify caller is active group owner
  select * into v_caller from group_members
  where group_id = p_group_id and user_id = v_user_id and left_at is null;

  if not found or v_caller.role <> 'owner' then
    raise exception 'FORBIDDEN: Only group owners can manage member roles' using errcode = 'PT403';
  end if;

  -- Fetch target member
  select * into v_target from group_members
  where id = p_member_id and group_id = p_group_id and left_at is null;

  if not found then
    raise exception 'MEMBER_NOT_FOUND: Member not found or has left' using errcode = 'PT404';
  end if;

  if v_target.role = 'owner' then
    raise exception 'FORBIDDEN: Cannot change role of group owner directly' using errcode = 'PT403';
  end if;

  -- Update role
  update group_members
  set role = v_new_role,
      updated_at = clock_timestamp()
  where id = p_member_id;

  return jsonb_build_object(
    'success', true,
    'group_id', p_group_id,
    'member_id', p_member_id,
    'role', v_new_role
  );
end;
$$;

-- 3. transfer_group_ownership_v1
create or replace function transfer_group_ownership_v1(
  p_group_id uuid,
  p_new_owner_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_caller record;
  v_target record;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  -- Verify caller is active group owner
  select * into v_caller from group_members
  where group_id = p_group_id and user_id = v_user_id and left_at is null;

  if not found or v_caller.role <> 'owner' then
    raise exception 'FORBIDDEN: Only group owners can transfer ownership' using errcode = 'PT403';
  end if;

  if v_caller.id = p_new_owner_member_id then
    return jsonb_build_object(
      'success', true,
      'group_id', p_group_id,
      'owner_member_id', v_caller.id,
      'replayed', true
    );
  end if;

  -- Fetch target member
  select * into v_target from group_members
  where id = p_new_owner_member_id and group_id = p_group_id and left_at is null;

  if not found then
    raise exception 'MEMBER_NOT_FOUND: Target member not found or has left' using errcode = 'PT404';
  end if;

  -- Promote target to owner
  update group_members
  set role = 'owner',
      updated_at = clock_timestamp()
  where id = p_new_owner_member_id;

  -- Demote previous owner to admin
  update group_members
  set role = 'admin',
      updated_at = clock_timestamp()
  where id = v_caller.id;

  -- If target has a registered user account, update group created_by
  if v_target.user_id is not null then
    update groups
    set created_by = v_target.user_id,
        version = version + 1,
        updated_at = clock_timestamp()
    where id = p_group_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'group_id', p_group_id,
    'previous_owner_id', v_caller.id,
    'new_owner_id', p_new_owner_member_id
  );
end;
$$;
