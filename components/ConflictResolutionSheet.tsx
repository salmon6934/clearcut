'use client';

// components/ConflictResolutionSheet.tsx
// Visual 3-Way Conflict Resolution Sheet (HTTP 409 OCC Conflict)
// Implements T-2.2.2 with side-by-side diff, tombstone handling, and one-tap resolution.

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-3 bg-amber-500/5 dark:bg-amber-500/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl shrink-0">
              ⚠️
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Version Conflict Detected (409)
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Another member updated this expense while you had pending local edits.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Content Comparison Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {isServerDeleted && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
              <span>🗑️</span>
              <span>This expense was deleted on the server while you were editing it.</span>
            </div>
          )}

          {/* Comparison Cards: Your Edit vs Server Version */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
            {/* Left: Your Local Edit */}
            <div className="p-4 rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-500/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider text-[11px]">
                  Your Changes (Local)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-mono text-[10px]">
                  v{localExpense.version}
                </span>
              </div>

              <div>
                <span className="text-zinc-400 block text-[10px] uppercase">Title</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                  {localExpense.title}
                </span>
              </div>

              <div>
                <span className="text-zinc-400 block text-[10px] uppercase">Amount</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100 font-mono text-base text-emerald-600 dark:text-emerald-400">
                  {formatMinor(localExpense.amountMinor, localExpense.currency)}
                </span>
              </div>

              <div>
                <span className="text-zinc-400 block text-[10px] uppercase">Date</span>
                <span className="text-zinc-700 dark:text-zinc-300">
                  {localExpense.expenseDate}
                </span>
              </div>

              <div>
                <span className="text-zinc-400 block text-[10px] uppercase mb-1">Splits</span>
                <div className="space-y-1">
                  {(localExpense.splits || []).map((s) => (
                    <div key={s.memberId} className="flex justify-between text-zinc-600 dark:text-zinc-400">
                      <span>{memberMap.get(s.memberId) || s.memberId}:</span>
                      <span className="font-mono">{formatMinor(s.owedMinor, localExpense.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Server Snapshot */}
            <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-[11px]">
                  Server Version
                </span>
                <span className="px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-mono text-[10px]">
                  v{serverVersion}
                </span>
              </div>

              <div>
                <span className="text-zinc-400 block text-[10px] uppercase">Title</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
                  {isServerDeleted ? '— (Deleted)' : serverTitle}
                </span>
              </div>

              <div>
                <span className="text-zinc-400 block text-[10px] uppercase">Amount</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100 font-mono text-base">
                  {isServerDeleted ? '—' : formatMinor(serverAmountMinor, serverCurrency)}
                </span>
              </div>

              <div>
                <span className="text-zinc-400 block text-[10px] uppercase">Date</span>
                <span className="text-zinc-700 dark:text-zinc-300">
                  {isServerDeleted ? '—' : serverDate}
                </span>
              </div>

              <div>
                <span className="text-zinc-400 block text-[10px] uppercase mb-1">Splits</span>
                {isServerDeleted ? (
                  <span className="text-zinc-400 italic">None (soft-deleted)</span>
                ) : (
                  <div className="space-y-1">
                    {Array.isArray(serverExpense?.splits) ? (
                      serverExpense.splits.map((s: any) => (
                        <div key={s.member_id || s.memberId} className="flex justify-between text-zinc-600 dark:text-zinc-400">
                          <span>{memberMap.get(s.member_id || s.memberId) || s.member_id || s.memberId}:</span>
                          <span className="font-mono">
                            {formatMinor(Number(s.owed_minor || s.owedMinor || 0), serverCurrency)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <span className="text-zinc-400 italic">Server snapshot details</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex flex-col sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onUseTheirs}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            {isServerDeleted ? 'Accept Deletion (Discard Mine)' : 'Use Server Version'}
          </button>

          <button
            type="button"
            onClick={onKeepMine}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition"
          >
            {isServerDeleted ? 'Recreate & Keep Mine' : 'Keep Mine (Overwrite Server)'}
          </button>
        </div>
      </div>
    </div>
  );
}
