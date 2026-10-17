'use client';

// components/GlobalToast.tsx
// Brew & Browse Warm Cafe Global Toast Notifications

import React, { useEffect, useState } from 'react';
import { toastManager, type ToastItem } from '@/lib/ui/toast';
import { haptics } from '@/lib/native/haptics';

export function GlobalToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return toastManager.subscribe((items) => {
      setToasts(items);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[9999] w-[92%] max-w-md pointer-events-none flex flex-col gap-2">
      {toasts.map((toast) => {
        let bgClass = 'bg-[#FAF6F0] text-[#543A2A] border-[#E5D9CC]';
        let icon = '⚡';

        if (toast.type === 'warning') {
          bgClass = 'bg-[#FFF8EE] text-[#8C5E23] border-[#ECD3B6]';
          icon = '📶';
        } else if (toast.type === 'success') {
          bgClass = 'bg-[#E8F0E4] text-[#2E4226] border-[#C5D9BE]';
          icon = '✓';
        } else if (toast.type === 'error') {
          bgClass = 'bg-[#FCE8E6] text-[#A83232] border-[#F5C2C0]';
          icon = '⚠️';
        } else if (toast.type === 'info') {
          bgClass = 'bg-[#FAF6F0] text-[#543A2A] border-[#E5D9CC]';
          icon = '🔄';
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto relative overflow-hidden rounded-2xl border px-4 py-3.5 shadow-lg flex items-center justify-between gap-3 transition-all animate-fadeIn ${bgClass}`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-base shrink-0 font-bold">{icon}</span>
              <p className="text-xs sm:text-sm font-semibold leading-tight">
                {toast.message}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                haptics.tap().catch(() => {});
                toastManager.dismiss(toast.id);
              }}
              className="w-6 h-6 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-xs font-bold shrink-0 transition active:scale-95 cursor-pointer"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
