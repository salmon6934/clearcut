'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useHardwareBackButton } from '@/lib/native/back-button';
import { initDeepLinkListener } from '@/lib/native/deeplink';
import { initPushListeners } from '@/lib/native/push';
import { initLocalNotificationListeners } from '@/lib/native/notifications';

export function NativeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // Root back-button behavior
  useHardwareBackButton();

  useEffect(() => {
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
      unsubDeep();
      unsubPush();
      unsubLocal();
    };
  }, [router]);

  return (
    <div className="flex flex-col min-h-screen w-full max-w-md mx-auto relative select-none bg-slate-950 text-slate-100 shadow-2xl">
      {children}
    </div>
  );
}
