-- 0008_auth_trigger.sql: Automatic Profile Creation Trigger on Sign-Up
-- Specification Baseline: Technical Specification v1.0 Section 5.2

create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  v_display_name text;
begin
  -- Derive display name from raw user meta data or email local part
  v_display_name := coalesce(
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'full_name',
    split_part(new.email, '@', 1),
    'User'
  );

  insert into public.profiles (id, display_name, avatar_url, default_currency)
  values (
    new.id,
    substr(v_display_name, 1, 60),
    new.raw_user_meta_data->>'avatar_url',
    'INR'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
