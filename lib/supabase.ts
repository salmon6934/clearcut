import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'splitwise_auth_token',
  },
});

export interface RpcErrorDetails<T = unknown> {
  error?: string;
  server_version?: number;
  client_base_version?: number;
  server_snapshot?: T;
  [key: string]: unknown;
}

export interface ParsedRpcError<T = unknown> {
  status: number;
  code: string;
  message: string;
  isConflict: boolean;
  isRateLimited: boolean;
  isUnauthorized: boolean;
  details: RpcErrorDetails<T> | null;
  raw: unknown;
}

interface PostgrestLikeError {
  code?: string;
  error_code?: string;
  message?: string;
  status?: number;
  details?: unknown;
}

/**
 * Maps Supabase / PostgREST error to standardized application error.
 * Specifically handles PT409 (Conflict), PT429 (Rate Limited), PT400 (Bad Request), etc.
 */
export function parseRpcError<T = unknown>(error: unknown): ParsedRpcError<T> {
  const err = (error && typeof error === 'object' ? error : {}) as PostgrestLikeError;
  let status = 500;
  const code = err.code || err.error_code || 'UNKNOWN_ERROR';
  const message = err.message || 'Unknown database error';

  // PostgREST maps SQLSTATE PT409 to HTTP 409
  if (code === 'PT409' || err.status === 409 || message.includes('CONFLICT')) {
    status = 409;
  } else if (code === 'PT429' || err.status === 429 || message.includes('RATE_LIMITED')) {
    status = 429;
  } else if (code === 'PT404' || err.status === 404 || message.includes('NOT_FOUND')) {
    status = 404;
  } else if (code === 'PT400' || err.status === 400 || message.includes('INVALID_')) {
    status = 400;
  } else if (code === 'PT401' || err.status === 401 || message.includes('UNAUTHORIZED')) {
    status = 401;
  } else if (err.status && typeof err.status === 'number') {
    status = err.status;
  }

  let details: RpcErrorDetails<T> | null = null;
  if (err.details) {
    if (typeof err.details === 'string') {
      try {
        details = JSON.parse(err.details) as RpcErrorDetails<T>;
      } catch {
        details = { error: err.details };
      }
    } else if (typeof err.details === 'object') {
      details = err.details as RpcErrorDetails<T>;
    }
  }

  return {
    status,
    code,
    message,
    isConflict: status === 409,
    isRateLimited: status === 429,
    isUnauthorized: status === 401,
    details,
    raw: error,
  };
}
