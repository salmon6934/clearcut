// supabase/functions/notify-group/index.ts
// Supabase Edge Function (Deno runtime) for FCM HTTP v1 notification dispatch
// Specification Baseline: Technical Specification v1.0 Section 5.4, NFR-06, D-14 & T-2.6.1

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as jose from 'https://deno.land/x/jose@v4.14.4/index.ts';

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export interface FcmPayload {
  title: string;
  body: string;
  route?: string;
  groupId?: string;
}

export interface FcmDispatchResult {
  token: string;
  success: boolean;
  status?: number;
  error?: string;
  isDeadToken?: boolean;
}

/**
 * Exchange Google Service Account credentials (RS256 via JOSE) for an OAuth2 token.
 */
export async function getGoogleOAuth2Token(sa: ServiceAccount): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;

  // Import RS256 PKCS#8 private key
  const privateKey = await jose.importPKCS8(sa.private_key, 'RS256');

  // Sign JWT assertion
  const jwt = await new jose.SignJWT({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp,
    iat,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .sign(privateKey);

  // Exchange JWT with Google OAuth2 endpoint
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Google OAuth2 exchange failed: ${resp.status} ${errorText}`);
  }

  const data = await resp.json();
  return data.access_token;
}

/**
 * Checks if an FCM error response indicates a dead / invalid device token that should be pruned.
 */
export function isDeadFcmError(status?: number, errorText?: string): boolean {
  if (status === 404) return true;
  if (!errorText) return false;
  const lower = errorText.toLowerCase();
  return (
    lower.includes('unregistered') ||
    lower.includes('registration-token-not-registered') ||
    lower.includes('invalid_argument') ||
    lower.includes('bad_registration')
  );
}

/**
 * Dispatch an FCM HTTP v1 push notification
 */
export async function sendFcmMessage(
  projectId: string,
  accessToken: string,
  token: string,
  payload: FcmPayload
): Promise<FcmDispatchResult> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const message = {
    message: {
      token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        route: payload.route || '',
        groupId: payload.groupId || '',
      },
      android: {
        priority: 'high',
        notification: {
          channel_id: 'expenses_channel',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: payload.title,
              body: payload.body,
            },
            badge: 1,
            sound: 'default',
          },
        },
      },
    },
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!resp.ok) {
      const err = await resp.text();
      const isDead = isDeadFcmError(resp.status, err);
      return { token, success: false, status: resp.status, error: err, isDeadToken: isDead };
    }

    return { token, success: true };
  } catch (err: any) {
    return { token, success: false, error: err.message || String(err), isDeadToken: false };
  }
}

/**
 * Filters recipient user IDs based on their notification preferences and active muted_until status.
 */
export function filterRecipientsByPrefs(
  candidateUserIds: string[],
  prefsRows: Array<{
    user_id: string;
    group_id: string | null;
    expense_added: boolean;
    settlement_added: boolean;
    muted_until: string | null;
  }>,
  eventType: 'expense_added' | 'settlement_added',
  nowIso = new Date().toISOString()
): string[] {
  const nowDate = new Date(nowIso);

  return candidateUserIds.filter((userId) => {
    const groupPref = prefsRows.find((p) => p.user_id === userId && p.group_id !== null);
    const globalPref = prefsRows.find((p) => p.user_id === userId && p.group_id === null);

    // 1. Check if muted either at group level or globally
    if (groupPref?.muted_until && new Date(groupPref.muted_until) > nowDate) {
      return false;
    }
    if (globalPref?.muted_until && new Date(globalPref.muted_until) > nowDate) {
      return false;
    }

    // 2. Check event preference (group level overrides global level)
    if (eventType === 'expense_added') {
      if (groupPref && groupPref.expense_added === false) return false;
      if (!groupPref && globalPref && globalPref.expense_added === false) return false;
    } else if (eventType === 'settlement_added') {
      if (groupPref && groupPref.settlement_added === false) return false;
      if (!groupPref && globalPref && globalPref.settlement_added === false) return false;
    }

    return true;
  });
}

/**
 * Resolves title, body, route, and target group parameters from webhook or direct request payload.
 */
export async function resolveNotificationDetails(
  rawBody: any,
  supabase: SupabaseClient
): Promise<{
  groupId: string;
  excludeUserId?: string;
  title: string;
  body: string;
  route: string;
  eventType: 'expense_added' | 'settlement_added';
} | null> {
  // Case A: Supabase Database Webhook payload on expenses / settlements INSERT
  if (rawBody?.table && rawBody?.record) {
    const table = rawBody.table;
    const record = rawBody.record;
    const groupId = record.group_id;

    if (!groupId) return null;

    // Fetch group name
    const { data: group } = await supabase
      .from('groups')
      .select('name, currency')
      .eq('id', groupId)
      .maybeSingle();

    const groupName = group?.name || 'Group';

    if (table === 'expenses') {
      const expenseTitle = record.title || 'New Expense';
      return {
        groupId,
        excludeUserId: record.created_by,
        title: `${groupName}: New Expense`,
        body: expenseTitle,
        route: `/group?id=${groupId}&expenseId=${record.id}`,
        eventType: 'expense_added',
      };
    }

    if (table === 'settlements') {
      // Fetch payer and payee display names
      const { data: members } = await supabase
        .from('group_members')
        .select('id, display_name')
        .in('id', [record.from_member_id, record.to_member_id]);

      const fromMember = members?.find((m: any) => m.id === record.from_member_id);
      const toMember = members?.find((m: any) => m.id === record.to_member_id);
      const fromName = fromMember?.display_name || 'Someone';
      const toName = toMember?.display_name || 'someone';
      const currency = group?.currency || '';

      return {
        groupId,
        excludeUserId: record.created_by,
        title: `${groupName}: Settlement`,
        body: `${fromName} paid ${toName} ${record.amount_minor} ${currency}`.trim(),
        route: `/group?id=${groupId}`,
        eventType: 'settlement_added',
      };
    }
  }

  // Case B: Direct invocation
  if (rawBody?.groupId) {
    return {
      groupId: rawBody.groupId,
      excludeUserId: rawBody.excludeUserId,
      title: rawBody.title || 'Group Notification',
      body: rawBody.body || '',
      route: rawBody.route || `/group?id=${rawBody.groupId}`,
      eventType: rawBody.eventType || 'expense_added',
    };
  }

  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
      },
    });
  }

  // 1. Authenticate webhook secret if configured
  const expectedSecret = Deno.env.get('WEBHOOK_SECRET');
  if (expectedSecret) {
    const providedSecret = req.headers.get('x-webhook-secret');
    if (providedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid x-webhook-secret header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    const rawBody = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const details = await resolveNotificationDetails(rawBody, supabase);
    if (!details) {
      return new Response(JSON.stringify({ error: 'Invalid payload: Unable to determine group notification details' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { groupId, excludeUserId, title, body, route, eventType } = details;

    // 2. Fetch active group members excluding the actor
    let membersQuery = supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .is('left_at', null)
      .not('user_id', 'is', null);

    if (excludeUserId) {
      membersQuery = membersQuery.neq('user_id', excludeUserId);
    }

    const { data: members, error: mErr } = await membersQuery;
    if (mErr) throw mErr;

    const candidateUserIds = (members || []).map((m: any) => m.user_id as string);
    if (candidateUserIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'No eligible recipient members' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Filter recipients by notification_prefs and active muted_until
    const { data: prefsRows, error: pErr } = await supabase
      .from('notification_prefs')
      .select('user_id, group_id, expense_added, settlement_added, muted_until')
      .in('user_id', candidateUserIds);

    if (pErr) throw pErr;

    const eligibleUserIds = filterRecipientsByPrefs(candidateUserIds, prefsRows || [], eventType);
    if (eligibleUserIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'All candidate recipients muted or disabled notifications' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Fetch device tokens for eligible users
    const { data: tokenRows, error: tErr } = await supabase
      .from('device_tokens')
      .select('token, user_id')
      .in('user_id', eligibleUserIds);

    if (tErr) throw tErr;

    const tokens = (tokenRows || []).map((t: any) => t.token as string);
    if (tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'No registered device tokens for eligible members' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 5. Authenticate with Google FCM HTTP v1
    const saJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_KEY');
    if (!saJson) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not configured');
    }
    const sa: ServiceAccount = JSON.parse(saJson);
    const accessToken = await getGoogleOAuth2Token(sa);

    // 6. Dispatch FCM messages in parallel
    const results: FcmDispatchResult[] = await Promise.all(
      tokens.map((token: string) =>
        sendFcmMessage(sa.project_id, accessToken, token, { title, body, route, groupId })
      )
    );

    const sentCount = results.filter((r) => r.success).length;

    // 7. Prune dead tokens (HTTP 404 or UNREGISTERED)
    const deadTokens = results
      .filter((r) => r.isDeadToken)
      .map((r) => r.token);

    let deadTokensPruned = 0;
    if (deadTokens.length > 0) {
      const { error: pruneErr } = await supabase
        .from('device_tokens')
        .delete()
        .in('token', deadTokens);

      if (!pruneErr) {
        deadTokensPruned = deadTokens.length;
      }
    }

    return new Response(
      JSON.stringify({
        sent: sentCount,
        total: tokens.length,
        deadTokensPruned,
        results,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
