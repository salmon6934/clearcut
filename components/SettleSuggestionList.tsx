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
      <div className="text-center py-6 px-4 rounded-xl bg-white border-2 border-black shadow-[3px_3px_0px_0px_#000]">
        <div className="w-8 h-8 rounded border-2 border-black bg-[#ccff00] text-black flex items-center justify-center mx-auto mb-2 font-mono font-black text-sm shadow-[1px_1px_0px_0px_#000]">
          ✓
        </div>
        <p className="text-xs font-mono font-black uppercase text-black">
          NO PAYMENTS NEEDED
        </p>
        <p className="text-[11px] font-mono text-black/60 mt-0.5">
          All group debts are completely settled.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-xs font-mono font-black text-black uppercase tracking-wider px-1">
        <span>SUGGESTED SETTLEMENTS</span>
        <span className="px-2 py-0.5 rounded border border-black bg-[#ffd600] text-[10px]">
          {suggestions.length} PAYMENT{suggestions.length > 1 ? 'S' : ''}
        </span>
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
              className="flex items-center justify-between p-3 rounded-xl border-2 border-black bg-white shadow-[2px_2px_0px_0px_#000] hover:bg-[#fafaf6] transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg border-2 border-black bg-[#00e5ff] flex items-center justify-center text-xs font-mono font-black text-black shrink-0 shadow-[1px_1px_0px_0px_#000]">
                  {fromName.charAt(0).toUpperCase()}
                </div>

                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-mono font-bold text-black truncate">
                    <span className={isYouDebtor ? 'font-black bg-[#ff8a80] px-1 rounded border border-black' : ''}>
                      {fromName}
                    </span>{' '}
                    <span className="text-black/60 font-normal">→</span>{' '}
                    <span className={isYouCreditor ? 'font-black bg-[#ccff00] px-1 rounded border border-black' : ''}>
                      {toName}
                    </span>
                  </div>
                  <div className="text-xs font-mono font-black text-black">
                    ₹ {formatMinor(sug.amountMinor, currency)}
                  </div>
                </div>
              </div>

              <button
                onClick={() => onSettleClick(sug)}
                className="ml-3 px-3 py-1.5 text-xs font-mono font-black rounded-lg border-2 border-black bg-[#ccff00] text-black hover:bg-black hover:text-[#ccff00] shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition shrink-0 uppercase"
              >
                SETTLE UP
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
