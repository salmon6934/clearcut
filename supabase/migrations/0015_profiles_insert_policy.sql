-- 0015_profiles_insert_policy.sql
-- Allow authenticated users to insert their own profile record (e.g. on profile setup or if auth trigger didn't run)

drop policy if exists "profiles_insert_policy" on public.profiles;

create policy "profiles_insert_policy" on public.profiles
  for insert with check (id = auth.uid());
