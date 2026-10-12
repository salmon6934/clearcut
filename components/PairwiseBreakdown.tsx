'use client';

// components/PairwiseBreakdown.tsx
// Direct Pairwise Debt Breakdown & Simplified Payments Comparison
// Implements T-2.4.1 for transparent multi-party debt inspection and settling.

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
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4 sm:p-5 shadow-sm space-y-4">
      {/* Header & Tab Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <span>⚖️</span>
            <span>Settlement Breakdown</span>
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {isSimplified
              ? 'Minimized transactions to clear all group debts'
              : 'Direct pairwise debts computed before simplification'}
          </p>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 text-xs font-medium self-start sm:self-auto border border-zinc-200/50 dark:border-zinc-700/50">
          <button
            type="button"
            onClick={() => setViewMode('simplified')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              isSimplified
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm font-semibold'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            Simplified ({suggestedPayments.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('pairwise')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              !isSimplified
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm font-semibold'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            Pairwise ({pairwiseDebts.length})
          </button>
        </div>
      </div>

      {/* Debt List */}
      {isAllSettled ? (
        <div className="text-center py-6 px-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-dashed border-zinc-200 dark:border-zinc-800">
          <span className="text-2xl mb-1 block">🎉</span>
          <p className="text-xs sm:text-sm font-medium text-zinc-800 dark:text-zinc-200">
            All settled up!
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            No pending balances between group members.
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
                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                  isMeInvolved
                    ? 'border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20'
                    : 'border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30'
                }`}
              >
                {/* Visual Avatar pair & Transfer text */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex items-center -space-x-1.5 shrink-0">
                    <span
                      title={debtorName}
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-white dark:ring-zinc-900 ${
                        isDebtorMe
                          ? 'bg-rose-500 text-white'
                          : 'bg-zinc-300 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200'
                      }`}
                    >
                      {debtorInitial}
                    </span>
                    <span
                      title={creditorName}
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-white dark:ring-zinc-900 ${
                        isCreditorMe
                          ? 'bg-emerald-500 text-white'
                          : 'bg-zinc-400 dark:bg-zinc-600 text-zinc-900 dark:text-white'
                      }`}
                    >
                      {creditorInitial}
                    </span>
                  </div>

                  <div className="min-w-0 text-xs">
                    <div className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                      <span className={isDebtorMe ? 'text-rose-600 dark:text-rose-400 font-bold' : ''}>
                        {debtorName}
                      </span>
                      <span className="text-zinc-400 dark:text-zinc-500 mx-1.5 font-normal">owes</span>
                      <span className={isCreditorMe ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}>
                        {creditorName}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Amount & Settle Action */}
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-xs sm:text-sm font-bold tabular-nums ${
                      isDebtorMe
                        ? 'text-rose-600 dark:text-rose-400'
                        : isCreditorMe
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-zinc-800 dark:text-zinc-200'
                    }`}
                  >
                    {formattedAmount}
                  </span>

                  {onSettleUp && isDebtorMe && (
                    <button
                      type="button"
                      onClick={() => onSettleUp(item.fromMemberId, item.toMemberId, item.amountMinor)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition active:scale-95 shadow-sm"
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
