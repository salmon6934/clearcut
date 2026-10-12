'use client';

// components/ConflictResolutionSheet.tsx
// Visual 3-Way Conflict Resolution Sheet (HTTP 409 OCC Conflict)
// Implements T-2.2.2 with side-by-side diff, tombstone handling, and one-tap resolution in Neo-Brutalist style.

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
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-xl bg-white border-2 border-black shadow-[6px_6px_0px_0px_#000] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b-2 border-black flex items-start justify-between gap-3 bg-[#ffd600]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded border-2 border-black bg-black text-[#ffd600] flex items-center justify-center text-lg font-black shrink-0">
              !
            </div>
            <div>
              <h2 className="text-sm font-mono font-black uppercase text-black">
                VERSION CONFLICT DETECTED (HTTP 409)
              </h2>
              <p className="text-[11px] font-mono text-black/80 font-bold">
                Another member updated this expense while you had pending local edits.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded border-2 border-black bg-white flex items-center justify-center font-black text-black hover:bg-black hover:text-white shadow-[1px_1px_0px_0px_#000] transition"
          >
            ✕
          </button>
        </div>

        {/* Content Comparison Body */}
        <div className="p-4 overflow-y-auto space-y-4">
          {isServerDeleted && (
            <div className="p-3 rounded-lg bg-[#ff8a80] border-2 border-black text-black text-xs font-mono font-black flex items-center gap-2 shadow-[2px_2px_0px_0px_#000]">
              <span>🗑️</span>
              <span>This expense was deleted on the server while you were editing it.</span>
            </div>
          )}

          {/* Comparison Cards: Your Edit vs Server Version */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Left: Your Local Edit */}
            <div className="p-3.5 rounded-lg border-2 border-black bg-[#f0f0ea] space-y-2.5 shadow-[2px_2px_0px_0px_#000]">
              <div className="flex items-center justify-between">
                <span className="font-mono font-black text-black uppercase tracking-wider text-[11px]">
                  YOUR EDIT (LOCAL)
                </span>
                <span className="px-1.5 py-0.2 rounded border border-black bg-[#ccff00] text-black font-mono font-black text-[10px]">
                  v{localExpense.version}
                </span>
              </div>

              <div>
                <span className="text-black/60 block text-[10px] font-mono uppercase">Title</span>
                <span className="font-black font-mono text-black text-sm">
                  {localExpense.title}
                </span>
              </div>

              <div>
                <span className="text-black/60 block text-[10px] font-mono uppercase">Amount</span>
                <span className="font-black text-black font-mono text-base bg-[#ccff00] px-1.5 py-0.5 rounded border border-black inline-block">
                  ₹ {formatMinor(localExpense.amountMinor, localExpense.currency)}
                </span>
              </div>

              <div>
                <span className="text-black/60 block text-[10px] font-mono uppercase">Date</span>
                <span className="font-mono font-bold text-black">
                  {localExpense.expenseDate}
                </span>
              </div>

              <div>
                <span className="text-black/60 block text-[10px] font-mono uppercase mb-1">Splits</span>
                <div className="space-y-1 font-mono text-[11px]">
                  {(localExpense.splits || []).map((s) => (
                    <div key={s.memberId} className="flex justify-between text-black">
                      <span>{memberMap.get(s.memberId) || s.memberId}:</span>
                      <span className="font-black">₹ {formatMinor(s.owedMinor, localExpense.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Server Snapshot */}
            <div className="p-3.5 rounded-lg border-2 border-black bg-white space-y-2.5 shadow-[2px_2px_0px_0px_#000]">
              <div className="flex items-center justify-between">
                <span className="font-mono font-black text-black uppercase tracking-wider text-[11px]">
                  SERVER SNAPSHOT
                </span>
                <span className="px-1.5 py-0.2 rounded border border-black bg-[#00e5ff] text-black font-mono font-black text-[10px]">
                  v{serverVersion}
                </span>
              </div>

              <div>
                <span className="text-black/60 block text-[10px] font-mono uppercase">Title</span>
                <span className="font-black font-mono text-black text-sm">
                  {isServerDeleted ? '— (Deleted)' : serverTitle}
                </span>
              </div>

              <div>
                <span className="text-black/60 block text-[10px] font-mono uppercase">Amount</span>
                <span className="font-black text-black font-mono text-base inline-block">
                  {isServerDeleted ? '—' : `₹ ${formatMinor(serverAmountMinor, serverCurrency)}`}
                </span>
              </div>

              <div>
                <span className="text-black/60 block text-[10px] font-mono uppercase">Date</span>
                <span className="font-mono font-bold text-black">
                  {isServerDeleted ? '—' : serverDate}
                </span>
              </div>

              <div>
                <span className="text-black/60 block text-[10px] font-mono uppercase mb-1">Splits</span>
                {isServerDeleted ? (
                  <span className="text-black/60 italic font-mono">None (soft-deleted)</span>
                ) : (
                  <div className="space-y-1 font-mono text-[11px]">
                    {Array.isArray(serverExpense?.splits) ? (
                      serverExpense.splits.map((s: any) => (
                        <div key={s.member_id || s.memberId} className="flex justify-between text-black">
                          <span>{memberMap.get(s.member_id || s.memberId) || s.member_id || s.memberId}:</span>
                          <span className="font-black">
                            ₹ {formatMinor(Number(s.owed_minor || s.owedMinor || 0), serverCurrency)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <span className="text-black/60 italic font-mono">Server snapshot details</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 border-t-2 border-black bg-[#f0f0ea] flex flex-col sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onUseTheirs}
            className="w-full sm:w-auto px-4 py-2 rounded-lg border-2 border-black bg-white text-xs font-mono font-black text-black hover:bg-black hover:text-white shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition uppercase"
          >
            {isServerDeleted ? 'Accept Deletion (Discard Mine)' : 'Use Server Version'}
          </button>

          <button
            type="button"
            onClick={onKeepMine}
            className="w-full sm:w-auto px-4 py-2 rounded-lg border-2 border-black bg-[#ccff00] text-black text-xs font-mono font-black shadow-[2px_2px_0px_0px_#000] hover:bg-black hover:text-[#ccff00] active:translate-x-0.5 active:translate-y-0.5 transition uppercase"
          >
            {isServerDeleted ? 'Recreate & Keep Mine' : 'Keep Mine (Overwrite Server)'}
          </button>
        </div>
      </div>
    </div>
  );
}
