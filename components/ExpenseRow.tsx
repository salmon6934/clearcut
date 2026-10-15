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
      className={`group flex items-center justify-between p-3.5 rounded-2xl border-2 border-black transition-all cursor-pointer ${
        isDeleted
          ? 'bg-[#ffebee] shadow-[2px_2px_0px_0px_#000] opacity-80'
          : 'bg-white shadow-[3px_3px_0px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Date Badge */}
        <div className="w-11 h-11 rounded-xl bg-[#f0f0ea] border-2 border-black flex flex-col items-center justify-center shrink-0 shadow-[1.5px_1.5px_0px_0px_#000]">
          <span className="text-[9px] uppercase font-mono font-black text-black/60 leading-none">
            {month}
          </span>
          <span className="text-sm font-black text-black leading-none mt-1 font-mono">
            {day}
          </span>
        </div>

        {/* Category & Title */}
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-base shrink-0">{icon}</span>
            <h4 className={`text-sm font-black truncate text-black ${isDeleted ? 'line-through text-black/40' : ''}`}>
              {expense.title}
            </h4>

            {expense.receiptPath && (
              <span title="Receipt attached" className="text-black shrink-0 inline-flex items-center">
                📄
              </span>
            )}

            {isDeleted && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-black bg-[#ff8a80] text-black border border-black">
                DELETED
              </span>
            )}

            {expense._sync === 'pending' && !isDeleted && (
              <span
                title="Saved locally, not synced to cloud yet"
                className="px-1.5 py-0.5 rounded text-[9px] font-mono font-black bg-[#ffd600] text-black border border-black inline-flex items-center gap-1 shadow-[1px_1px_0px_0px_#000]"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                NOT SYNCED
              </span>
            )}
          </div>

          <div className="text-xs text-black/60 flex items-center gap-1.5 font-mono font-medium">
            <span className="text-black font-bold">{payerSummary}</span>
            <span>•</span>
            <span className="font-mono">₹ {formatMinor(expense.amountMinor, expense.currency)}</span>
          </div>
        </div>
      </div>

      {/* Right: Perspective Amount or Actions */}
      <div className="flex items-center gap-2 shrink-0 ml-3">
        {!isDeleted ? (
          <>
            <div className="text-right">
              {isLender && (
                <div className="px-2.5 py-1 rounded-lg bg-[#ccff00] text-black border-2 border-black shadow-[1.5px_1.5px_0px_0px_#000]">
                  <span className="text-[9px] font-mono font-black block uppercase tracking-wider">
                    YOU LENT
                  </span>
                  <span className="text-xs font-black font-mono">
                    +{formatMinor(netUser, expense.currency)}
                  </span>
                </div>
              )}
              {isBorrower && (
                <div className="px-2.5 py-1 rounded-lg bg-[#ff8a80] text-black border-2 border-black shadow-[1.5px_1.5px_0px_0px_#000]">
                  <span className="text-[9px] font-mono font-black block uppercase tracking-wider">
                    YOU BORROWED
                  </span>
                  <span className="text-xs font-black font-mono">
                    -{formatMinor(Math.abs(netUser), expense.currency)}
                  </span>
                </div>
              )}
              {isNeutral && (
                <div className="px-2 py-0.5 rounded-lg bg-[#f0f0ea] border border-black">
                  <span className="text-xs font-mono font-bold text-black/60">
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
                className="w-8 h-8 rounded-lg border-2 border-black bg-white hover:bg-[#ff8a80] text-black font-black flex items-center justify-center transition shadow-[1.5px_1.5px_0px_0px_#000]"
              >
                ✕
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
              className="px-3 py-1.5 rounded-lg bg-[#ccff00] text-black border-2 border-black font-mono font-black text-xs shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition"
            >
              RESTORE
            </button>
          )
        )}
      </div>
    </div>
  );
}
