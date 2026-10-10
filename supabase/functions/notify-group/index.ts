// supabase/functions/notify-group/index.ts
// Supabase Edge Function (Deno runtime) for FCM HTTP v1 notification dispatch

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as jose from 'https://deno.land/x/jose@v4.14.4/index.ts';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
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
 * Dispatch an FCM HTTP v1 push notification
 */
export async function sendFcmMessage(
  projectId: string,
  accessToken: string,
  token: string,
  payload: { title: string; body: string; route?: string; groupId?: string }
): Promise<{ success: boolean; status?: number; error?: string }> {
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
    return { success: false, status: resp.status, error: err };
  }

  return { success: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { groupId, title, body, route, excludeUserId } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // 1. Fetch group members excluding actor
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

    const userIds = (members || []).map((m: any) => m.user_id);
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'No recipient members' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch device tokens
    const { data: tokenRows, error: tErr } = await supabase
      .from('device_tokens')
      .select('token, user_id')
      .in('user_id', userIds);

    if (tErr) throw tErr;

    const tokens = (tokenRows || []).map((t: any) => t.token);
    if (tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'No active device tokens' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Authenticate with Google
    const saJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_KEY');
    if (!saJson) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not configured');
    }
    const sa: ServiceAccount = JSON.parse(saJson);
    const accessToken = await getGoogleOAuth2Token(sa);

    // 4. Dispatch messages
    const results = await Promise.all(
      tokens.map((token: string) =>
        sendFcmMessage(sa.project_id, accessToken, token, { title, body, route, groupId })
      )
    );

    const sentCount = results.filter((r) => r.success).length;

    return new Response(
      JSON.stringify({
        sent: sentCount,
        total: tokens.length,
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
