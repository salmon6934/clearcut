'use client';

// components/SettleSuggestionList.tsx
// Minimal Transaction List derived from Deterministic Debt Simplification

import React from 'react';
import type { SuggestedPayment, Member } from '../lib/data/types';
import { formatMinor } from '../lib/engine/money';

interface SettleSuggestionListProps {
  suggestions: SuggestedPayment[];
  members: Member[];
  currency: string;
  currentUserId?: string;
  onSettleClick: (suggestion: SuggestedPayment) => void;
}

export function SettleSuggestionList({
  suggestions,
  members,
  currency,
  currentUserId,
  onSettleClick,
}: SettleSuggestionListProps) {
  const memberMap = new Map<string, Member>();
  for (const m of members) {
    memberMap.set(m.id, m);
  }

  const getMemberName = (id: string) => {
    const m = memberMap.get(id);
    if (!m) return 'Unknown';
    if (currentUserId && m.userId === currentUserId) return 'You';
    return m.displayName;
  };

  if (suggestions.length === 0) {
    return (
      <div className="text-center py-8 px-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/40 border border-dashed border-zinc-200 dark:border-zinc-800">
        <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          No payments needed
        </p>
        <p className="text-xs text-zinc-400 mt-0.5">
          All group debts are completely settled.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 uppercase tracking-wider px-1">
        <span>Suggested Settlements</span>
        <span>{suggestions.length} payment{suggestions.length > 1 ? 's' : ''}</span>
      </div>

      <div className="space-y-2">
        {suggestions.map((sug, idx) => {
          const fromName = getMemberName(sug.fromMemberId);
          const toName = getMemberName(sug.toMemberId);
          const isYouDebtor = fromName === 'You';
          const isYouCreditor = toName === 'You';

          return (
            <div
              key={`${sug.fromMemberId}-${sug.toMemberId}-${idx}`}
              className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-300 shrink-0">
                  {fromName.charAt(0).toUpperCase()}
                </div>

                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    <span className={isYouDebtor ? 'font-bold text-orange-600 dark:text-orange-400' : ''}>
                      {fromName}
                    </span>{' '}
                    <span className="text-zinc-400 font-normal">owes</span>{' '}
                    <span className={isYouCreditor ? 'font-bold text-emerald-600 dark:text-emerald-400' : ''}>
                      {toName}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400 font-mono">
                    {formatMinor(sug.amountMinor, currency)}
                  </div>
                </div>
              </div>

              <button
                onClick={() => onSettleClick(sug)}
                className="ml-3 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-sm transition-all shrink-0"
              >
                Settle up
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
