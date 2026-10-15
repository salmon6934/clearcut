'use client';

// components/GlobalToast.tsx
// Global Toast Component for Neo-Brutalist Offline Prompts & Sync Alerts

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
        let bgClass = 'bg-[#ffd600] text-black';
        let icon = '⚡';

        if (toast.type === 'warning') {
          bgClass = 'bg-[#ffd600] text-black';
          icon = '📶';
        } else if (toast.type === 'success') {
          bgClass = 'bg-[#ccff00] text-black';
          icon = '✓';
        } else if (toast.type === 'error') {
          bgClass = 'bg-[#ff5c5c] text-white';
          icon = '⚠️';
        } else if (toast.type === 'info') {
          bgClass = 'bg-[#00e5ff] text-black';
          icon = '🔄';
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto relative overflow-hidden rounded-xl border-2 border-black px-4 py-3 shadow-[4px_4px_0px_0px_#000] flex items-center justify-between gap-3 transition-all animate-fadeIn ${bgClass}`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-base shrink-0 font-mono font-black">{icon}</span>
              <p className="text-xs sm:text-sm font-mono font-black leading-tight uppercase">
                {toast.message}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                haptics.tap().catch(() => {});
                toastManager.dismiss(toast.id);
              }}
              className="w-6 h-6 rounded-md border-2 border-black bg-white/30 hover:bg-white/60 flex items-center justify-center text-xs font-mono font-black shrink-0 transition active:scale-95"
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
