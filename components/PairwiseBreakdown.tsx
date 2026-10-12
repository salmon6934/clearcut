'use client';

// components/PairwiseBreakdown.tsx
// Stitch-Engineered Pairwise Debt Breakdown & Simplified Algorithmic Netting

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
    <div className="bg-white border-2 border-black rounded-2xl p-4 sm:p-5 shadow-[4px_4px_0px_0px_#000] space-y-4">
      {/* Header & Tab Selector matching Stitch Image 3 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-black uppercase font-mono tracking-wider flex items-center gap-2">
            <span>⚖️</span>
            <span>CLEARINGHOUSE NETTING</span>
          </h3>
          <p className="text-xs text-black/60 font-mono mt-0.5">
            {isSimplified
              ? 'Optimal graph reduction minimizing group transfers'
              : 'Raw bilateral ledger obligations before clearing'}
          </p>
        </div>

        {/* View mode toggle matching Image 3 */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setViewMode('simplified')}
            className={`px-3 py-1.5 rounded-lg border-2 border-black text-xs font-mono font-black transition-all cursor-pointer ${
              isSimplified
                ? 'bg-[#ccff00] text-black shadow-[2px_2px_0px_0px_#000]'
                : 'bg-white text-black/70 hover:bg-[#fafaf6]'
            }`}
          >
            ✨ SIMPLIFIED ({suggestedPayments.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('pairwise')}
            className={`px-3 py-1.5 rounded-lg border-2 border-black text-xs font-mono font-black transition-all cursor-pointer ${
              !isSimplified
                ? 'bg-[#ccff00] text-black shadow-[2px_2px_0px_0px_#000]'
                : 'bg-white text-black/70 hover:bg-[#fafaf6]'
            }`}
          >
            🔀 PAIRWISE ({pairwiseDebts.length})
          </button>
        </div>
      </div>

      {/* Debt List */}
      {isAllSettled ? (
        <div className="text-center py-6 px-4 rounded-xl bg-white border-2 border-dashed border-black">
          <span className="text-2xl mb-1 block">🎉</span>
          <p className="text-xs sm:text-sm font-black font-mono text-black uppercase">
            All settled up!
          </p>
          <p className="text-xs text-black/60 font-mono mt-0.5">
            Zero outstanding debt in this ledger.
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
                className={`flex items-center justify-between p-3 rounded-xl border-2 border-black shadow-[2px_2px_0px_0px_#000] transition-all ${
                  isMeInvolved
                    ? 'bg-[#fffde6]'
                    : 'bg-white'
                }`}
              >
                {/* Visual Avatar pair & Transfer text */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex items-center -space-x-1 shrink-0">
                    <span
                      title={debtorName}
                      className="w-7 h-7 rounded-lg border-2 border-black bg-[#ff8a80] text-black flex items-center justify-center text-xs font-black"
                    >
                      {debtorInitial}
                    </span>
                    <span
                      title={creditorName}
                      className="w-7 h-7 rounded-lg border-2 border-black bg-[#ccff00] text-black flex items-center justify-center text-xs font-black"
                    >
                      {creditorInitial}
                    </span>
                  </div>

                  <div className="min-w-0 text-xs">
                    <div className="truncate font-black text-black">
                      <span>{debtorName}</span>
                      <span className="text-black/60 font-mono font-bold mx-1.5">➔</span>
                      <span>{creditorName}</span>
                    </div>
                  </div>
                </div>

                {/* Amount & Settle Action */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs sm:text-sm font-black font-mono text-black">
                    {formattedAmount}
                  </span>

                  {onSettleUp && isDebtorMe && (
                    <button
                      type="button"
                      onClick={() => onSettleUp(item.fromMemberId, item.toMemberId, item.amountMinor)}
                      className="px-2.5 py-1 rounded-lg bg-[#ccff00] hover:bg-[#bbf000] text-black border-2 border-black text-xs font-mono font-black shadow-[1.5px_1.5px_0px_0px_#000] transition active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                    >
                      SETTLE
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
