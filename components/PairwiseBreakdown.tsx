'use client';

// components/PairwiseBreakdown.tsx
// Warm Cafe Pairwise Debt Breakdown & Debt Simplification

import React, { useState } from 'react';
import type { PairwiseDebt } from '../lib/engine/balances';
import type { SuggestedPayment } from '../lib/data/types';
import type { Member } from '../lib/data/types';
import { formatMinor } from '../lib/engine/money';

export interface PairwiseBreakdownProps {
  pairwiseDebts: PairwiseDebt[];
  suggestedPayments: SuggestedPayment[];
  members: Member[];
  currency: string;
  currentMemberId?: string;
  onSettleUp?: (fromMemberId: string, toMemberId: string, amountMinor: number) => void;
}

export function PairwiseBreakdown({
  pairwiseDebts,
  suggestedPayments,
  members,
  currency,
  currentMemberId,
  onSettleUp,
}: PairwiseBreakdownProps) {
  const [viewMode, setViewMode] = useState<'simplified' | 'pairwise'>('simplified');

  const memberMap = new Map<string, Member>();
  for (const m of members) {
    memberMap.set(m.id, m);
  }

  const getMemberName = (id: string) => {
    if (id === currentMemberId) return 'You';
    return memberMap.get(id)?.displayName || 'Unknown';
  };

  const getMemberInitial = (id: string) => {
    const name = memberMap.get(id)?.displayName || '?';
    return name.charAt(0).toUpperCase();
  };

  const isSimplified = viewMode === 'simplified';
  const currentList = isSimplified ? suggestedPayments : pairwiseDebts;
  const isAllSettled = currentList.length === 0;

  return (
    <div className="bg-white border border-[#E5D9CC] rounded-3xl p-5 shadow-xs space-y-4">
      {/* Header & Tab Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#432E22] flex items-center gap-2">
            <span>⚖️</span>
            <span>Debt Simplification</span>
          </h3>
          <p className="text-xs text-[#8D7868] mt-0.5">
            {isSimplified
              ? 'Minimizes the total number of transfers needed'
              : 'Direct pairwise balances between members'}
          </p>
        </div>

        {/* View mode toggle */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-full bg-[#EFE4D6] border border-[#E5D9CC] text-xs font-bold">
          <button
            type="button"
            onClick={() => setViewMode('simplified')}
            className={`px-3 py-1.5 rounded-full transition-all cursor-pointer ${
              isSimplified
                ? 'bg-[#543A2A] text-[#FAF6F0] shadow-xs'
                : 'text-[#8D7868] hover:text-[#543A2A]'
            }`}
          >
            Simplified ({suggestedPayments.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('pairwise')}
            className={`px-3 py-1.5 rounded-full transition-all cursor-pointer ${
              !isSimplified
                ? 'bg-[#543A2A] text-[#FAF6F0] shadow-xs'
                : 'text-[#8D7868] hover:text-[#543A2A]'
            }`}
          >
            Pairwise ({pairwiseDebts.length})
          </button>
        </div>
      </div>

      {/* Debt List */}
      {isAllSettled ? (
        <div className="text-center py-6 px-4 rounded-2xl bg-[#FAF6F0] border border-[#E5D9CC]">
          <span className="text-2xl mb-1 block">✓</span>
          <p className="text-xs sm:text-sm font-bold text-[#432E22]">
            All settled up!
          </p>
          <p className="text-xs text-[#8D7868] mt-0.5">
            Zero outstanding debt in this group.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {currentList.map((item, idx) => {
            const debtorName = getMemberName(item.fromMemberId);
            const creditorName = getMemberName(item.toMemberId);
            const debtorInitial = getMemberInitial(item.fromMemberId);
            const creditorInitial = getMemberInitial(item.toMemberId);
            const formattedAmount = formatMinor(item.amountMinor, currency);

            const isDebtorMe = item.fromMemberId === currentMemberId;
            const isCreditorMe = item.toMemberId === currentMemberId;
            const isMeInvolved = isDebtorMe || isCreditorMe;

            return (
              <div
                key={`${item.fromMemberId}-${item.toMemberId}-${idx}`}
                className={`flex items-center justify-between p-3.5 rounded-2xl border border-[#E5D9CC] shadow-xs transition hover:border-[#D4B89B] ${
                  isMeInvolved
                    ? 'bg-[#FAF6F0]'
                    : 'bg-white'
                }`}
              >
                {/* Visual Avatar pair & Transfer text */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex items-center -space-x-1 shrink-0">
                    <span
                      title={debtorName}
                      className="w-7 h-7 rounded-full bg-[#E5BFB0] text-[#432E22] flex items-center justify-center text-xs font-bold shadow-xs border border-white"
                    >
                      {debtorInitial}
                    </span>
                    <span
                      title={creditorName}
                      className="w-7 h-7 rounded-full bg-[#D4B89B] text-[#432E22] flex items-center justify-center text-xs font-bold shadow-xs border border-white"
                    >
                      {creditorInitial}
                    </span>
                  </div>

                  <div className="min-w-0 text-xs">
                    <div className="truncate font-bold text-[#432E22]">
                      <span className={isDebtorMe ? 'text-[#A83232] font-extrabold' : ''}>{debtorName}</span>
                      <span className="text-[#8D7868] font-normal mx-1.5">➔</span>
                      <span className={isCreditorMe ? 'text-[#2E4226] font-extrabold' : ''}>{creditorName}</span>
                    </div>
                  </div>
                </div>

                {/* Amount & Settle Action */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs sm:text-sm font-bold text-[#432E22]">
                    ₹{formattedAmount}
                  </span>

                  {onSettleUp && isDebtorMe && (
                    <button
                      type="button"
                      onClick={() => onSettleUp(item.fromMemberId, item.toMemberId, item.amountMinor)}
                      className="px-3 py-1 rounded-full bg-[#543A2A] hover:bg-[#432E20] text-[#FAF6F0] text-xs font-bold shadow-xs active:scale-95 transition cursor-pointer"
                    >
                      Settle
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

