-- 0011_claim_placeholder.sql: Placeholder Member Claiming Flow RPCs
-- Specification Baseline: Technical Specification v1.0 Section 5.2, US-04, R-17 & T-2.7.2

-- 1. Table placeholder_claims
create table if not exists placeholder_claims (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  member_id uuid not null references group_members(id) on delete cascade,
  claim_token varchar(64) not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  created_by uuid not null references profiles(id),
  claimed_at timestamptz,
  claimed_by uuid references profiles(id),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);

create index if not exists idx_placeholder_claims_token on placeholder_claims(claim_token);
create index if not exists idx_placeholder_claims_member on placeholder_claims(member_id);

-- RLS policies for placeholder_claims
alter table placeholder_claims enable row level security;

create policy "Group members can view active claims"
  on placeholder_claims for select
  using (is_member(group_id));

create policy "Group members can insert claims"
  on placeholder_claims for insert
  with check (is_member(group_id) and created_by = auth.uid());

-- 2. generate_placeholder_claim_v1
create or replace function generate_placeholder_claim_v1(
  p_group_id uuid,
  p_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_member record;
  v_existing_claim record;
  v_new_token text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  if not is_member(p_group_id) then
    raise exception 'FORBIDDEN: Must be an active member to generate placeholder claim invites' using errcode = 'PT403';
  end if;

  -- Verify target member is an active placeholder member in this group
  select * into v_member from group_members
  where id = p_member_id and group_id = p_group_id and left_at is null;

  if not found then
    raise exception 'MEMBER_NOT_FOUND: Member does not exist or has left' using errcode = 'PT404';
  end if;

  if v_member.user_id is not null then
    raise exception 'MEMBER_ALREADY_CLAIMED: This member is already linked to a registered account' using errcode = 'PT400';
  end if;

  -- Reuse unexpired active claim token if one already exists
  select * into v_existing_claim from placeholder_claims
  where group_id = p_group_id and member_id = p_member_id and claimed_at is null and expires_at > now()
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'claim_token', v_existing_claim.claim_token,
      'group_id', p_group_id,
      'member_id', p_member_id,
      'display_name', v_member.display_name,
      'expires_at', v_existing_claim.expires_at,
      'reused', true
    );
  end if;

  -- Generate new claim token
  v_new_token := encode(extensions.gen_random_bytes(16), 'hex');

  insert into placeholder_claims (group_id, member_id, claim_token, created_by)
  values (p_group_id, p_member_id, v_new_token, v_user_id)
  returning * into v_existing_claim;

  return jsonb_build_object(
    'claim_token', v_existing_claim.claim_token,
    'group_id', p_group_id,
    'member_id', p_member_id,
    'display_name', v_member.display_name,
    'expires_at', v_existing_claim.expires_at,
    'reused', false
  );
end;
$$;

-- 3. claim_placeholder_v1
create or replace function claim_placeholder_v1(
  p_claim_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_claim record;
  v_member record;
  v_group record;
  v_existing_user_member record;
  v_clean_token text := trim(p_claim_token);
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'PT401';
  end if;

  if v_clean_token is null or length(v_clean_token) = 0 then
    raise exception 'VALIDATION_FAILED: Claim token is required' using errcode = 'PT400';
  end if;

  -- 1. Find valid claim token
  select * into v_claim from placeholder_claims
  where claim_token = v_clean_token;

  if not found or v_claim.expires_at <= now() then
    raise exception 'CLAIM_TOKEN_INVALID: Token does not exist or has expired' using errcode = 'PT404';
  end if;

  -- 2. Fetch target member
  select * into v_member from group_members
  where id = v_claim.member_id and group_id = v_claim.group_id;

  if not found or v_member.left_at is not null then
    raise exception 'MEMBER_NOT_FOUND: Placeholder member was removed or has left the group' using errcode = 'PT404';
  end if;

  -- Idempotency: if already claimed by this user
  if v_member.user_id = v_user_id then
    return jsonb_build_object(
      'success', true,
      'group_id', v_claim.group_id,
      'member_id', v_claim.member_id,
      'display_name', v_member.display_name,
      'replayed', true
    );
  end if;

  if v_member.user_id is not null or v_claim.claimed_at is not null then
    raise exception 'MEMBER_ALREADY_CLAIMED: This member has already been claimed by another account' using errcode = 'PT409';
  end if;

  -- 3. Verify user is not already a different member of this group
  select * into v_existing_user_member from group_members
  where group_id = v_claim.group_id and user_id = v_user_id and id <> v_claim.member_id and left_at is null;

  if found then
    raise exception 'ALREADY_GROUP_MEMBER: You already have a member profile in this group' using errcode = 'PT409';
  end if;

  -- 4. Link caller user_id to existing placeholder row
  -- Ledger splits, settlements, balances all reference member_id so they remain completely preserved!
  update group_members
  set user_id = v_user_id,
      updated_at = clock_timestamp()
  where id = v_claim.member_id
  returning * into v_member;

  -- 5. Mark claim token as claimed
  update placeholder_claims
  set claimed_at = clock_timestamp(),
      claimed_by = v_user_id
  where id = v_claim.id;

  -- 6. Log activity
  insert into activity_log (group_id, actor_member_id, type, entity_id, payload)
  values (
    v_claim.group_id,
    v_claim.member_id,
    'member_added',
    v_claim.member_id,
    jsonb_build_object(
      'claimed_by', v_user_id,
      'display_name', v_member.display_name,
      'is_claimed_placeholder', true
    )
  );

  select * into v_group from groups where id = v_claim.group_id;

  return jsonb_build_object(
    'success', true,
    'group_id', v_claim.group_id,
    'group', row_to_json(v_group),
    'member_id', v_claim.member_id,
    'member', row_to_json(v_member),
    'replayed', false
  );
end;
$$;
