import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteAccount, getAuthState, _setAuthStateForTesting } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

vi.mock('../../lib/native/push', () => ({
  unregisterPushToken: vi.fn().mockResolvedValue(undefined),
  registerPushToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/native/notifications', () => ({
  cancelWeeklySettleReminder: vi.fn().mockResolvedValue(undefined),
  scheduleWeeklySettleReminder: vi.fn().mockResolvedValue(undefined),
}));

describe('Account Deletion & GDPR Compliance (T-2.10.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects deletion if no authenticated user session exists', async () => {
    const res = await deleteAccount();
    expect(res.error).toBeDefined();
    expect(res.error?.message).toContain('User not authenticated');
  });

  it('calls delete_account_v1 RPC and wipes session when user is authenticated', async () => {
    // Inject mock user into auth state
    _setAuthStateForTesting({
      user: { id: 'usr-delete-123', email: 'delete@test.com' } as any,
      profile: { id: 'usr-delete-123', displayName: 'To Delete', defaultCurrency: 'INR' },
      session: { access_token: 'fake' } as any,
      isLoading: false,
    });

    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { success: true },
      error: null,
    } as any);

    const res = await deleteAccount();

    expect(supabase.rpc).toHaveBeenCalledWith('delete_account_v1');
    expect(res.error).toBeNull();
    expect(getAuthState().user).toBeNull();
  });
});
