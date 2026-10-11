'use client';

// components/ExpenseRow.tsx
// Rich Interactive Expense Row with Perspective Shares, Dates, Sync State & Soft-Delete Actions

import React from 'react';
import type { Expense, Member } from '../lib/data/types';
import { formatMinor } from '../lib/engine/money';

interface ExpenseRowProps {
  expense: Expense;
  members: Member[];
  currentMemberId?: string;
  onClick?: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  general: '🧾',
  food: '🍽️',
  drinks: '🍻',
  groceries: '🛒',
  transport: '🚕',
  hotel: '🏨',
  entertainment: '🎟️',
  shopping: '🛍️',
};

export function ExpenseRow({
  expense,
  members,
  currentMemberId,
  onClick,
  onDelete,
  onRestore,
}: ExpenseRowProps) {
  const memberMap = new Map<string, Member>();
  for (const m of members) {
    memberMap.set(m.id, m);
  }

  const isDeleted = Boolean(expense.deletedAt);

  // Parse date
  const dateObj = new Date(expense.expenseDate || expense.createdAt || '');
  const day = !isNaN(dateObj.getDate()) ? dateObj.getDate() : '--';
  const month = !isNaN(dateObj.getMonth())
    ? dateObj.toLocaleString('en-US', { month: 'short' })
    : '--';

  // Determine who paid
  const payingSplits = (expense.splits || []).filter((s) => s.paidMinor > 0);
  let payerSummary = 'Unknown';
  if (payingSplits.length === 1) {
    const singlePayerId = payingSplits[0]!.memberId;
    if (currentMemberId && singlePayerId === currentMemberId) {
      payerSummary = 'You paid';
    } else {
      const payerMember = memberMap.get(singlePayerId);
      payerSummary = `${payerMember?.displayName || 'Someone'} paid`;
    }
  } else if (payingSplits.length > 1) {
    payerSummary = `${payingSplits.length} people paid`;
  }

  // Calculate current user perspective net
  const userSplit = (expense.splits || []).find((s) => s.memberId === currentMemberId);
  const userPaid = userSplit ? userSplit.paidMinor : 0;
  const userOwed = userSplit ? userSplit.owedMinor : 0;
  const netUser = userPaid - userOwed;

  const isLender = netUser > 0;
  const isBorrower = netUser < 0;
  const isNeutral = netUser === 0;

  const icon = CATEGORY_ICONS[expense.category || 'general'] || '🧾';

  return (
    <div
      onClick={onClick}
      className={`group flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
        isDeleted
          ? 'border-rose-500/30 bg-rose-500/5 dark:bg-rose-500/10 opacity-75'
          : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 active:scale-[0.99]'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Date Badge */}
        <div className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex flex-col items-center justify-center shrink-0 border border-zinc-200 dark:border-zinc-700/60">
          <span className="text-[9px] uppercase font-bold text-zinc-400 leading-none">
            {month}
          </span>
          <span className="text-sm font-extrabold text-zinc-800 dark:text-zinc-200 leading-none mt-0.5 font-mono">
            {day}
          </span>
        </div>

        {/* Category & Title */}
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm shrink-0">{icon}</span>
            <h4 className={`text-sm font-semibold truncate ${isDeleted ? 'line-through text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'}`}>
              {expense.title}
            </h4>

            {isDeleted && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-600 dark:text-rose-400">
                Deleted
              </span>
            )}

            {expense._sync === 'pending' && !isDeleted && (
              <span title="Pending sync" className="text-blue-500 shrink-0">
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </span>
            )}
            {expense._sync === 'conflict' && !isDeleted && (
              <span title="Sync conflict" className="text-amber-500 shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </span>
            )}
          </div>

          <div className="text-xs text-zinc-400">
            <span>{payerSummary}</span>
            <span className="mx-1.5">•</span>
            <span className="font-mono">{formatMinor(expense.amountMinor, expense.currency)}</span>
          </div>
        </div>
      </div>

      {/* Right: Perspective Amount or Actions */}
      <div className="flex items-center gap-2 shrink-0 ml-3">
        {!isDeleted ? (
          <>
            <div className="text-right">
              {isLender && (
                <div>
                  <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 block uppercase tracking-wider">
                    you lent
                  </span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    +{formatMinor(netUser, expense.currency)}
                  </span>
                </div>
              )}
              {isBorrower && (
                <div>
                  <span className="text-[10px] font-medium text-orange-600 dark:text-orange-400 block uppercase tracking-wider">
                    you borrowed
                  </span>
                  <span className="text-sm font-bold text-orange-600 dark:text-orange-400 font-mono">
                    -{formatMinor(Math.abs(netUser), expense.currency)}
                  </span>
                </div>
              )}
              {isNeutral && (
                <div>
                  <span className="text-xs font-medium text-zinc-400">
                    not involved
                  </span>
                </div>
              )}
            </div>

            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                title="Delete expense"
                className="w-8 h-8 rounded-xl opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </>
        ) : (
          onRestore && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRestore();
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition active:scale-95"
            >
              Restore
            </button>
          )
        )}
      </div>
    </div>
  );
}
