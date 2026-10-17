'use client';

// components/ConflictResolutionSheet.tsx
// Visual 3-Way Conflict Resolution Sheet (HTTP 409 OCC Conflict)
// Brew & Browse Warm Cafe Styling

import React, { useEffect } from 'react';
import type { Expense, Member } from '../lib/data/types';
import { formatMinor } from '../lib/engine/money';

export interface ConflictResolutionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  localExpense: Expense;
  serverExpense?: Partial<Expense> | any;
  members: Member[];
  onKeepMine: () => void;
  onUseTheirs: () => void;
}

export function ConflictResolutionSheet({
  isOpen,
  onClose,
  localExpense,
  serverExpense,
  members,
  onKeepMine,
  onUseTheirs,
}: ConflictResolutionSheetProps) {
  // Close on ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const memberMap = new Map<string, string>();
  for (const m of members) {
    memberMap.set(m.id, m.displayName);
  }

  const isServerDeleted = Boolean(
    serverExpense?.deleted_at || serverExpense?.deletedAt
  );

  const serverTitle = serverExpense?.title || 'Unknown Title';
  const serverAmountMinor = Number(
    serverExpense?.amount_minor ?? serverExpense?.amountMinor ?? localExpense.amountMinor
  );
  const serverCurrency = serverExpense?.currency || localExpense.currency;
  const serverDate = serverExpense?.expense_date || serverExpense?.expenseDate || localExpense.expenseDate;
  const serverVersion = serverExpense?.version ?? (localExpense.version - 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl bg-white border border-[#E5D9CC] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#E5D9CC] flex items-start justify-between gap-3 bg-[#FAF6F0]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#EFE4D6] text-[#543A2A] flex items-center justify-center text-lg font-bold shrink-0">
              ⚡
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#432E22]">
                Version Conflict Detected
              </h2>
              <p className="text-xs text-[#8D7868] font-medium mt-0.5">
                Another member updated this expense while you had pending local edits.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-[#E5D9CC] bg-white flex items-center justify-center font-bold text-[#432E22] hover:bg-[#FAF6F0] shadow-xs transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content Comparison Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {isServerDeleted && (
            <div className="p-3 rounded-2xl bg-[#FCE8E6] border border-[#F5C2C0] text-[#A83232] text-xs font-semibold flex items-center gap-2">
              <span>🗑️</span>
              <span>This expense was deleted on the server while you were editing it.</span>
            </div>
          )}

          {/* Comparison Cards: Your Edit vs Server Version */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Left: Your Local Edit */}
            <div className="p-4 rounded-2xl border border-[#E5D9CC] bg-[#FAF6F0] space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#432E22] uppercase tracking-wider text-[11px]">
                  Your Edit (Local)
                </span>
                <span className="px-2 py-0.5 rounded-full border border-[#C5D9BE] bg-[#E8F0E4] text-[#2E4226] font-bold text-[10px]">
                  v{localExpense.version}
                </span>
              </div>

              <div>
                <span className="text-[#8D7868] block text-[10px] font-semibold uppercase">Title</span>
                <span className="font-bold text-[#432E22] text-sm">
                  {localExpense.title}
                </span>
              </div>

              <div>
                <span className="text-[#8D7868] block text-[10px] font-semibold uppercase">Amount</span>
                <span className="font-bold text-[#2E4226] text-base bg-[#E8F0E4] px-2 py-0.5 rounded-full border border-[#C5D9BE] inline-block mt-0.5">
                  ₹ {formatMinor(localExpense.amountMinor, localExpense.currency)}
                </span>
              </div>

              <div>
                <span className="text-[#8D7868] block text-[10px] font-semibold uppercase">Date</span>
                <span className="font-semibold text-[#432E22]">
                  {localExpense.expenseDate}
                </span>
              </div>

              <div>
                <span className="text-[#8D7868] block text-[10px] font-semibold uppercase mb-1">Splits</span>
                <div className="space-y-1 text-[11px]">
                  {(localExpense.splits || []).map((s) => (
                    <div key={s.memberId} className="flex justify-between text-[#432E22]">
                      <span className="font-medium">{memberMap.get(s.memberId) || s.memberId}:</span>
                      <span className="font-bold">₹ {formatMinor(s.owedMinor, localExpense.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Server Snapshot */}
            <div className="p-4 rounded-2xl border border-[#E5D9CC] bg-white space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#432E22] uppercase tracking-wider text-[11px]">
                  Server Snapshot
                </span>
                <span className="px-2 py-0.5 rounded-full border border-[#ECD3B6] bg-[#FAF0E6] text-[#8C5E23] font-bold text-[10px]">
                  v{serverVersion}
                </span>
              </div>

              <div>
                <span className="text-[#8D7868] block text-[10px] font-semibold uppercase">Title</span>
                <span className="font-bold text-[#432E22] text-sm">
                  {isServerDeleted ? '— (Deleted)' : serverTitle}
                </span>
              </div>

              <div>
                <span className="text-[#8D7868] block text-[10px] font-semibold uppercase">Amount</span>
                <span className="font-bold text-[#432E22] text-base inline-block mt-0.5">
                  {isServerDeleted ? '—' : `₹ ${formatMinor(serverAmountMinor, serverCurrency)}`}
                </span>
              </div>

              <div>
                <span className="text-[#8D7868] block text-[10px] font-semibold uppercase">Date</span>
                <span className="font-semibold text-[#432E22]">
                  {isServerDeleted ? '—' : serverDate}
                </span>
              </div>

              <div>
                <span className="text-[#8D7868] block text-[10px] font-semibold uppercase mb-1">Splits</span>
                {isServerDeleted ? (
                  <span className="text-[#8D7868] italic">None (soft-deleted)</span>
                ) : (
                  <div className="space-y-1 text-[11px]">
                    {Array.isArray(serverExpense?.splits) ? (
                      serverExpense.splits.map((s: any) => (
                        <div key={s.member_id || s.memberId} className="flex justify-between text-[#432E22]">
                          <span className="font-medium">{memberMap.get(s.member_id || s.memberId) || s.member_id || s.memberId}:</span>
                          <span className="font-bold">
                            ₹ {formatMinor(Number(s.owed_minor || s.owedMinor || 0), serverCurrency)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <span className="text-[#8D7868] italic">Server snapshot details</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#E5D9CC] bg-[#FAF6F0] flex flex-col sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onUseTheirs}
            className="w-full sm:w-auto px-5 py-2.5 rounded-full border border-[#E5D9CC] bg-white text-xs font-bold text-[#432E22] hover:bg-[#FAF6F0] shadow-xs active:scale-95 transition cursor-pointer"
          >
            {isServerDeleted ? 'Accept Deletion (Discard Mine)' : 'Use Server Version'}
          </button>

          <button
            type="button"
            onClick={onKeepMine}
            className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-[#543A2A] text-[#FAF6F0] text-xs font-bold shadow-md hover:bg-[#432E20] active:scale-95 transition cursor-pointer"
          >
            {isServerDeleted ? 'Recreate & Keep Mine' : 'Keep Mine (Overwrite Server)'}
          </button>
        </div>
      </div>
    </div>
  );
}
