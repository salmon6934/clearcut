-- 0003_rls.sql: Row-Level Security (RLS) Policies
-- Specification Baseline: Technical Specification v1.0 Section 4.3

-- Enable RLS on all tables
alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table expenses enable row level security;
alter table expense_splits enable row level security;
alter table settlements enable row level security;
alter table activity_log enable row level security;
alter table device_tokens enable row level security;
alter table notification_prefs enable row level security;

-- ==========================================
-- 1. PROFILES POLICIES
-- ==========================================
-- Users can view their own profile and profiles of co-members in shared groups
create policy "profiles_select_policy" on profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from group_members gm1
      join group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = auth.uid()
        and gm1.left_at is null
        and gm2.user_id = profiles.id
        and gm2.left_at is null
    )
  );

create policy "profiles_update_policy" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ==========================================
-- 2. GROUPS POLICIES (Reads only via is_member; writes via RPC)
-- ==========================================
create policy "groups_select_policy" on groups
  for select using (is_member(id));

-- ==========================================
-- 3. GROUP MEMBERS POLICIES
-- ==========================================
create policy "group_members_select_policy" on group_members
  for select using (is_member(group_id));

-- ==========================================
-- 4. EXPENSES POLICIES
-- ==========================================
create policy "expenses_select_policy" on expenses
  for select using (is_member(group_id));

-- ==========================================
-- 5. EXPENSE SPLITS POLICIES
-- ==========================================
create policy "expense_splits_select_policy" on expense_splits
  for select using (
    exists (
      select 1 from expenses e
      where e.id = expense_splits.expense_id
        and is_member(e.group_id)
    )
  );

-- ==========================================
-- 6. SETTLEMENTS POLICIES
-- ==========================================
create policy "settlements_select_policy" on settlements
  for select using (is_member(group_id));

-- ==========================================
-- 7. ACTIVITY LOG POLICIES
-- ==========================================
create policy "activity_log_select_policy" on activity_log
  for select using (is_member(group_id));

-- ==========================================
-- 8. DEVICE TOKENS POLICIES (User own row only)
-- ==========================================
create policy "device_tokens_select_policy" on device_tokens
  for select using (user_id = auth.uid());

create policy "device_tokens_insert_policy" on device_tokens
  for insert with check (user_id = auth.uid());

create policy "device_tokens_update_policy" on device_tokens
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "device_tokens_delete_policy" on device_tokens
  for delete using (user_id = auth.uid());

-- ==========================================
-- 9. NOTIFICATION PREFS POLICIES (User own row only)
-- ==========================================
create policy "notification_prefs_select_policy" on notification_prefs
  for select using (user_id = auth.uid());

create policy "notification_prefs_insert_policy" on notification_prefs
  for insert with check (user_id = auth.uid());

create policy "notification_prefs_update_policy" on notification_prefs
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "notification_prefs_delete_policy" on notification_prefs
  for delete using (user_id = auth.uid());

-- Add tables to supabase_realtime publication for change hints
alter publication supabase_realtime add table expenses;
alter publication supabase_realtime add table settlements;
alter publication supabase_realtime add table group_members;
