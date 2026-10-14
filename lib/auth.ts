import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { isNativePlatform } from './native/platform';
import { LocalStorageAdapter } from './data/storage-adapter';
import { registerPushToken, unregisterPushToken } from './native/push';
import { scheduleWeeklySettleReminder, cancelWeeklySettleReminder } from './native/notifications';
import type { Profile } from './data/types';

export interface AuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  isLoading: boolean;
}

type AuthListener = (state: AuthState) => void;

let currentAuthState: AuthState = {
  user: null,
  profile: null,
  session: null,
  isLoading: true,
};

const listeners = new Set<AuthListener>();

export function getAuthState(): AuthState {
  return currentAuthState;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(currentAuthState);

  useEffect(() => {
    return subscribeAuth(setState);
  }, []);

  return state;
}

export function _setAuthStateForTesting(state: AuthState): void {
  currentAuthState = state;
}

function notifyListeners() {
  for (const listener of listeners) {
    listener(currentAuthState);
  }
}

export function subscribeAuth(listener: AuthListener): () => void {
  listeners.add(listener);
  listener(currentAuthState);
  return () => {
    listeners.delete(listener);
  };
}

async function fetchProfile(userId: string, user?: User | null): Promise<Profile | null> {
  const u = user || currentAuthState.user;
  const meta = u?.user_metadata || {};
  const metaName = meta.display_name || meta.full_name || meta.name;
  const emailName = u?.email ? u.email.split('@')[0] : '';
  const fallbackName = metaName || emailName || 'User';

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) {
      return {
        id: userId,
        displayName: fallbackName,
        avatarUrl: meta.avatar_url || meta.picture,
        defaultCurrency: 'INR',
      };
    }

    return {
      id: data.id,
      displayName: data.display_name || fallbackName,
      avatarUrl: data.avatar_url || meta.avatar_url || meta.picture,
      defaultCurrency: data.default_currency || 'INR',
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch {
    return {
      id: userId,
      displayName: fallbackName,
      avatarUrl: meta.avatar_url || meta.picture,
      defaultCurrency: 'INR',
    };
  }
}

/**
 * Initializes Supabase session watcher and Capacitor App state listeners.
 */
export function initAuth(): () => void {
  // 1. Initial session load
  supabase.auth
    .getSession()
    .then(async ({ data: { session } }) => {
      const user = session?.user ?? null;
      let profile: Profile | null = null;
      if (user) {
        profile = await fetchProfile(user.id, user);
        registerPushToken(user.id).catch((e) => console.warn('[Auth] Push registration warning:', e));
        scheduleWeeklySettleReminder().catch(() => {});
      }
      currentAuthState = {
        user,
        profile,
        session,
        isLoading: false,
      };
      notifyListeners();
    })
    .catch(() => {
      currentAuthState = {
        ...currentAuthState,
        isLoading: false,
      };
      notifyListeners();
    });

  // 2. Auth state change listener
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (event, session) => {
    const user = session?.user ?? null;
    let profile: Profile | null = null;

    if (user) {
      profile = await fetchProfile(user.id, user);
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        registerPushToken(user.id).catch((e) => console.warn('[Auth] Push registration warning:', e));
        scheduleWeeklySettleReminder().catch(() => {});
      }
    }

    currentAuthState = {
      user,
      profile,
      session,
      isLoading: false,
    };
    notifyListeners();
  });

  // 3. Capacitor appStateChange: pause autoRefresh in background, resume in foreground
  let appStateCleanup = () => {};
  if (isNativePlatform()) {
    import('@capacitor/app').then(({ App }) => {
      const handlePromise = App.addListener('appStateChange', (state) => {
        if (state.isActive) {
          supabase.auth.startAutoRefresh();
        } else {
          supabase.auth.stopAutoRefresh();
        }
      });
      appStateCleanup = () => {
        handlePromise.then((h) => h.remove());
      };
    });
  }

  return () => {
    subscription.unsubscribe();
    appStateCleanup();
  };
}

/**
 * Sign in using Native Google Sign-In on mobile devices, or OAuth on web (T-2.8.1).
 */
