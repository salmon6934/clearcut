'use client';

// components/GlobalToast.tsx
// Brew & Browse Warm Cafe Global Toast Notifications

import React, { useEffect, useState } from 'react';
import {
  Zap,
  WifiOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  type LucideIcon,
} from 'lucide-react';
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
        let IconComponent: LucideIcon = Zap;

        if (toast.type === 'warning') {
          bgClass = 'bg-[#FFF8EE] text-[#8C5E23] border-[#ECD3B6]';
          IconComponent = WifiOff;
        } else if (toast.type === 'success') {
          bgClass = 'bg-[#E8F0E4] text-[#2E4226] border-[#C5D9BE]';
          IconComponent = CheckCircle2;
        } else if (toast.type === 'error') {
          bgClass = 'bg-[#FCE8E6] text-[#A83232] border-[#F5C2C0]';
          IconComponent = AlertCircle;
        } else if (toast.type === 'info') {
          bgClass = 'bg-[#FAF6F0] text-[#543A2A] border-[#E5D9CC]';
          IconComponent = RefreshCw;
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto relative overflow-hidden rounded-2xl border px-4 py-3.5 shadow-lg flex items-center justify-between gap-3 transition-all animate-fadeIn ${bgClass}`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <IconComponent className="w-4 h-4 shrink-0" />
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
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
