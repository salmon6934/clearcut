-- 0017_fix_group_join.sql: Fix Group Invite Code Synchronization and Join RPC
-- 1. Backfills any missing profiles from auth.users (prevents foreign key constraint violations)
-- 2. Ensures profile exists before inserting group or membership records
-- 3. Updates create_group_v1 to respect client-provided invite_code (e.g. 6-char alphanumeric)
-- 4. Updates join_group_v1 to support flexible parameter signatures (p_code, p_invite_code, p_mutation_id)
-- 5. Enables fallback matching on invite_code prefix and group ID prefix
-- 6. Touches groups.updated_at on join so pull_changes_v1 delivers the group to joining user

-- Backfill any missing profiles from auth.users
insert into public.profiles (id, display_name, avatar_url, default_currency)
select
  u.id,
  substr(coalesce(u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1), 'User'), 1, 60),
  u.raw_user_meta_data->>'avatar_url',
  'INR'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- Drop old signatures to avoid overload ambiguities
drop function if exists join_group_v1(text, uuid);
drop function if exists join_group_v1(text, uuid, text, uuid);

-- 1. Updated join_group_v1
create or replace function join_group_v1(
  p_code text default null,
  p_member_id uuid default gen_random_uuid(),
  p_invite_code text default null,
  p_mutation_id uuid default null
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
  v_lookup_code text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  v_lookup_code := upper(trim(coalesce(p_code, p_invite_code, '')));
  if v_lookup_code is null or length(v_lookup_code) = 0 then
    raise exception 'INVITE_INVALID: Invite code is required' using errcode = 'PT400';
  end if;

  -- Ensure profile exists in profiles table for this authenticated user
  insert into public.profiles (id, display_name, default_currency)
  values (
    v_user_id,
    substr(coalesce(
      (select raw_user_meta_data->>'display_name' from auth.users where id = v_user_id),
      (select raw_user_meta_data->>'full_name' from auth.users where id = v_user_id),
      (select split_part(email, '@', 1) from auth.users where id = v_user_id),
      'Member'
    ), 1, 60),
    'INR'
  )
  on conflict (id) do nothing;

  -- Flexible matching:
  -- 1. Exact match on upper(invite_code)
  -- 2. Prefix match on upper(invite_code) (for truncated codes)
  -- 3. Prefix match on group UUID without dashes
  select * into v_group from groups
  where (
    upper(invite_code) = v_lookup_code
    or (length(v_lookup_code) >= 6 and upper(invite_code) like (v_lookup_code || '%'))
    or (length(v_lookup_code) >= 6 and upper(replace(id::text, '-', '')) like (v_lookup_code || '%'))
  )
  and deleted_at is null
  order by case when upper(invite_code) = v_lookup_code then 0 else 1 end
  limit 1;

  if not found then
    raise exception 'INVITE_INVALID: Group not found with given code' using errcode = 'PT404';
  end if;

  -- Update group updated_at so incremental sync (pull_changes_v1) picks up the group
  update groups set updated_at = clock_timestamp()
  where id = v_group.id
  returning * into v_group;

  select * into v_user_profile from profiles where id = v_user_id;

  -- Check if already a member
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
  from group_members gm where gm.group_id = v_group.id and gm.left_at is null;

  return jsonb_build_object(
    'group', row_to_json(v_group),
    'member', row_to_json(v_existing_member),
    'members', coalesce(v_all_members, '[]'::jsonb)
  );
end;
$$;

-- 2. Updated create_group_v1 to preserve client invite_code and ensure profile
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

  -- Ensure profile exists in profiles table for this creator
  insert into public.profiles (id, display_name, default_currency)
  values (
    v_user_id,
    substr(coalesce(
      (select raw_user_meta_data->>'display_name' from auth.users where id = v_user_id),
      (select raw_user_meta_data->>'full_name' from auth.users where id = v_user_id),
      (select split_part(email, '@', 1) from auth.users where id = v_user_id),
      'Member'
    ), 1, 60),
    'INR'
  )
  on conflict (id) do nothing;

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

  -- Prefer client-provided invite_code if supplied and valid, otherwise generate
  v_invite_code := upper(trim(coalesce(p_group->>'invite_code', '')));
  if v_invite_code = '' or length(v_invite_code) < 4 or length(v_invite_code) > 16 then
    v_invite_code := upper(encode(extensions.gen_random_bytes(8), 'hex'));
  end if;

  -- Ensure uniqueness of invite code
  while exists (select 1 from groups where upper(invite_code) = v_invite_code) loop
    v_invite_code := upper(encode(extensions.gen_random_bytes(8), 'hex'));
  end loop;

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
