-- 0001_core.sql: PostgreSQL DDL Migration for Clearcut Core Ledger
-- Specification Baseline: Technical Specification v1.0 Section 4.2 & 4.4

create extension if not exists pgcrypto with schema extensions;

-- 1. Profiles (1:1 with auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  default_currency char(3) not null default 'INR' check (default_currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Groups (client-generated UUID)
create table if not exists groups (
  id uuid primary key,                                   -- client-generated UUID
  name text not null check (char_length(name) between 1 and 80),
  type text not null default 'trip' check (type in ('trip', 'home', 'couple', 'other')),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  invite_code varchar(16) not null unique default upper(encode(extensions.gen_random_bytes(8), 'hex')),
  created_by uuid not null references profiles(id),
  version int not null default 1,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Group Members (the ledger identity; user_id null for placeholders)
create table if not exists group_members (
  id uuid primary key,                                   -- client-generated UUID
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid references profiles(id),                  -- null = placeholder member
  display_name text not null check (char_length(display_name) between 1 and 60),
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique constraints for members
create unique index if not exists group_members_user_uq 
  on group_members(group_id, user_id) 
  where user_id is not null;

create unique index if not exists group_members_name_uq 
  on group_members(group_id, lower(display_name)) 
  where left_at is null;

-- 4. Expenses (client-generated UUID, optimistic concurrency on version)
create table if not exists expenses (
  id uuid primary key,                                   -- client-generated UUID
  group_id uuid not null references groups(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  notes text check (char_length(notes) <= 1000),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 10000000000),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  category text,
  expense_date date not null,
  split_type text not null check (split_type in ('equal', 'exact', 'percentage', 'shares')),
  fx_rate_to_base numeric(18, 8),                        -- reserved for multi-currency (Phase 3)
  receipt_path text,                                     -- storage object path (Phase 2)
  created_by uuid not null references group_members(id),
  version int not null default 1,
  client_mutation_id uuid,                               -- idempotency key of last applied mutation
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. Expense Splits (paid_minor and owed_minor per member)
create table if not exists expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  member_id uuid not null references group_members(id),
  paid_minor bigint not null default 0 check (paid_minor >= 0),
  owed_minor bigint not null default 0 check (owed_minor >= 0),
  split_value numeric(12, 4),                            -- bps (percentage), weight (shares), adjustment
  unique (expense_id, member_id),
  check (paid_minor > 0 or owed_minor > 0)
);

-- 6. Settlements (append-only cash/UPI transfers between members)
create table if not exists settlements (
  id uuid primary key,                                   -- client-generated UUID
  group_id uuid not null references groups(id) on delete cascade,
  from_member_id uuid not null references group_members(id),
  to_member_id uuid not null references group_members(id),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 10000000000),
  method text check (method in ('cash', 'upi', 'venmo', 'paypal', 'bank', 'other')),
  note text check (char_length(note) <= 280),
  settled_on date not null default current_date,
  created_by uuid not null references group_members(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_member_id <> to_member_id)
);

-- 7. Activity Log (immutable, written exclusively by server RPCs)
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  actor_member_id uuid not null references group_members(id),
  type text not null check (type in (
    'group_created', 'member_added', 'member_left', 'member_removed',
    'expense_added', 'expense_edited', 'expense_deleted', 'expense_restored',
    'settlement_added', 'settlement_deleted'
  )),
  entity_id uuid,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- 8. Device Tokens (FCM push notification tokens)
create table if not exists device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  app_version text,
  updated_at timestamptz not null default now()
);

-- 9. Notification Preferences
create table if not exists notification_prefs (
  user_id uuid not null references profiles(id) on delete cascade,
  group_id uuid references groups(id) on delete cascade,  -- null = global default
  expense_added boolean not null default true,
  settlement_added boolean not null default true,
  reminders boolean not null default true,
  muted_until timestamptz,
  unique (user_id, group_id)
);

-- Performance & Sync Cursors Indexes
create index if not exists idx_expenses_list 
  on expenses (group_id, expense_date desc, id) 
  where deleted_at is null;

create index if not exists idx_expenses_updated 
  on expenses (group_id, updated_at);

create index if not exists idx_expense_splits_expense 
  on expense_splits (expense_id);

create index if not exists idx_expense_splits_member 
  on expense_splits (member_id);

create index if not exists idx_settlements_updated 
  on settlements (group_id, updated_at);

create index if not exists idx_settlements_active 
  on settlements (group_id) 
  where deleted_at is null;

create index if not exists idx_group_members_user 
  on group_members (user_id) 
  where left_at is null;

create index if not exists idx_group_members_updated 
  on group_members (group_id, updated_at);

create index if not exists idx_groups_updated 
  on groups (updated_at);

create index if not exists idx_activity_log_feed 
  on activity_log (group_id, created_at desc, id);

create index if not exists idx_device_tokens_user 
  on device_tokens (user_id);
