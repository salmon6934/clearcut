import { isNativePlatform } from './platform';

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

  async scheduleNotification(options: {
    id: number;
    title: string;
    body: string;
    scheduleAt?: Date;
    extra?: Record<string, unknown>;
  }): Promise<void> {
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
