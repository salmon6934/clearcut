'use client';

// components/Toast.tsx
// 5-Second Undo Toast Notification with Animated Progress Bar
// Implements T-2.3.1 for instant soft-delete undo workflows in Neo-Brutalist style.

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
      <div className="relative overflow-hidden rounded-xl bg-black text-white shadow-[4px_4px_0px_0px_#000] border-2 border-black px-4 py-3 flex items-center justify-between gap-3">
        {/* Toast Message */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-base shrink-0">🗑️</span>
          <span className="text-xs sm:text-sm font-mono font-black truncate text-white uppercase">
            {message}
          </span>
        </div>

        {/* Action Button */}
        {onAction && (
          <button
            type="button"
            onClick={handleAction}
            className="px-3 py-1.5 rounded-lg border-2 border-black bg-[#ccff00] text-black font-mono font-black text-xs uppercase tracking-wider shrink-0 transition active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_0px_#000]"
          >
            {actionText}
          </button>
        )}

        {/* 5-second countdown progress bar */}
        <div
          className="absolute bottom-0 left-0 h-1 bg-[#ccff00] transition-all duration-75"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
