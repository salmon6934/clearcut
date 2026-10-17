-- 0021_fix_group_deletion_cascade.sql
-- Fixes foreign key constraints on group_members references so cascading group deletions do not fail
-- Updates delete_group_v1 and leave_group_v1 to perform clean child deletion in dependency order

-- 1. Ensure foreign key constraints on group_members have ON DELETE CASCADE
alter table activity_log drop constraint if exists activity_log_actor_member_id_fkey;
alter table activity_log add constraint activity_log_actor_member_id_fkey
  foreign key (actor_member_id) references group_members(id) on delete cascade;

alter table expense_splits drop constraint if exists expense_splits_member_id_fkey;
alter table expense_splits add constraint expense_splits_member_id_fkey
  foreign key (member_id) references group_members(id) on delete cascade;

alter table expenses drop constraint if exists expenses_created_by_fkey;
alter table expenses add constraint expenses_created_by_fkey
  foreign key (created_by) references group_members(id) on delete cascade;

alter table settlements drop constraint if exists settlements_from_member_id_fkey;
alter table settlements add constraint settlements_from_member_id_fkey
  foreign key (from_member_id) references group_members(id) on delete cascade;

alter table settlements drop constraint if exists settlements_to_member_id_fkey;
alter table settlements add constraint settlements_to_member_id_fkey
  foreign key (to_member_id) references group_members(id) on delete cascade;

alter table settlements drop constraint if exists settlements_created_by_fkey;
alter table settlements add constraint settlements_created_by_fkey
  foreign key (created_by) references group_members(id) on delete cascade;

-- 2. Update delete_group_v1 with explicit ordered child deletion
create or replace function delete_group_v1(
  p_group_id uuid,
  p_mutation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_caller record;
  v_group record;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  select * into v_group from groups where id = p_group_id;
  if not found then
    -- Already deleted (idempotent)
    return jsonb_build_object('success', true, 'group_id', p_group_id, 'replayed', true);
  end if;

  -- Verify caller is creator or owner
  if v_group.created_by <> v_user_id then
    select * into v_caller from group_members
    where group_id = p_group_id and user_id = v_user_id and role = 'owner';
    if not found then
      raise exception 'FORBIDDEN: Only the group owner can delete the group' using errcode = 'PT403';
    end if;
  end if;

  -- Explicitly clean up all group data in reverse foreign-key order
  delete from placeholder_claims where group_id = p_group_id;
  delete from notification_prefs where group_id = p_group_id;
  delete from activity_log where group_id = p_group_id;
  delete from expense_splits where expense_id in (select id from expenses where group_id = p_group_id);
  delete from expenses where group_id = p_group_id;
  delete from settlements where group_id = p_group_id;
  delete from group_members where group_id = p_group_id;
  delete from groups where id = p_group_id;

  return jsonb_build_object('success', true, 'group_id', p_group_id);
end;
$$;

-- 3. Update leave_group_v1 with explicit ordered child deletion when last member leaves
create or replace function leave_group_v1(
  p_group_id uuid,
  p_member_id uuid,
  p_mutation_id uuid default null
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

  -- Count remaining active members
  select count(*) into v_active_members from group_members
  where group_id = p_group_id and left_at is null and id <> p_member_id;

  if v_member.role = 'owner' and v_active_members > 0 then
    select count(*) into v_other_owners from group_members
    where group_id = p_group_id and role = 'owner' and left_at is null and id <> p_member_id;

    if v_other_owners = 0 then
      raise exception 'LAST_OWNER: Must transfer ownership before leaving' using errcode = 'PT409';
    end if;
  end if;

  if v_active_members = 0 then
    delete from placeholder_claims where group_id = p_group_id;
    delete from notification_prefs where group_id = p_group_id;
    delete from activity_log where group_id = p_group_id;
    delete from expense_splits where expense_id in (select id from expenses where group_id = p_group_id);
    delete from expenses where group_id = p_group_id;
    delete from settlements where group_id = p_group_id;
    delete from group_members where group_id = p_group_id;
    delete from groups where id = p_group_id;
  else
    update group_members set left_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = p_member_id;

    insert into activity_log (group_id, actor_member_id, type, entity_id, payload)
    values (p_group_id, p_member_id, 'member_left', p_member_id, jsonb_build_object('display_name', v_member.display_name));
  end if;

  return jsonb_build_object('group_id', p_group_id, 'member_id', p_member_id, 'left_at', clock_timestamp());
end;
$$;
