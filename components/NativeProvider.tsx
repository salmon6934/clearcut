'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useHardwareBackButton } from '@/lib/native/back-button';
import { initDeepLinkListener } from '@/lib/native/deeplink';
import { initPushListeners } from '@/lib/native/push';
import { initLocalNotificationListeners } from '@/lib/native/notifications';
import { initAuth } from '@/lib/auth';
import { AuthGuard } from './AuthGuard';

export function NativeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // Root back-button behavior
  useHardwareBackButton();

  useEffect(() => {
    // 0. Initialize global Supabase Auth session watcher
    const unsubAuth = initAuth();

    // 1. Deep link listener (splitapp:// scheme)
    const unsubDeep = initDeepLinkListener((route) => {
      router.push(route);
    });

    // 2. FCM Push notification listeners (tap navigation)
    let unsubPush = () => {};
    initPushListeners({
      onNotificationTapped: (route) => {
        if (route) router.push(route);
      },
    }).then((cleanup) => {
      unsubPush = cleanup;
    });

    // 3. Local notification listener (weekly settle-up reminder tap)
    let unsubLocal = () => {};
    initLocalNotificationListeners((route) => {
      if (route) router.push(route);
    }).then((cleanup) => {
      unsubLocal = cleanup;
    });

    return () => {
      unsubAuth();
      unsubDeep();
      unsubPush();
      unsubLocal();
    };
  }, [router]);

  return (
    <div className="flex flex-col min-h-screen w-full max-w-xl mx-auto relative select-none bg-[#f5f5f0] text-black">
      <AuthGuard>{children}</AuthGuard>
    </div>
  );
}
