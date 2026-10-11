'use client';

// components/Toast.tsx
// 5-Second Undo Toast Notification with Animated Progress Bar
// Implements T-2.3.1 for instant soft-delete undo workflows.

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
    <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md animate-in slide-in-from-bottom-5 fade-in duration-200 pointer-events-auto">
      <div className="relative overflow-hidden rounded-2xl bg-zinc-900/95 dark:bg-zinc-800/95 text-white shadow-2xl border border-zinc-700/60 backdrop-blur-md px-4 py-3 flex items-center justify-between gap-3">
        {/* Toast Message */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-base shrink-0">🗑️</span>
          <span className="text-xs sm:text-sm font-medium truncate text-zinc-100">
            {message}
          </span>
        </div>

        {/* Action Button */}
        {onAction && (
          <button
            type="button"
            onClick={handleAction}
            className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs uppercase tracking-wider shrink-0 transition active:scale-95 shadow-sm"
          >
            {actionText}
          </button>
        )}

        {/* 5-second countdown progress bar */}
        <div
          className="absolute bottom-0 left-0 h-0.5 bg-emerald-500 transition-all duration-75"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
