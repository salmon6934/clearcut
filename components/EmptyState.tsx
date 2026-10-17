'use client';

// components/EmptyState.tsx
// Brew & Browse Warm Cafe Empty State Component

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
      className={`flex flex-col items-center justify-center p-8 sm:p-10 text-center rounded-3xl bg-white border border-[#E5D9CC] shadow-[0_4px_20px_rgba(84,58,42,0.06)] ${className}`}
    >
      {icon ? (
        <div className="w-16 h-16 rounded-2xl bg-[#EFE4D6] text-[#543A2A] flex items-center justify-center text-3xl mb-4">
          {icon}
        </div>
      ) : (
        <div className="w-16 h-16 rounded-2xl bg-[#EFE4D6] text-[#543A2A] flex items-center justify-center text-2xl mb-4">
          ☕
        </div>
      )}

      <h3 className="text-lg font-bold text-[#432E22] tracking-tight mb-1.5">
        {title}
      </h3>
      <p className="text-xs sm:text-sm text-[#8D7868] max-w-sm leading-relaxed mb-6 font-medium">
        {description}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 w-full sm:w-auto">
        {actionText && onAction && (
          <button
            onClick={onAction}
            className="w-full sm:w-auto px-6 py-3 text-xs font-bold uppercase tracking-wider rounded-full bg-[#543A2A] hover:bg-[#432E20] active:scale-95 text-[#FAF6F0] shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>+</span> {actionText}
          </button>
        )}
        {secondaryActionText && onSecondaryAction && (
          <button
            onClick={onSecondaryAction}
            className="w-full sm:w-auto px-6 py-3 text-xs font-bold uppercase tracking-wider rounded-full bg-[#EFE4D6] hover:bg-[#E5D5C2] active:scale-95 text-[#543A2A] border border-[#E5D9CC] transition-all cursor-pointer"
          >
            {secondaryActionText}
          </button>
        )}
      </div>
    </div>
  );
}
