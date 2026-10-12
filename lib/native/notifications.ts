import { isNativePlatform } from './platform';

export const WEEKLY_SETTLE_REMINDER_ID = 20261012;

export interface LocalNotificationOptions {
  id: number;
  title: string;
  body: string;
  scheduleAt?: Date;
  extra?: Record<string, unknown>;
}

export const localNotifications = {
  async requestPermissions(): Promise<boolean> {
    if (!isNativePlatform()) return false;
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const res = await LocalNotifications.requestPermissions();
      return res.display === 'granted';
    } catch {
      return false;
    }
  },

  async scheduleNotification(options: LocalNotificationOptions): Promise<void> {
    if (!isNativePlatform()) return;
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.schedule({
        notifications: [
          {
            id: options.id,
            title: options.title,
            body: options.body,
            schedule: options.scheduleAt ? { at: options.scheduleAt } : undefined,
            extra: options.extra,
          },
        ],
      });
    } catch {
      // Graceful fallback
    }
  },

  async cancelNotification(id: number): Promise<void> {
    if (!isNativePlatform()) return;
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.cancel({ notifications: [{ id }] });
    } catch {
      // Graceful fallback
    }
  },
};

/**
 * Calculates the next upcoming Sunday 20:00:00 local time.
 */
export function getNextSunday8PM(from = new Date()): Date {
  const date = new Date(from);
  const currentDay = date.getDay(); // 0 is Sunday
  const daysUntilSunday = (7 - currentDay) % 7;

  date.setDate(date.getDate() + daysUntilSunday);
  date.setHours(20, 0, 0, 0);

  // If today is Sunday and it's already past 20:00, advance to next Sunday
  if (daysUntilSunday === 0 && from.getTime() >= date.getTime()) {
    date.setDate(date.getDate() + 7);
  }

  return date;
}

/**
 * Schedules a weekly recurring local notification for Sundays at 20:00 local time (US-19).
 */
export async function scheduleWeeklySettleReminder(): Promise<boolean> {
  if (!isNativePlatform()) return false;

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return false;

    // First cancel any existing reminder to prevent duplicate schedules
    await LocalNotifications.cancel({ notifications: [{ id: WEEKLY_SETTLE_REMINDER_ID }] });

    const nextSunday = getNextSunday8PM();

    await LocalNotifications.schedule({
      notifications: [
        {
          id: WEEKLY_SETTLE_REMINDER_ID,
          title: 'Weekly Settle-Up Reminder',
          body: 'Sunday check-in: review your balances and settle up outstanding debts.',
          schedule: {
            on: { weekday: 1, hour: 20, minute: 0 }, // 1 is Sunday in standard Calendar specs
            repeats: true,
            allowWhileIdle: true,
          },
          extra: {
            route: '/settle',
          },
        },
      ],
    });

    return true;
  } catch (err) {
    console.warn('[LocalNotifications] Failed to schedule weekly reminder:', err);
    return false;
  }
}

/**
 * Cancels the weekly settle-up reminder on sign-out or settings change.
 */
export async function cancelWeeklySettleReminder(): Promise<void> {
  await localNotifications.cancelNotification(WEEKLY_SETTLE_REMINDER_ID);
}

/**
 * Registers a listener for local notification tap actions.
 */
export async function initLocalNotificationListeners(
  onNotificationTapped: (route: string) => void
): Promise<() => void> {
  if (!isNativePlatform()) return () => {};

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const handle = await LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (notification) => {
        const extra = notification.notification?.extra as Record<string, unknown> | undefined;
        const route = typeof extra?.route === 'string' ? extra.route : '/settle';
        onNotificationTapped(route);
      }
    );
    return () => {
      handle.remove();
    };
  } catch {
    return () => {};
  }
}
