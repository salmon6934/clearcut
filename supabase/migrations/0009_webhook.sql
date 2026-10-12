-- 0009_webhook.sql: Database Webhook on INSERT to expenses and settlements
-- Invokes Edge Function notify-group via pg_net with secret header x-webhook-secret
-- Specification Baseline: Technical Specification v1.0 Section 5.4 & T-2.6.1

create extension if not exists pg_net with schema extensions;

-- Function to dispatch webhook to notify-group edge function
create or replace function dispatch_notify_group_webhook()
returns trigger
language plpgsql
security definer
set search_path = public as $$
declare
  v_url text;
  v_secret text;
  v_payload jsonb;
begin
  -- Resolve edge function URL and secret from app settings if configured, else default
  v_url := coalesce(
    current_setting('app.settings.notify_group_url', true),
    'https://<project-ref>.supabase.co/functions/v1/notify-group'
  );
  v_secret := coalesce(
    current_setting('app.settings.webhook_secret', true),
    'clearcut-webhook-secret-key'
  );

  v_payload := jsonb_build_object(
    'type', tg_op,
    'table', tg_table_name,
    'schema', tg_table_schema,
    'record', row_to_json(new)
  );

  -- Perform non-blocking HTTP POST via pg_net
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', v_secret
    ),
    body := v_payload
  );

  return new;
exception
  when others then
    -- Database webhook dispatch failures must NEVER abort ledger write transactions
    return new;
end;
$$;

drop trigger if exists trg_expenses_notify_group on expenses;
create trigger trg_expenses_notify_group
  after insert on expenses
  for each row execute function dispatch_notify_group_webhook();

drop trigger if exists trg_settlements_notify_group on settlements;
create trigger trg_settlements_notify_group
  after insert on settlements
  for each row execute function dispatch_notify_group_webhook();
