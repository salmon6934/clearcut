import { isNativePlatform } from './platform';

export const haptics = {
  async tap(): Promise<void> {
    if (!isNativePlatform()) return;
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // Graceful fallback
    }
  },

  async success(): Promise<void> {
    if (!isNativePlatform()) return;
    try {
      const { Haptics, NotificationType } = await import('@capacitor/haptics');
      await Haptics.notification({ type: NotificationType.Success });
    } catch {
      // Graceful fallback
    }
  },

  async warning(): Promise<void> {
    if (!isNativePlatform()) return;
    try {
      const { Haptics, NotificationType } = await import('@capacitor/haptics');
      await Haptics.notification({ type: NotificationType.Warning });
    } catch {
      // Graceful fallback
    }
  },

  async error(): Promise<void> {
    if (!isNativePlatform()) return;
    try {
      const { Haptics, NotificationType } = await import('@capacitor/haptics');
      await Haptics.notification({ type: NotificationType.Error });
    } catch {
      // Graceful fallback
    }
  },
};
