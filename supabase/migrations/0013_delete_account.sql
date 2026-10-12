-- 0013_delete_account.sql: Account Deletion (Apple Review & GDPR Compliance)
-- Specification Baseline: Technical Specification v1.0 Section 5.3 & Task 2.10.2

-- 1. Relax groups.created_by constraint to allow set null on deletion
alter table groups alter column created_by drop not null;
alter table groups drop constraint if exists groups_created_by_fkey;
alter table groups add constraint groups_created_by_fkey 
  foreign key (created_by) references profiles(id) on delete set null;

-- 2. Relax placeholder_claims constraint to allow set null or cascade
alter table placeholder_claims drop constraint if exists placeholder_claims_created_by_fkey;
alter table placeholder_claims add constraint placeholder_claims_created_by_fkey
  foreign key (created_by) references profiles(id) on delete cascade;

alter table placeholder_claims drop constraint if exists placeholder_claims_claimed_by_fkey;
alter table placeholder_claims add constraint placeholder_claims_claimed_by_fkey
  foreign key (claimed_by) references profiles(id) on delete set null;

-- 3. Implement delete_account_v1() RPC
create or replace function delete_account_v1()
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_group record;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  -- 1. Convert user's group_members memberships to placeholder members to preserve Invariant I3
  update group_members
  set
    user_id = null,
    updated_at = clock_timestamp()
  where user_id = v_user_id;

  -- 2. If user was owner of any groups, promote next active member to owner if available, else mark deleted
  for v_group in select id from groups where deleted_at is null loop
    -- Check if group now has an owner with an active user account
    if not exists (
      select 1 from group_members
      where group_id = v_group.id and role = 'owner' and user_id is not null and left_at is null
    ) then
      -- Attempt to promote earliest remaining active member
      update group_members
      set role = 'owner', updated_at = clock_timestamp()
      where id = (
        select id from group_members
        where group_id = v_group.id and user_id is not null and left_at is null
        order by joined_at asc
        limit 1
      );

      -- If no other active member exists in the group, mark group deleted
      if not found and not exists (
        select 1 from group_members
        where group_id = v_group.id and user_id is not null and left_at is null
      ) then
        update groups set deleted_at = clock_timestamp(), updated_at = clock_timestamp()
        where id = v_group.id;
      end if;
    end if;
  end loop;

  -- 3. Delete user device tokens, notification preferences, and placeholder claims
  delete from device_tokens where user_id = v_user_id;
  delete from notification_preferences where user_id = v_user_id;
  delete from placeholder_claims where created_by = v_user_id;

  -- 4. Delete profile row
  delete from profiles where id = v_user_id;

  -- 5. Delete authentication user record from auth.users
  delete from auth.users where id = v_user_id;

  return jsonb_build_object('success', true);
end;
$$;
