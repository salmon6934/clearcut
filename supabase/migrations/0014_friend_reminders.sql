-- 0014_friend_reminders.sql: Friend Payment Reminders via Push Notification
-- Specification Baseline: Technical Specification v1.0 Section 5.4, NFR-06 & Push Notification Fanout

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
  v_url text;
  v_secret text;
  v_payload jsonb;
  v_display_amount text;
begin
  -- 1. Verify caller authentication
  v_sender_id := auth.uid();
  if v_sender_id is null then
    raise exception 'PT401: Unauthorized';
  end if;

  -- 2. Resolve sender profile
  select display_name into v_sender_name
  from profiles
  where id = v_sender_id;

  v_sender_name := coalesce(v_sender_name, 'A friend');

  -- 3. Resolve recipient profile
  select display_name into v_recipient_name
  from profiles
  where id = p_recipient_user_id;

  if v_recipient_name is null then
    -- Check if recipient exists at all
    if not exists (select 1 from auth.users where id = p_recipient_user_id) then
      raise exception 'PT404: Recipient user not found';
    end if;
    v_recipient_name := 'Friend';
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
    'https://<project-ref>.supabase.co/functions/v1/notify-group'
  );
  v_secret := coalesce(
    current_setting('app.settings.webhook_secret', true),
    'clearcut-webhook-secret-key'
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
