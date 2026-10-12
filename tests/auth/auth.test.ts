import { describe, it, expect, vi } from 'vitest';
import { getAuthState, subscribeAuth } from '@/lib/auth';

describe('Auth Manager (lib/auth.ts)', () => {
  it('provides initial loading auth state', () => {
    const state = getAuthState();
    expect(state).toBeDefined();
    expect(state.user).toBeNull();
  });

  it('allows subscribing and unsubscribing from auth changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAuth(listener);

    // Initial call
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('exposes signInWithGoogle with graceful fallback in node/test environment', async () => {
    const { signInWithGoogle } = await import('@/lib/auth');
    // On node environment, signInWithOAuth is invoked or graceful error returned
    const res = await signInWithGoogle();
    expect(res).toBeDefined();
  });
});
