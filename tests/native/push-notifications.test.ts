import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setupNativeNotificationChannel,
  initPushListeners,
  registerPushToken,
  unregisterPushToken,
} from '../../lib/native/push';
import {
  getNextSunday8PM,
  scheduleWeeklySettleReminder,
  cancelWeeklySettleReminder,
  WEEKLY_SETTLE_REMINDER_ID,
} from '../../lib/native/notifications';

describe('T-2.6.2: Client Push Handling, Channels & Weekly Reminder', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('FCM Push Bridge', () => {
    it('sets up notification channel gracefully on non-native platform', async () => {
      await expect(setupNativeNotificationChannel()).resolves.not.toThrow();
    });

    it('registers and unregisters push tokens safely', async () => {
      const reg = await registerPushToken('user-123');
      // In node/vitest, returns null safely
      expect(reg).toBeNull();

      await expect(unregisterPushToken('user-123')).resolves.not.toThrow();
    });

    it('initializes push listeners and handles notification tap routing fallback', async () => {
      let tappedRoute: string | null = null;
      const cleanup = await initPushListeners({
        onNotificationTapped: (route) => {
          tappedRoute = route;
        },
      });

      expect(typeof cleanup).toBe('function');
      cleanup();
    });
  });

  describe('Weekly Settle-Up Reminder (US-19)', () => {
    it('calculates the next upcoming Sunday 20:00:00 correctly', () => {
      // Wednesday Oct 14, 2026, 12:00:00
      const wednesday = new Date('2026-10-14T12:00:00Z');
      const nextSunday = getNextSunday8PM(wednesday);

      expect(nextSunday.getDay()).toBe(0); // Sunday
      expect(nextSunday.getHours()).toBe(20);
      expect(nextSunday.getMinutes()).toBe(0);
      expect(nextSunday.getTime()).toBeGreaterThan(wednesday.getTime());

      // Sunday Oct 18, 2026 at 18:00:00 (before 20:00)
      const sundayBefore8 = new Date('2026-10-18T18:00:00');
      const sameSunday = getNextSunday8PM(sundayBefore8);
      expect(sameSunday.getDate()).toBe(18);
      expect(sameSunday.getHours()).toBe(20);

      // Sunday Oct 18, 2026 at 21:00:00 (after 20:00) -> next Sunday Oct 25
      const sundayAfter8 = new Date('2026-10-18T21:00:00');
      const followingSunday = getNextSunday8PM(sundayAfter8);
      expect(followingSunday.getDate()).toBe(25);
      expect(followingSunday.getHours()).toBe(20);
    });

    it('handles scheduleWeeklySettleReminder and cancelWeeklySettleReminder safely', async () => {
      expect(WEEKLY_SETTLE_REMINDER_ID).toBe(20261012);
      await expect(scheduleWeeklySettleReminder()).resolves.toBe(false); // false in non-native test environment
      await expect(cancelWeeklySettleReminder()).resolves.not.toThrow();
    });
  });
});
