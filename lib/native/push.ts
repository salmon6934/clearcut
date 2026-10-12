import { isNativePlatform, getPlatform } from './platform';
import { supabase } from '../supabase';
import type {
  NotificationReceivedEvent,
  NotificationActionPerformedEvent,
} from '@capacitor-firebase/messaging';

export interface PushNotificationPayload {
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
}

export interface PushHandlers {
  onForegroundNotification?: (payload: PushNotificationPayload) => void;
  onNotificationTapped?: (route: string) => void;
}

let cachedFcmToken: string | null = null;

async function getFirebaseMessagingPlugin() {
  if (!isNativePlatform()) return null;
  try {
    const mod = await import('@capacitor-firebase/messaging');
    return mod.FirebaseMessaging;
  } catch (err) {
    console.warn('[Push] Firebase Messaging plugin not available:', err);
    return null;
  }
}

/**
 * Creates the Android native notification channel `expenses_channel`.
 * Must be created before notifications targeting this channel arrive.
 */
export async function setupNativeNotificationChannel(): Promise<void> {
  const messaging = await getFirebaseMessagingPlugin();
  if (!messaging) return;

  if (getPlatform() === 'android') {
    try {
      const channelPlugin = messaging as unknown as {
        createChannel?: (options: Record<string, unknown>) => Promise<void>;
      };
      await channelPlugin.createChannel?.({
        id: 'expenses_channel',
        name: 'Expense Updates',
        description: 'Notifications for new expenses and settlements',
        importance: 4, // HIGH
        visibility: 1, // PUBLIC
        sound: 'default',
        vibration: true,
      });
    } catch (err) {
      console.warn('[Push] Error configuring notification channel:', err);
    }
  }
}

/**
 * Requests push permissions, gets FCM device token, and registers it with Supabase.
 */
export async function registerPushToken(userId: string): Promise<string | null> {
  const messaging = await getFirebaseMessagingPlugin();
  if (!messaging) return null;

  try {
    // 1. Request notification permissions (Android 13+ POST_NOTIFICATIONS & iOS alerts)
    const permResult = await messaging.requestPermissions();
    if (permResult.receive !== 'granted') {
      console.warn('[Push] Notification permission not granted:', permResult.receive);
      return null;
    }

    // 2. Setup channel on Android
    await setupNativeNotificationChannel();

    // 3. Obtain FCM token
    const result = await messaging.getToken();
    const token = result.token;
    if (!token) return null;

    cachedFcmToken = token;

    // 4. Upsert device token in Supabase
    const platform = getPlatform();
    await supabase.from('device_tokens').upsert(
      {
        user_id: userId,
        token,
        platform,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    );

    return token;
  } catch (err) {
    console.error('[Push] Failed to register FCM token:', err);
    return null;
  }
}

/**
 * Removes the FCM token registration from Supabase on logout.
 */
export async function unregisterPushToken(userId: string): Promise<void> {
  const messaging = await getFirebaseMessagingPlugin();

  try {
    const token = cachedFcmToken;
    if (token) {
      await supabase
        .from('device_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('token', token);
    } else {
      // Delete any registered tokens for this user on this platform
      await supabase
        .from('device_tokens')
        .delete()
        .eq('user_id', userId);
    }

    if (messaging && typeof messaging.deleteToken === 'function') {
      await messaging.deleteToken();
    }
    cachedFcmToken = null;
  } catch (err) {
    console.warn('[Push] Failed to unregister device token on logout:', err);
  }
}

/**
 * Setup listeners for foreground notifications and system tray tap interactions.
 */
export async function initPushListeners(handlers: PushHandlers): Promise<() => void> {
  const messaging = await getFirebaseMessagingPlugin();
  if (!messaging) return () => {};

  const unsubs: Array<() => void> = [];

  // Foreground notification delivery
  try {
    const recvHandle = await messaging.addListener(
      'notificationReceived',
      (event: NotificationReceivedEvent) => {
        handlers.onForegroundNotification?.({
          title: event.notification?.title,
          body: event.notification?.body,
          data: event.notification?.data as Record<string, unknown> | undefined,
        });
      }
    );
    unsubs.push(() => recvHandle.remove());
  } catch (e) {
    console.warn('[Push] notificationReceived listener failed:', e);
  }

  // User tapped notification in system tray (background or killed)
  try {
    const actionHandle = await messaging.addListener(
      'notificationActionPerformed',
      (event: NotificationActionPerformedEvent) => {
        const data = event.notification?.data as Record<string, unknown> | undefined;
        let targetRoute = '/';
        if (typeof data?.route === 'string' && data.route.length > 0) {
          targetRoute = data.route;
        } else if (typeof data?.groupId === 'string' && data.groupId.length > 0) {
          targetRoute = `/group?id=${encodeURIComponent(data.groupId)}`;
        }

        handlers.onNotificationTapped?.(targetRoute);
      }
    );
    unsubs.push(() => actionHandle.remove());
  } catch (e) {
    console.warn('[Push] notificationActionPerformed listener failed:', e);
  }

  return () => {
    unsubs.forEach((unsub) => unsub());
  };
}