export async function signInWithGoogle(): Promise<{ session: Session | null; error: Error | null }> {
  try {
    if (isNativePlatform()) {
      const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
      try {
        await GoogleAuth.initialize({
          clientId: clientId || undefined,
          scopes: ['profile', 'email'],
          grantOfflineAccess: false,
        });
      } catch {
        // already initialized
      }

      const googleUser = await GoogleAuth.signIn();
      const idToken = googleUser?.authentication?.idToken;
      if (!idToken) {
        return { session: null, error: new Error('No ID token received from Google Play Services') };
      }

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });

      if (error) {
        return { session: null, error: new Error(error.message) };
      }

      if (data.session) {
        const user = data.session.user;
        const profile = await fetchProfile(user.id, user);
      registerPushToken(user.id).catch((e) => console.warn('[Auth] Push registration warning:', e));
        scheduleWeeklySettleReminder().catch(() => {});
        currentAuthState = {
          user,
          profile,
          session: data.session,
          isLoading: false,
        };
        notifyListeners();
      }

      return { session: data.session, error: null };
    } else {
      // Web / desktop browser fallback
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth` : undefined,
        },
      });

      if (error) {
        return { session: null, error: new Error(error.message) };
      }

      return { session: null, error: null };
    }
  } catch (err: any) {
    return { session: null, error: err as Error };
  }
}

/**
 * Send 6-digit OTP code to email.
 */
export async function signInWithOtp(email: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: true,
      },
    });
    return { error: error ? new Error(error.message) : null };
  } catch (err) {
    return { error: err as Error };
  }
}

/**
 * Verify 6-digit OTP code (supports both existing-user 'email' and new-user 'signup' tokens).
 */
export async function verifyOtp(
  email: string,
  token: string
): Promise<{ session: Session | null; error: Error | null }> {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const cleanToken = token.trim();

    // 1. Try 'email' token type first (passwordless login)
    let res = await supabase.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: 'email',
    });

    // 2. Fallback to 'signup' token type (new user confirm signup token)
    if (res.error || !res.data.session) {
      const signupRes = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanToken,
        type: 'signup',
      });
      if (!signupRes.error && signupRes.data.session) {
        res = signupRes;
      }
    }

    if (res.error) {
      return { session: null, error: new Error(res.error.message) };
    }

    if (res.data.session) {
      const user = res.data.session.user;
      const profile = await fetchProfile(user.id, user);
      registerPushToken(user.id).catch((e) => console.warn('[Auth] Push registration warning:', e));
      scheduleWeeklySettleReminder().catch(() => {});
      currentAuthState = {
        user,
        profile,
        session: res.data.session,
        isLoading: false,
      };
      notifyListeners();
    }

    return { session: res.data.session, error: null };
  } catch (err) {
    return { session: null, error: err as Error };
  }
}

/**
 * Sign out and wipe namespaced local user data.
 */
export async function signOut(): Promise<void> {
  const userId = currentAuthState.user?.id;

  // 1. Non-blocking push and local notification cleanup
  if (userId) {
    unregisterPushToken(userId).catch(() => {});
  }
  cancelWeeklySettleReminder().catch(() => {});

  // 2. Sign out from Supabase with 2.5-second timeout
  try {
    await Promise.race([
      supabase.auth.signOut(),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch {
    // Graceful fallback
  }

  // 3. Clear local storage
  if (userId) {
    const userStorage = new LocalStorageAdapter(userId);
    userStorage.clear();
  }

  // 4. Update reactive state and notify listeners
  currentAuthState = {
    user: null,
    profile: null,
    session: null,
    isLoading: false,
  };
  notifyListeners();
}

/**
 * Update current user profile display name or default currency.
 */
export async function updateProfile(
  displayName: string,
  defaultCurrency = 'INR'
): Promise<{ error: Error | null }> {
  const user = currentAuthState.user;
  if (!user) return { error: new Error('User not authenticated') };

  try {
    const trimmedName = displayName.trim();
    const currency = defaultCurrency.toUpperCase();
    const now = new Date().toISOString();

    // 1. Update Supabase Auth user_metadata directly (always permitted for logged-in user)
    await supabase.auth
      .updateUser({
        data: {
          display_name: trimmedName,
          full_name: trimmedName,
        },
      })
      .catch(() => {});

    // 2. Try updating existing profile row first (profiles_update_policy allows this)
    const { data: updateData, error: updateError } = await supabase
      .from('profiles')
      .update({
        display_name: trimmedName,
        default_currency: currency,
        updated_at: now,
      })
      .eq('id', user.id)
      .select();

    // 3. If no row existed yet, attempt upsert/insert
    if (!updateError && (!updateData || updateData.length === 0)) {
      try {
        await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            display_name: trimmedName,
            default_currency: currency,
            updated_at: now,
          });
      } catch {
        // Fallback gracefully if table RLS prevents insert before migration is applied
      }
    }

    currentAuthState = {
      ...currentAuthState,
      profile: {
        ...currentAuthState.profile,
        id: user.id,
        displayName: trimmedName,
        defaultCurrency: currency,
      },
    };
    notifyListeners();

    return { error: null };
  } catch (err) {
    return { error: err as Error };
  }
}

/**
 * GDPR & Apple Store compliant permanent account deletion (T-2.10.2).
 * Anonymizes group ledger records into placeholder members, deletes auth & profile, and clears local data.
 */
export async function deleteAccount(): Promise<{ error: Error | null }> {
  const userId = currentAuthState.user?.id;
  if (!userId) {
    return { error: new Error('User not authenticated') };
  }

  try {
    // 1. Non-blocking push cleanup and local notification cancel
    unregisterPushToken(userId).catch(() => {});
    cancelWeeklySettleReminder().catch(() => {});

    // 2. Call delete_account_v1 RPC with 10-second timeout
    const rpcPromise = supabase.rpc('delete_account_v1');
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((_, reject) =>
      setTimeout(() => reject(new Error('Account deletion timed out. Check network or database connection.')), 10000)
    );

    const { error } = await Promise.race([rpcPromise, timeoutPromise]);
    if (error) {
      return { error: new Error(error.message) };
    }

    // 3. Clear local storage namespace
    const userStorage = new LocalStorageAdapter(userId);
    userStorage.clear();

    // 4. Sign out
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch {
      // Ignored
    }

    currentAuthState = {
      user: null,
      profile: null,
      session: null,
      isLoading: false,
    };
    notifyListeners();

    return { error: null };
  } catch (err: any) {
    return { error: (err as Error) || new Error('Account deletion failed') };
  }
}

