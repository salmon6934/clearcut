-- 0016_device_tokens_fix.sql
-- Enables reliable FCM token registration and account reassignment.

-- 1. Update RLS on device_tokens so that updating an existing device token (e.g. after account switch or re-login)
-- is permitted as long as the updated row belongs to auth.uid().
drop policy if exists "device_tokens_update_policy" on device_tokens;

create policy "device_tokens_update_policy" on device_tokens
  for update
  using (true)
  with check (user_id = auth.uid());

-- 2. Security definer RPC for atomic token registration
create or replace function register_device_token(
  p_token text,
  p_platform text,
  p_app_version text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into device_tokens (user_id, token, platform, app_version, updated_at)
  values (v_user_id, p_token, p_platform, p_app_version, now())
  on conflict (token)
  do update set
    user_id = v_user_id,
    platform = excluded.platform,
    app_version = coalesce(excluded.app_version, device_tokens.app_version),
    updated_at = now();
end;
$$;

grant execute on function register_device_token(text, text, text) to authenticated;
