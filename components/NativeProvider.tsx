'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useHardwareBackButton } from '@/lib/native/back-button';
import { initDeepLinkListener } from '@/lib/native/deeplink';

export function NativeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // Root back-button behavior
  useHardwareBackButton();

  useEffect(() => {
    const unsubscribe = initDeepLinkListener((route) => {
      router.push(route);
    });
    return unsubscribe;
  }, [router]);

  return (
    <div className="flex flex-col min-h-screen w-full max-w-md mx-auto relative select-none bg-slate-950 text-slate-100 shadow-2xl">
      {children}
    </div>
  );
}
