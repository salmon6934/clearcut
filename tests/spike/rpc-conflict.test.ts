import { describe, it, expect } from 'vitest';
import { parseRpcError } from '../../lib/supabase';

interface SpikeExpense {
  id: string;
  title: string;
  amount_minor: number;
  version: number;
}

describe('T-0.2: Supabase RPC Concurrency & PT409 Mapping Spike', () => {
  it('correctly maps PT409 SQLSTATE with JSON details to HTTP 409 and server snapshot', () => {
    const mockPostgrestError = {
      code: 'PT409',
      message: 'EXPENSE_CONFLICT',
      details: JSON.stringify({
        error: 'VERSION_MISMATCH',
        server_version: 3,
        client_base_version: 2,
        server_snapshot: {
          id: '11111111-1111-1111-1111-111111111111',
          title: 'Dinner at Taj',
          amount_minor: 450000,
          version: 3,
        },
      }),
      hint: null,
    };

    const parsed = parseRpcError<SpikeExpense>(mockPostgrestError);

    expect(parsed.status).toBe(409);
    expect(parsed.isConflict).toBe(true);
    expect(parsed.code).toBe('PT409');
    expect(parsed.message).toBe('EXPENSE_CONFLICT');
    expect(parsed.details).not.toBeNull();
    expect(parsed.details?.server_version).toBe(3);
    expect(parsed.details?.client_base_version).toBe(2);
    expect(parsed.details?.server_snapshot?.amount_minor).toBe(450000);
  });

  it('correctly maps PT429 to HTTP 429 rate limit', () => {
    const mockError = {
      code: 'PT429',
      message: 'RATE_LIMITED',
      details: JSON.stringify({ retry_after_seconds: 60 }),
    };

    const parsed = parseRpcError(mockError);
    expect(parsed.status).toBe(429);
    expect(parsed.isRateLimited).toBe(true);
    expect(parsed.details?.retry_after_seconds).toBe(60);
  });

  it('correctly maps PT400 invalid amount error', () => {
    const mockError = {
      code: 'PT400',
      message: 'INVALID_AMOUNT',
      details: JSON.stringify({ error: 'Amount must be > 0', amount_minor: 0 }),
    };

    const parsed = parseRpcError(mockError);
    expect(parsed.status).toBe(400);
    expect(parsed.isConflict).toBe(false);
    expect(parsed.details?.amount_minor).toBe(0);
  });
});
