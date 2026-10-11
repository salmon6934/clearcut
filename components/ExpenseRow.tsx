'use client';

// components/ExpenseRow.tsx
// Rich Interactive Expense Row with Perspective Shares, Dates & Sync State

import React from 'react';
import type { Expense, Member } from '../lib/data/types';
import { formatMinor } from '../lib/engine/money';

interface ExpenseRowProps {
  expense: Expense;
  members: Member[];
  currentMemberId?: string;
  onClick?: () => void;
  onDelete?: () => void;
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
}: ExpenseRowProps) {
  const memberMap = new Map<string, Member>();
  for (const m of members) {
    memberMap.set(m.id, m);
  }

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

  // User's perspective share
  const userSplit = (expense.splits || []).find((s) => s.memberId === currentMemberId);
  const paidMinor = userSplit?.paidMinor || 0;
  const owedMinor = userSplit?.owedMinor || 0;
  const netUser = paidMinor - owedMinor;

  const isLender = netUser > 0;
  const isBorrower = netUser < 0;
  const isNeutral = netUser === 0;

  const icon = CATEGORY_ICONS[expense.category || 'general'] || '🧾';

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className="group relative flex items-center justify-between p-3.5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 shadow-sm transition-all select-none cursor-pointer active:scale-[0.99]"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        {/* Date block */}
        <div className="flex flex-col items-center justify-center w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 shrink-0 font-medium leading-none">
          <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
            {month}
          </span>
          <span className="text-sm font-bold mt-0.5">{day}</span>
        </div>

        {/* Category & Title */}
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-sm shrink-0">{icon}</span>
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {expense.title}
            </h4>
            {expense._sync === 'pending' && (
              <span title="Pending sync" className="text-blue-500 shrink-0">
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </span>
            )}
            {expense._sync === 'conflict' && (
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

      {/* Perspective Amount */}
      <div className="text-right shrink-0 ml-3">
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
    </div>
  );
}
