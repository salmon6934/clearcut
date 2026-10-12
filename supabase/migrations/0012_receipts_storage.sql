-- 0012_receipts_storage.sql: Private Receipts Storage & RLS
-- Specification Baseline: Technical Specification v1.0 Section 5.3 & Task 2.9.1

-- 1. Create private 'receipts' bucket in Supabase storage schema
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  1572864, -- 1.5 MB in bytes
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 1572864,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- 2. Storage RLS Policies for receipts bucket
-- Objects are partitioned by group: receipts/<group_id>/<expense_id>_<timestamp>.jpg
drop policy if exists "Allow group members to read receipts" on storage.objects;
create policy "Allow group members to read receipts"
on storage.objects for select
to authenticated
using (
  bucket_id = 'receipts'
  and is_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "Allow group members to upload receipts" on storage.objects;
create policy "Allow group members to upload receipts"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'receipts'
  and is_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "Allow group members to update receipts" on storage.objects;
create policy "Allow group members to update receipts"
on storage.objects for update
to authenticated
using (
  bucket_id = 'receipts'
  and is_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "Allow group members to delete receipts" on storage.objects;
create policy "Allow group members to delete receipts"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'receipts'
  and is_member(((storage.foldername(name))[1])::uuid)
);

-- 3. Update upsert_expense_v1 to persist receipt_path
create or replace function upsert_expense_v1(
  p_expense jsonb,
  p_base_version int,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_expense_id uuid;
  v_group_id uuid;
  v_title text;
  v_notes text;
  v_amount_minor bigint;
  v_currency text;
  v_category text;
  v_expense_date date;
  v_split_type text;
  v_created_by uuid;
  v_receipt_path text;
  v_group record;
  v_existing_expense record;
  v_saved_expense record;
  v_saved_splits jsonb;
  v_split record;
  v_total_paid bigint := 0;
  v_total_owed bigint := 0;
  v_splits_arr jsonb;
  v_actor_member_id uuid;
  v_is_new boolean := false;
  v_new_version int;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  v_expense_id := (p_expense->>'id')::uuid;
  v_group_id := (p_expense->>'group_id')::uuid;
  v_title := trim(p_expense->>'title');
  v_notes := p_expense->>'notes';
  v_amount_minor := (p_expense->>'amount_minor')::bigint;
  v_currency := upper(p_expense->>'currency');
  v_category := p_expense->>'category';
  v_expense_date := (p_expense->>'expense_date')::date;
  v_split_type := p_expense->>'split_type';
  v_created_by := (p_expense->>'created_by')::uuid;
  v_receipt_path := p_expense->>'receipt_path';
  v_splits_arr := p_expense->'splits';

  -- Verify group membership
  if not is_member(v_group_id) then
    raise exception 'FORBIDDEN: Must be an active group member' using errcode = 'PT403';
  end if;

  -- Verify group currency
  select * into v_group from groups where id = v_group_id and deleted_at is null;
  if not found then
    raise exception 'GROUP_NOT_FOUND' using errcode = 'PT404';
  end if;

  if v_group.currency <> v_currency then
    raise exception 'EXPENSE_CURRENCY_MISMATCH: Expense currency does not match group' using errcode = 'PT400';
  end if;

  -- Validate amount bounds
  if v_amount_minor <= 0 or v_amount_minor > 10000000000 then
    raise exception 'EXPENSE_INVALID_AMOUNT: Invalid amount' using errcode = 'PT400';
  end if;

  -- Actor member id
  select id into v_actor_member_id from group_members
  where group_id = v_group_id and user_id = v_user_id and left_at is null
  limit 1;

  if v_created_by is null then
    v_created_by := v_actor_member_id;
  end if;

  -- Check existing expense for idempotency or conflict
  select * into v_existing_expense from expenses where id = v_expense_id;
  if found then
    -- Idempotency check: if last applied mutation is identical, replay stored aggregate
    if v_existing_expense.client_mutation_id = p_mutation_id then
      select jsonb_agg(row_to_json(s)) into v_saved_splits
      from expense_splits s where s.expense_id = v_expense_id;
      return jsonb_build_object(
        'expense', row_to_json(v_existing_expense),
        'splits', coalesce(v_saved_splits, '[]'::jsonb),
        'replayed', true
      );
    end if;

    -- Concurrency check: optimistic locking on version
    if p_base_version is not null and v_existing_expense.version <> p_base_version then
      raise exception 'EXPENSE_CONFLICT: Optimistic lock mismatch'
        using errcode = 'PT409',
        detail = row_to_json(v_existing_expense)::text;
    end if;

    v_new_version := v_existing_expense.version + 1;
  else
    v_is_new := true;
    v_new_version := 1;
  end if;

  -- Verify splits and sum conservation Invariant I2
  if jsonb_array_length(v_splits_arr) = 0 then
    raise exception 'EXPENSE_INVALID_SPLIT: At least one split required' using errcode = 'PT400';
  end if;

  for v_split in select * from jsonb_to_recordset(v_splits_arr) as (
    member_id uuid,
    paid_minor bigint,
    owed_minor bigint,
    split_value numeric
  ) loop
    -- Verify member exists in group
    if not exists (select 1 from group_members where id = v_split.member_id and group_id = v_group_id) then
      raise exception 'MEMBER_NOT_IN_GROUP: Split member % not in group', v_split.member_id using errcode = 'PT400';
    end if;

    if v_split.paid_minor < 0 or v_split.owed_minor < 0 then
      raise exception 'EXPENSE_INVALID_SPLIT: Negative split amounts prohibited' using errcode = 'PT400';
    end if;

    v_total_paid := v_total_paid + v_split.paid_minor;
    v_total_owed := v_total_owed + v_split.owed_minor;
  end loop;

  if v_total_paid <> v_amount_minor or v_total_owed <> v_amount_minor then
    raise exception 'EXPENSE_INVALID_SPLIT: Invariant I2 violated' using errcode = 'PT400';
  end if;

  -- Upsert expense
  insert into expenses (
    id, group_id, title, notes, amount_minor, currency, category, expense_date,
    split_type, receipt_path, created_by, version, client_mutation_id, deleted_at, updated_at
  ) values (
    v_expense_id, v_group_id, v_title, v_notes, v_amount_minor, v_currency, v_category, v_expense_date,
    v_split_type, v_receipt_path, v_created_by, v_new_version, p_mutation_id, null, clock_timestamp()
  )
  on conflict (id) do update set
    title = excluded.title,
    notes = excluded.notes,
    amount_minor = excluded.amount_minor,
    category = excluded.category,
    expense_date = excluded.expense_date,
    split_type = excluded.split_type,
    receipt_path = coalesce(excluded.receipt_path, expenses.receipt_path),
    version = v_new_version,
    client_mutation_id = excluded.client_mutation_id,
    deleted_at = null,
    updated_at = clock_timestamp()
  returning * into v_saved_expense;

  -- Replace splits atomically
  delete from expense_splits where expense_id = v_expense_id;

  insert into expense_splits (expense_id, member_id, paid_minor, owed_minor, split_value)
  select
    v_expense_id,
    (s->>'member_id')::uuid,
    (s->>'paid_minor')::bigint,
    (s->>'owed_minor')::bigint,
    (s->>'split_value')::numeric
  from jsonb_array_elements(v_splits_arr) as s;

  -- Log activity
  if v_is_new then
    insert into activity_log (group_id, actor_member_id, type, entity_id, payload)
    values (v_group_id, v_actor_member_id, 'expense_added', v_expense_id, jsonb_build_object('title', v_title, 'amount_minor', v_amount_minor));
  else
    insert into activity_log (group_id, actor_member_id, type, entity_id, payload)
    values (v_group_id, v_actor_member_id, 'expense_edited', v_expense_id, jsonb_build_object('title', v_title, 'amount_minor', v_amount_minor));
  end if;

  select jsonb_agg(row_to_json(s)) into v_saved_splits
  from expense_splits s where s.expense_id = v_expense_id;

  return jsonb_build_object(
    'expense', row_to_json(v_saved_expense),
    'splits', coalesce(v_saved_splits, '[]'::jsonb),
    'replayed', false
  );
end;
$$;
