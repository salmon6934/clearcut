'use client';

// components/SettleSuggestionList.tsx
// Warm Cafe Minimal Transaction List derived from Deterministic Debt Simplification

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
      <div className="text-center py-6 px-4 rounded-3xl bg-white border border-[#E5D9CC] shadow-xs">
        <div className="w-8 h-8 rounded-full bg-[#E8F0E4] text-[#2E4226] flex items-center justify-center mx-auto mb-2 text-sm font-bold">
          ✓
        </div>
        <p className="text-xs font-bold uppercase text-[#432E22]">
          No payments needed
        </p>
        <p className="text-[11px] text-[#8D7868] mt-0.5">
          All group debts are completely settled.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-xs font-bold text-[#6E5849] uppercase tracking-wider px-1">
        <span>SUGGESTED SETTLEMENTS</span>
        <span className="px-2.5 py-0.5 rounded-full border border-[#E5D9CC] bg-[#FAF6F0] text-[10px] text-[#543A2A]">
          {suggestions.length} payment{suggestions.length > 1 ? 's' : ''}
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
              className="flex items-center justify-between p-3.5 rounded-2xl border border-[#E5D9CC] bg-white shadow-xs hover:border-[#D4B89B] transition"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-[#EFE4D6] text-[#543A2A] flex items-center justify-center text-xs font-bold shrink-0 shadow-xs">
                  {fromName.charAt(0).toUpperCase()}
                </div>

                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-[#432E22] truncate">
                    <span className={isYouDebtor ? 'font-extrabold text-[#A83232] bg-[#FCE8E6] px-1.5 py-0.5 rounded-full' : ''}>
                      {fromName}
                    </span>{' '}
                    <span className="text-[#8D7868] font-normal">→</span>{' '}
                    <span className={isYouCreditor ? 'font-extrabold text-[#2E4226] bg-[#E8F0E4] px-1.5 py-0.5 rounded-full' : ''}>
                      {toName}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-[#543A2A] mt-0.5">
                    ₹{formatMinor(sug.amountMinor, currency)}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onSettleClick(sug)}
                className="ml-3 px-3.5 py-1.5 text-xs font-bold rounded-full bg-[#543A2A] hover:bg-[#432E20] text-[#FAF6F0] shadow-xs active:scale-95 transition shrink-0 uppercase cursor-pointer"
              >
                Settle Up
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

