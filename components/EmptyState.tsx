'use client';

// components/EmptyState.tsx
// Neo-Brutalist Empty State Component

import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  secondaryActionText?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionText,
  onAction,
  secondaryActionText,
  onSecondaryAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-10 text-center rounded-2xl bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000] ${className}`}
    >
      {icon ? (
        <div className="w-16 h-16 rounded-xl border-2 border-black bg-[#ccff00] flex items-center justify-center text-3xl mb-4 shadow-[2px_2px_0px_0px_#000]">
          {icon}
        </div>
      ) : (
        <div className="w-16 h-16 rounded-xl border-2 border-black bg-[#ccff00] flex items-center justify-center text-2xl text-black mb-4 shadow-[2px_2px_0px_0px_#000]">
          ✨
        </div>
      )}

      <h3 className="text-lg font-black text-black uppercase tracking-tight mb-1.5 font-mono">
        {title}
      </h3>
      <p className="text-xs sm:text-sm text-black/60 max-w-sm leading-relaxed mb-6 font-mono font-bold">
        {description}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 w-full sm:w-auto">
        {actionText && onAction && (
          <button
            onClick={onAction}
            className="w-full sm:w-auto px-5 py-3 text-xs font-black uppercase tracking-wider rounded-xl bg-[#ccff00] hover:bg-[#bbf000] active:translate-x-0.5 active:translate-y-0.5 text-black border-2 border-black shadow-[3px_3px_0px_0px_#000] transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>+</span> {actionText}
          </button>
        )}
        {secondaryActionText && onSecondaryAction && (
          <button
            onClick={onSecondaryAction}
            className="w-full sm:w-auto px-5 py-3 text-xs font-black uppercase tracking-wider rounded-xl bg-white hover:bg-[#ffd600] active:translate-x-0.5 active:translate-y-0.5 text-black border-2 border-black shadow-[3px_3px_0px_0px_#000] transition-all cursor-pointer"
          >
            {secondaryActionText}
          </button>
        )}
      </div>
    </div>
  );
}
