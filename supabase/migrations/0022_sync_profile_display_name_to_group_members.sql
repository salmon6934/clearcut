-- 0022_sync_profile_display_name_to_group_members.sql
-- Propagates display_name changes in profiles to all active group_members for that user
-- 1. Creates helper function sync_user_display_name_to_group_members
-- 2. Creates trigger trg_sync_profile_display_name on profiles
-- 3. Exposes update_profile_v1 RPC for atomic profile and membership update
-- 4. Adds RLS policy allowing users to update their own display_name in group_members
-- 5. Backfills any existing mismatched group_members.display_name from profiles.display_name

-- 1. Helper function to synchronize display_name with collision handling
create or replace function public.sync_user_display_name_to_group_members(
  p_user_id uuid,
  p_new_name text
)
returns void
language plpgsql
security definer
set search_path = public as $$
declare
  v_member record;
  v_target_name text;
  v_counter int;
  v_collides boolean;
begin
  if p_user_id is null or p_new_name is null or length(trim(p_new_name)) = 0 then
    return;
  end if;

  for v_member in
    select id, group_id, display_name
    from group_members
    where user_id = p_user_id and left_at is null
  loop
    v_target_name := substr(trim(p_new_name), 1, 60);
    v_counter := 1;

    -- Handle unique constraint collision with group_members_name_uq
    loop
      select exists (
        select 1 from group_members
        where group_id = v_member.group_id
          and id <> v_member.id
          and left_at is null
          and lower(display_name) = lower(v_target_name)
      ) into v_collides;

      exit when not v_collides;

      v_counter := v_counter + 1;
      v_target_name := substr(trim(p_new_name), 1, 55) || ' (' || v_counter || ')';
    end loop;

    -- Update member display name and bump updated_at for incremental pull and realtime
    if v_member.display_name is distinct from v_target_name then
      update group_members
      set display_name = v_target_name,
          updated_at = clock_timestamp()
      where id = v_member.id;
    end if;
  end loop;
end;
$$;

-- 2. Trigger function on profiles table
create or replace function public.handle_profile_display_name_sync()
returns trigger
language plpgsql
security definer
set search_path = public as $$
begin
  if new.display_name is distinct from old.display_name then
    perform public.sync_user_display_name_to_group_members(new.id, new.display_name);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_profile_display_name on profiles;
create trigger trg_sync_profile_display_name
  after update of display_name on profiles
  for each row
  execute function public.handle_profile_display_name_sync();

-- 3. Atomic RPC for profile display name & currency update
create or replace function update_profile_v1(
  p_display_name text,
  p_default_currency text default 'INR'
)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_trimmed_name text := trim(p_display_name);
  v_currency text := upper(trim(coalesce(p_default_currency, 'INR')));
  v_updated_profile record;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  if length(v_trimmed_name) < 1 or length(v_trimmed_name) > 60 then
    raise exception 'INVALID_DISPLAY_NAME: Display name must be between 1 and 60 characters' using errcode = 'PT400';
  end if;

  -- Upsert profiles row
  insert into public.profiles (id, display_name, default_currency, updated_at)
  values (v_user_id, v_trimmed_name, v_currency, clock_timestamp())
  on conflict (id) do update
  set display_name = excluded.display_name,
      default_currency = excluded.default_currency,
      updated_at = clock_timestamp()
  returning * into v_updated_profile;

  -- Synchronize group_members across all groups
  perform public.sync_user_display_name_to_group_members(v_user_id, v_trimmed_name);

  return jsonb_build_object(
    'profile', row_to_json(v_updated_profile),
    'success', true
  );
end;
$$;

-- 4. RLS Policy: allow users to update their own group_members row
drop policy if exists "group_members_update_own_display_name_policy" on group_members;
create policy "group_members_update_own_display_name_policy" on group_members
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 5. Backfill: sync existing group_members whose display_name differs from their profile
do $$
declare
  p record;
begin
  for p in select id, display_name from profiles loop
    perform public.sync_user_display_name_to_group_members(p.id, p.display_name);
  end loop;
end;
$$;

