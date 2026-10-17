'use client';

// components/ExpenseRow.tsx
// Neo-Brutalist Expense Row Component

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
      className="group flex items-center justify-between p-3.5 rounded-2xl border border-[#E5D9CC] bg-white shadow-sm hover:shadow-md hover:border-[#D4B89B] active:scale-[0.99] transition-all cursor-pointer"
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Date Badge */}
        <div className="w-11 h-11 rounded-xl bg-[#EFE4D6] flex flex-col items-center justify-center shrink-0">
          <span className="text-[9px] uppercase font-bold text-[#8D7868] leading-none">
            {month}
          </span>
          <span className="text-sm font-extrabold text-[#543A2A] leading-none mt-1">
            {day}
          </span>
        </div>

        {/* Category & Title */}
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-base shrink-0">{icon}</span>
            <h4 className="text-sm font-bold truncate text-[#432E22]">
              {expense.title}
            </h4>

            {expense.receiptPath && (
              <span title="Receipt attached" className="text-[#8D7868] shrink-0 inline-flex items-center text-xs">
                📄
              </span>
            )}

            {expense._sync === 'pending' && (
              <span
                title="Saved locally, not synced to cloud yet"
                className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#EFE4D6] text-[#543A2A] inline-flex items-center gap-1"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                NOT SYNCED
              </span>
            )}
          </div>

          <div className="text-xs text-[#8D7868] flex items-center gap-1.5 font-medium">
            <span className="text-[#432E22] font-semibold">{payerSummary}</span>
            <span>•</span>
            <span>{formatMinor(expense.amountMinor, expense.currency)}</span>
          </div>
        </div>
      </div>

      {/* Right: Perspective Amount or Actions */}
      <div className="flex items-center gap-2 shrink-0 ml-3">
        <div className="text-right">
          {isLender && (
            <div className="px-3 py-1 rounded-full bg-[#EAEFE8] text-[#3D5638] border border-[#D5E2D2]">
              <span className="text-[9px] font-bold block uppercase tracking-wider leading-tight">
                YOU LENT
              </span>
              <span className="text-xs font-extrabold leading-tight">
                +{formatMinor(netUser, expense.currency)}
              </span>
            </div>
          )}
          {isBorrower && (
            <div className="px-3 py-1 rounded-full bg-[#F8EDEA] text-[#9A3C2D] border border-[#EBD7D3]">
              <span className="text-[9px] font-bold block uppercase tracking-wider leading-tight">
                YOU BORROWED
              </span>
              <span className="text-xs font-extrabold leading-tight">
                -{formatMinor(Math.abs(netUser), expense.currency)}
              </span>
            </div>
          )}
          {isNeutral && (
            <div className="px-2.5 py-0.5 rounded-full bg-[#EFE4D6] border border-[#E5D9CC]">
              <span className="text-xs font-semibold text-[#8D7868]">
                not in
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
            className="w-8 h-8 rounded-full border border-[#E5D9CC] bg-white hover:bg-[#F8EDEA] text-[#8D7868] hover:text-[#9A3C2D] font-bold flex items-center justify-center transition"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
