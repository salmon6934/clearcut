-- ====================================================================
-- T-0.2: Supabase RPC Concurrency & PT409 Mapping Spike
-- ====================================================================

-- 1. Prototype Table
create table if not exists public.spike_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount_minor bigint not null check (amount_minor > 0),
  version integer not null default 1,
  client_mutation_id uuid,
  updated_at timestamptz not null default clock_timestamp()
);

-- 2. Test RPC test_update_v1 with PT409 and Rollback Validation
create or replace function public.test_update_v1(
  p_id uuid,
  p_title text,
  p_amount_minor bigint,
  p_base_version integer,
  p_mutation_id uuid
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_current public.spike_items%rowtype;
  v_updated public.spike_items%rowtype;
begin
  -- Retrieve current row
  select * into v_current
  from public.spike_items
  where id = p_id;

  if not found then
    raise exception 'ITEM_NOT_FOUND'
      using errcode = 'PT404',
            detail = json_build_object('error', 'Item does not exist', 'id', p_id)::text;
  end if;

  -- Idempotency check: if already processed with this mutation ID, return existing
  if v_current.client_mutation_id = p_mutation_id then
    return json_build_object(
      'replayed', true,
      'item', row_to_json(v_current)
    )::jsonb;
  end if;

  -- Optimistic Concurrency Control (OCC) Version Check
  if v_current.version != p_base_version then
    raise exception 'EXPENSE_CONFLICT'
      using errcode = 'PT409',
            detail = json_build_object(
              'error', 'VERSION_MISMATCH',
              'server_version', v_current.version,
              'client_base_version', p_base_version,
              'server_snapshot', row_to_json(v_current)
            )::text;
  end if;

  -- Invariant check: minor amount must be strictly positive
  if p_amount_minor <= 0 then
    raise exception 'INVALID_AMOUNT'
      using errcode = 'PT400',
            detail = json_build_object('error', 'Amount must be > 0', 'amount_minor', p_amount_minor)::text;
  end if;

  -- Perform atomic update
  update public.spike_items
  set title = p_title,
      amount_minor = p_amount_minor,
      version = v_current.version + 1,
      client_mutation_id = p_mutation_id,
      updated_at = clock_timestamp()
  where id = p_id
  returning * into v_updated;

  return json_build_object(
    'replayed', false,
    'item', row_to_json(v_updated)
  )::jsonb;
end;
$$;
