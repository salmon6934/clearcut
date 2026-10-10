import { describe, it, expect } from 'vitest';
import { setupNativeNotificationChannel, initPushListeners } from '../../lib/native/push';

describe('T-0.3: FCM Push Round-Trip Spike', () => {
  it('gracefully handles non-native environments without throwing', async () => {
    // In node/vitest, native plugins are safely bypassed
    await expect(setupNativeNotificationChannel()).resolves.not.toThrow();

    const unsubscribe = await initPushListeners({
      onForegroundNotification: () => {},
      onNotificationTapped: () => {},
    });

    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });
});
