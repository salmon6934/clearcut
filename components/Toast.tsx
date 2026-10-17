'use client';

// components/Toast.tsx
// 5-Second Undo Toast Notification with Animated Progress Bar
// Brew & Browse Warm Cafe Styling

import React, { useEffect, useState } from 'react';
import { haptics } from '../lib/native/haptics';

export interface ToastProps {
  message: string;
  actionText?: string;
  onAction?: () => void;
  durationMs?: number;
  onClose: () => void;
}

export function Toast({
  message,
  actionText = 'Undo',
  onAction,
  durationMs = 5000,
  onClose,
}: ToastProps) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    haptics.warning().catch(() => {});
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / durationMs) * 100);
      setProgress(remaining);
      if (elapsed >= durationMs) {
        clearInterval(interval);
        onClose();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [durationMs, onClose]);

  const handleAction = async () => {
    await haptics.tap().catch(() => {});
    if (onAction) onAction();
    onClose();
  };

  return (
    <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md animate-fadeIn pointer-events-auto">
      <div className="relative overflow-hidden rounded-2xl bg-[#543A2A] text-[#FAF6F0] shadow-lg border border-[#3E291C] px-4 py-3.5 flex items-center justify-between gap-3">
        {/* Toast Message */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-base shrink-0">🗑️</span>
          <span className="text-xs sm:text-sm font-semibold truncate text-[#FAF6F0]">
            {message}
          </span>
        </div>

        {/* Action Button */}
        {onAction && (
          <button
            type="button"
            onClick={handleAction}
            className="px-3.5 py-1.5 rounded-full bg-[#FAF6F0] text-[#543A2A] font-bold text-xs uppercase tracking-wider shrink-0 hover:bg-[#EFE4D6] transition-all active:scale-95 shadow-xs cursor-pointer"
          >
            {actionText}
          </button>
        )}

        {/* 5-second countdown progress bar */}
        <div
          className="absolute bottom-0 left-0 h-1 bg-[#D4B89B] transition-all duration-75"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
