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

async function fetchProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) {
      // Fallback: return default profile structure
      return {
        id: userId,
        displayName: currentAuthState.user?.email?.split('@')[0] || 'User',
        defaultCurrency: 'INR',
      };
    }

    return {
      id: data.id,
      displayName: data.display_name,
      avatarUrl: data.avatar_url,
      defaultCurrency: data.default_currency || 'INR',
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch {
    return {
      id: userId,
      displayName: currentAuthState.user?.email?.split('@')[0] || 'User',
      defaultCurrency: 'INR',
    };
  }
}

/**
 * Initializes Supabase session watcher and Capacitor App state listeners.
 */
export function initAuth(): () => void {
  // 1. Initial session load
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    const user = session?.user ?? null;
    let profile: Profile | null = null;
    if (user) {
      profile = await fetchProfile(user.id);
      registerPushToken(user.id).catch(() => {});
      scheduleWeeklySettleReminder().catch(() => {});
    }
    currentAuthState = {
      user,
      profile,
      session,
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
      profile = await fetchProfile(user.id);
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        registerPushToken(user.id).catch(() => {});
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
 * Verify 6-digit OTP code.
 */
export async function verifyOtp(
  email: string,
  token: string
): Promise<{ session: Session | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type: 'email',
    });

    if (error) {
      return { session: null, error: new Error(error.message) };
    }

    return { session: data.session, error: null };
  } catch (err) {
    return { session: null, error: err as Error };
  }
}

/**
 * Sign out and wipe namespaced local user data.
 */
export async function signOut(): Promise<void> {
  const userId = currentAuthState.user?.id;
  try {
    if (userId) {
      await unregisterPushToken(userId);
    }
    await cancelWeeklySettleReminder();
    await supabase.auth.signOut();
  } catch {
    // Graceful fallback
  }

  if (userId) {
    const userStorage = new LocalStorageAdapter(userId);
    userStorage.clear();
  }

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
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        display_name: displayName.trim(),
        default_currency: defaultCurrency.toUpperCase(),
        updated_at: new Date().toISOString(),
      });

    if (!error) {
      currentAuthState = {
        ...currentAuthState,
        profile: {
          ...currentAuthState.profile,
          id: user.id,
          displayName: displayName.trim(),
          defaultCurrency: defaultCurrency.toUpperCase(),
        },
      };
      notifyListeners();
    }

    return { error: error ? new Error(error.message) : null };
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
    // 1. Unregister native push token & cancel reminders
    await unregisterPushToken(userId).catch(() => {});
    await cancelWeeklySettleReminder().catch(() => {});

    // 2. Call delete_account_v1 RPC
    const { error } = await supabase.rpc('delete_account_v1');
    if (error) {
      return { error: new Error(error.message) };
    }

    // 3. Clear local storage namespace
    const userStorage = new LocalStorageAdapter(userId);
    userStorage.clear();

    // 4. Sign out
    try {
      await supabase.auth.signOut();
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
  } catch (err) {
    return { error: err as Error };
  }
}

