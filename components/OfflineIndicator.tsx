'use client';

// components/OfflineIndicator.tsx
// Warm Cafe Global Offline Banner

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
    <div className="sticky top-0 z-50 bg-[#FCE8E6] border-b border-[#F5C2C0] px-4 py-2 flex items-center justify-center gap-2 text-xs font-semibold text-[#A83232] shadow-xs">
      <span className="w-2 h-2 rounded-full bg-[#A83232] animate-pulse shrink-0" />
      <span>Offline mode — changes will be saved locally and synced once reconnected</span>
    </div>
  );
}
