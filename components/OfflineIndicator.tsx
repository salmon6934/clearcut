'use client';

// components/OfflineIndicator.tsx
// Neo-Brutalist Global Offline Banner

import React, { useState, useEffect } from 'react';
import { isDeviceOnline } from '../lib/sync/lifecycle';

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(isDeviceOnline());

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="sticky top-0 z-50 bg-[#ffd600] border-b-2 border-black px-4 py-1.5 flex items-center justify-center gap-2 text-[11px] font-mono font-black uppercase tracking-wider text-black shadow-[0_2px_0_0_#000]">
      <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse shrink-0 border border-black" />
      <span>YOU ARE OFFLINE — CHANGES WILL SAVE LOCALLY</span>
    </div>
  );
}
