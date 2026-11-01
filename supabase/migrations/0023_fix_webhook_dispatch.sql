-- 0023_fix_webhook_dispatch.sql
-- Fix dispatch_notify_group_webhook and send_payment_reminder_v1:
-- 1. Correct the endpoint URL to use the active project ref
-- 2. Include Authorization: Bearer <anon_key> and apikey headers so Supabase Edge Function Gateway does not reject requests with 401 UNAUTHORIZED_NO_AUTH_HEADER
-- 3. Ensure triggers exist for both expenses and settlements

-- 1. Update dispatch_notify_group_webhook function
create or replace function dispatch_notify_group_webhook()
returns trigger
language plpgsql
security definer
set search_path = public as $$
declare
  v_url text;
  v_secret text;
  v_anon_key text;
  v_payload jsonb;
begin
  -- Resolve edge function URL, secret, and anon key from app settings if configured, else fallback to project defaults
  v_url := coalesce(
    current_setting('app.settings.notify_group_url', true),
    'https://btzqkyxmziksmdkjgqmf.supabase.co/functions/v1/notify-group'
  );
  v_secret := coalesce(
    current_setting('app.settings.webhook_secret', true),
    'clearcut-webhook-secret-key'
  );
  v_anon_key := coalesce(
    current_setting('app.settings.anon_key', true),
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0enFreXhtemlrc21ka2pncW1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MjE1MDksImV4cCI6MjEwNzI5NzUwOX0.aiXTFKJMWx4FAM5IUn995WUgk3GBe554zBTxL65cskA'
  );

  v_payload := jsonb_build_object(
    'type', tg_op,
    'table', tg_table_name,
    'schema', tg_table_schema,
    'record', row_to_json(new)
  );

  -- Perform non-blocking HTTP POST via pg_net with gateway auth headers
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key,
      'apikey', v_anon_key,
      'x-webhook-secret', v_secret
    ),
    body := v_payload
  );

  return new;
exception
  when others then
    -- Failures must never abort write transactions
    return new;
end;
$$;

-- Ensure triggers exist
drop trigger if exists trg_expenses_notify_group on expenses;
create trigger trg_expenses_notify_group
  after insert on expenses
  for each row execute function dispatch_notify_group_webhook();

drop trigger if exists trg_settlements_notify_group on settlements;
create trigger trg_settlements_notify_group
  after insert on settlements
  for each row execute function dispatch_notify_group_webhook();

-- 2. Update send_payment_reminder_v1 function with gateway auth headers
create or replace function send_payment_reminder_v1(
  p_recipient_user_id uuid,
  p_amount_minor bigint,
  p_currency text,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  v_sender_id uuid;
  v_sender_name text;
  v_recipient_name text;
  v_token_count int;
  v_display_amount text;
  v_url text;
  v_secret text;
  v_anon_key text;
  v_payload jsonb;
begin
  -- 1. Identify caller
  v_sender_id := auth.uid();
  if v_sender_id is null then
    raise exception 'UNAUTHENTICATED: Must be logged in to send a payment reminder';
  end if;

  if v_sender_id = p_recipient_user_id then
    raise exception 'INVALID_ARGUMENT: Cannot send payment reminder to yourself';
  end if;

  -- 2. Fetch sender display name
  select coalesce(display_name, email, 'A friend') into v_sender_name
  from profiles
  where id = v_sender_id;

  -- 3. Fetch recipient display name
  select coalesce(display_name, email, 'friend') into v_recipient_name
  from profiles
  where id = p_recipient_user_id;

  if not found then
    raise exception 'NOT_FOUND: Recipient user does not exist';
  end if;

  -- 4. Count active device tokens for recipient
  select count(*) into v_token_count
  from device_tokens
  where user_id = p_recipient_user_id;

  -- 5. Format display amount
  v_display_amount := p_currency || ' ' || trim(to_char((p_amount_minor::numeric / 100.0), 'FM999,999,990.00'));

  -- 6. Build push dispatch payload
  v_url := coalesce(
    current_setting('app.settings.notify_group_url', true),
    'https://btzqkyxmziksmdkjgqmf.supabase.co/functions/v1/notify-group'
  );
  v_secret := coalesce(
    current_setting('app.settings.webhook_secret', true),
    'clearcut-webhook-secret-key'
  );
  v_anon_key := coalesce(
    current_setting('app.settings.anon_key', true),
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0enFreXhtemlrc21ka2pncW1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MjE1MDksImV4cCI6MjEwNzI5NzUwOX0.aiXTFKJMWx4FAM5IUn995WUgk3GBe554zBTxL65cskA'
  );

  v_payload := jsonb_build_object(
    'type', 'payment_reminder',
    'senderUserId', v_sender_id,
    'senderName', v_sender_name,
    'recipientUserId', p_recipient_user_id,
    'amountMinor', p_amount_minor,
    'currency', p_currency,
    'title', 'Clearcut: Payment Reminder',
    'body', coalesce(p_message, 'Hey ' || v_recipient_name || '! Friendly reminder from ' || v_sender_name || ' to settle up ' || v_display_amount || ' on Clearcut.'),
    'route', '/friends'
  );

  -- 7. Dispatch HTTP POST via pg_net if extension is present
  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon_key,
        'apikey', v_anon_key,
        'x-webhook-secret', v_secret
      ),
      body := v_payload
    );
  exception
    when others then
      -- pg_net unavailable in local environments should not abort the function
      null;
  end;

  return jsonb_build_object(
    'success', true,
    'tokensCount', v_token_count,
    'senderName', v_sender_name,
    'recipientUserId', p_recipient_user_id
  );
end;
$$;

