-- 0004_rpc_groups.sql: Transactional RPCs for Groups, Placeholders & Joining
-- Specification Baseline: Technical Specification v1.0 Section 5.3

-- 1. create_group_v1
create or replace function create_group_v1(
  p_group jsonb,
  p_owner_member_id uuid,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_name text;
  v_type text;
  v_currency text;
  v_invite_code text;
  v_user_display_name text;
  v_existing_group record;
  v_existing_member record;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  v_group_id := (p_group->>'id')::uuid;
  v_name := trim(p_group->>'name');
  v_type := coalesce(p_group->>'type', 'trip');
  v_currency := upper(p_group->>'currency');

  if v_group_id is null or v_name is null or length(v_name) = 0 or length(v_name) > 80 then
    raise exception 'VALIDATION_FAILED: Invalid group name or id' using errcode = 'PT400';
  end if;

  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'VALIDATION_FAILED: Invalid currency code' using errcode = 'PT400';
  end if;

  -- Idempotency check: if group exists and was created by same user, return it
  select * into v_existing_group from groups where id = v_group_id;
  if found then
    if v_existing_group.created_by = v_user_id then
      select * into v_existing_member from group_members
      where group_id = v_group_id and user_id = v_user_id;
      return jsonb_build_object(
        'group', row_to_json(v_existing_group),
        'member', row_to_json(v_existing_member),
        'replayed', true
      );
    else
      raise exception 'FORBIDDEN: Group ID already taken' using errcode = 'PT403';
    end if;
  end if;

  -- Get creator display name
  select display_name into v_user_display_name from profiles where id = v_user_id;
  if v_user_display_name is null then
    v_user_display_name := 'Member';
  end if;

  -- Generate 8-byte hexadecimal invite code
  v_invite_code := upper(encode(extensions.gen_random_bytes(8), 'hex'));

  -- Insert group
  insert into groups (id, name, type, currency, invite_code, created_by, version)
  values (v_group_id, v_name, v_type, v_currency, v_invite_code, v_user_id, 1)
  returning * into v_existing_group;

  -- Insert owner member
  insert into group_members (id, group_id, user_id, display_name, role)
  values (p_owner_member_id, v_group_id, v_user_id, v_user_display_name, 'owner')
  returning * into v_existing_member;

  -- Log activity
  insert into activity_log (group_id, actor_member_id, type, entity_id, payload)
  values (
    v_group_id,
    p_owner_member_id,
    'group_created',
    v_group_id,
    jsonb_build_object('name', v_name, 'currency', v_currency)
  );

  return jsonb_build_object(
    'group', row_to_json(v_existing_group),
    'member', row_to_json(v_existing_member),
    'replayed', false
  );
end;
$$;

-- 2. add_placeholder_v1
create or replace function add_placeholder_v1(
  p_member jsonb,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_member_id uuid;
  v_display_name text;
  v_actor_member_id uuid;
  v_existing_member record;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  v_group_id := (p_member->>'group_id')::uuid;
  v_member_id := (p_member->>'id')::uuid;
  v_display_name := trim(p_member->>'display_name');

  if not is_member(v_group_id) then
    raise exception 'FORBIDDEN: Must be an active member to add placeholders' using errcode = 'PT403';
  end if;

  if v_display_name is null or length(v_display_name) = 0 or length(v_display_name) > 60 then
    raise exception 'VALIDATION_FAILED: Invalid display name' using errcode = 'PT400';
  end if;

  -- Idempotency check: if this member_id exists
  select * into v_existing_member from group_members where id = v_member_id;
  if found then
    return jsonb_build_object('member', row_to_json(v_existing_member), 'replayed', true);
  end if;

  -- Check unique name within group among active members
  if exists (
    select 1 from group_members
    where group_id = v_group_id
      and lower(display_name) = lower(v_display_name)
      and left_at is null
  ) then
    raise exception 'MEMBER_NAME_TAKEN: Member with this name already exists' using errcode = 'PT409';
  end if;

  -- Find actor member ID
  select id into v_actor_member_id from group_members
  where group_id = v_group_id and user_id = v_user_id and left_at is null
  limit 1;

  -- Insert placeholder member (user_id = null)
  insert into group_members (id, group_id, user_id, display_name, role)
  values (v_member_id, v_group_id, null, v_display_name, 'member')
  returning * into v_existing_member;

  -- Log activity
  insert into activity_log (group_id, actor_member_id, type, entity_id, payload)
  values (
    v_group_id,
    v_actor_member_id,
    'member_added',
    v_member_id,
    jsonb_build_object('display_name', v_display_name, 'is_placeholder', true)
  );

  return jsonb_build_object('member', row_to_json(v_existing_member), 'replayed', false);
end;
$$;

-- 3. join_group_v1
create or replace function join_group_v1(
  p_code text,
  p_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_group record;
  v_user_profile record;
  v_existing_member record;
  v_all_members jsonb;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  select * into v_group from groups
  where upper(invite_code) = upper(trim(p_code))
    and deleted_at is null;

  if not found then
    raise exception 'INVITE_INVALID: Group not found with given code' using errcode = 'PT404';
  end if;

  select * into v_user_profile from profiles where id = v_user_id;

  -- Check if already an active member
  select * into v_existing_member from group_members
  where group_id = v_group.id and user_id = v_user_id;

  if found then
    -- If previously left, clear left_at
    if v_existing_member.left_at is not null then
      update group_members set left_at = null, updated_at = clock_timestamp()
      where id = v_existing_member.id
      returning * into v_existing_member;

      insert into activity_log (group_id, actor_member_id, type, entity_id, payload)
      values (v_group.id, v_existing_member.id, 'member_added', v_existing_member.id, jsonb_build_object('rejoined', true));
    end if;
  else
    -- Create new membership
    insert into group_members (id, group_id, user_id, display_name, role)
    values (p_member_id, v_group.id, v_user_id, coalesce(v_user_profile.display_name, 'Member'), 'member')
    returning * into v_existing_member;

    insert into activity_log (group_id, actor_member_id, type, entity_id, payload)
    values (v_group.id, v_existing_member.id, 'member_added', v_existing_member.id, '{}'::jsonb);
  end if;

  select jsonb_agg(row_to_json(gm)) into v_all_members
  from group_members gm where gm.group_id = v_group.id;

  return jsonb_build_object(
    'group', row_to_json(v_group),
    'member', row_to_json(v_existing_member),
    'members', coalesce(v_all_members, '[]'::jsonb)
  );
end;
$$;
