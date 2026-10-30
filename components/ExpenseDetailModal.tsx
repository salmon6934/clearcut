'use client';

// components/ExpenseDetailModal.tsx
// Warm Cafe Neo-Brutalist Expense Detail Inspection Modal

import React, { useState } from 'react';
import {
  Receipt,
  Utensils,
  Wine,
  ShoppingCart,
  Car,
  Building2,
  Ticket,
  ShoppingBag,
  Pencil,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { Expense, Member } from '../lib/data/types';
import { formatMinor } from '../lib/engine/money';
import { haptics } from '../lib/native/haptics';

interface ExpenseDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense: Expense | null;
  members: Member[];
  currentMemberId?: string;
  onEdit: (expense: Expense) => void;
  onDelete?: (expense: Expense) => void;
}

const CATEGORY_MAP: Record<string, { label: string; icon: LucideIcon }> = {
  general: { label: 'General', icon: Receipt },
  food: { label: 'Food & Dining', icon: Utensils },
  drinks: { label: 'Drinks & Bar', icon: Wine },
  groceries: { label: 'Groceries', icon: ShoppingCart },
  transport: { label: 'Transport', icon: Car },
  hotel: { label: 'Stay / Hotel', icon: Building2 },
  entertainment: { label: 'Entertainment', icon: Ticket },
  shopping: { label: 'Shopping', icon: ShoppingBag },
};

export function ExpenseDetailModal({
  isOpen,
  onClose,
  expense,
  members,
  currentMemberId,
  onEdit,
  onDelete,
}: ExpenseDetailModalProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!isOpen || !expense) return null;

  const memberMap = new Map<string, Member>();
  for (const m of members) {
    memberMap.set(m.id, m);
  }

  // Calculate current user net balance on this expense
  const userSplit = (expense.splits || []).find((s) => s.memberId === currentMemberId);
  const userPaid = userSplit ? userSplit.paidMinor : 0;
  const userOwed = userSplit ? userSplit.owedMinor : 0;
  const netUser = userPaid - userOwed;

  const isLender = netUser > 0;
  const isBorrower = netUser < 0;

  // Format date
  const dateObj = new Date(expense.expenseDate || expense.createdAt || '');
  const formattedDate = !isNaN(dateObj.getTime())
    ? dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    : expense.expenseDate || 'Unknown date';

  const categoryInfo = CATEGORY_MAP[expense.category || 'general'] || {
    label: 'General',
    icon: Receipt,
  };
  const CategoryIcon = categoryInfo.icon;

  const payingSplits = (expense.splits || []).filter((s) => s.paidMinor > 0);
  const owingSplits = (expense.splits || []).filter((s) => s.owedMinor > 0);

  const handleEditClick = () => {
    haptics.tap();
    onEdit(expense);
  };

  const handleDeleteClick = () => {
    if (showDeleteConfirm) {
      haptics.warning();
      onDelete?.(expense);
      setShowDeleteConfirm(false);
      onClose();
    } else {
      setShowDeleteConfirm(true);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto animate-fade"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl border border-[#E5D9CC] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-[#FAF6F0] border-b border-[#E5D9CC] flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-white border border-[#E5D9CC] flex items-center justify-center shadow-xs shrink-0">
              <CategoryIcon className="w-6 h-6 text-[#543A2A]" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8D7868] block">
                {categoryInfo.label} • {formattedDate}
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-[#432E22] truncate">
                {expense.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full border border-[#E5D9CC] bg-white text-[#8D7868] hover:text-[#432E22] hover:bg-[#EFE4D6] transition flex items-center justify-center font-bold cursor-pointer shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Hero Amount & Net User Perspective */}
          <div className="p-4 rounded-2xl bg-[#FAF6F0] border border-[#E5D9CC] flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <div>
              <span className="text-xs font-bold text-[#8D7868] uppercase tracking-wider block">
                Total Expense
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-[#432E22] tracking-tight">
                {formatMinor(expense.amountMinor, expense.currency)}
              </span>
            </div>

            {/* Net Status Badge */}
            <div>
              {isLender && (
                <div className="px-3.5 py-1.5 rounded-full bg-[#EAEFE8] text-[#3D5638] border border-[#D5E2D2]">
                  <span className="text-[10px] font-bold block uppercase tracking-wider leading-none">
                    YOU LENT
                  </span>
                  <span className="text-sm font-extrabold leading-none mt-0.5">
                    +{formatMinor(netUser, expense.currency)}
                  </span>
                </div>
              )}
              {isBorrower && (
                <div className="px-3.5 py-1.5 rounded-full bg-[#F8EDEA] text-[#9A3C2D] border border-[#EBD7D3]">
                  <span className="text-[10px] font-bold block uppercase tracking-wider leading-none">
                    YOU BORROWED
                  </span>
                  <span className="text-sm font-extrabold leading-none mt-0.5">
                    -{formatMinor(Math.abs(netUser), expense.currency)}
                  </span>
                </div>
              )}
              {!isLender && !isBorrower && (
                <div className="px-3 py-1 rounded-full bg-[#EFE4D6] text-[#8D7868] border border-[#E5D9CC] text-xs font-semibold">
                  Not involved
                </div>
              )}
            </div>
          </div>

          {/* Sync Warning if pending */}
          {expense._sync === 'pending' && (
            <div className="p-3 rounded-2xl bg-[#FFF8EE] border border-[#ECD3B6] text-xs font-semibold text-[#8C5E23] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
              <span>Saved locally, will sync automatically once connected.</span>
            </div>
          )}

          {/* Paid By Section */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6E5849]">
              Paid By ({payingSplits.length})
            </h3>
            <div className="space-y-1.5">
              {payingSplits.map((s) => {
                const member = memberMap.get(s.memberId);
                const isMe = member?.id === currentMemberId;
                return (
                  <div
                    key={s.memberId}
                    className="p-3 rounded-2xl bg-white border border-[#E5D9CC] flex items-center justify-between gap-2 shadow-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-[#543A2A] text-[#FAF6F0] font-bold text-xs flex items-center justify-center shrink-0">
                        {member?.displayName.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-[#432E22] truncate block">
                          {member?.displayName || 'Unknown'} {isMe ? '(You)' : ''}
                        </span>
                      </div>
                    </div>

                    <span className="text-xs font-bold text-[#432E22] shrink-0">
                      {formatMinor(s.paidMinor, expense.currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Split / Owes Breakdown */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#6E5849]">
                Split Breakdown ({owingSplits.length})
              </h3>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#EFE4D6] text-[#543A2A] border border-[#E5D9CC]">
                {expense.splitType || 'Equal'}
              </span>
            </div>

            <div className="space-y-1.5">
              {owingSplits.map((s) => {
                const member = memberMap.get(s.memberId);
                const isMe = member?.id === currentMemberId;
                return (
                  <div
                    key={s.memberId}
                    className="p-3 rounded-2xl bg-white border border-[#E5D9CC] flex items-center justify-between gap-2 shadow-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-[#FAF6F0] border border-[#E5D9CC] text-[#543A2A] font-bold text-xs flex items-center justify-center shrink-0">
                        {member?.displayName.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-[#432E22] truncate block">
                          {member?.displayName || 'Unknown'} {isMe ? '(You)' : ''}
                        </span>
                      </div>
                    </div>

                    <span className="text-xs font-bold text-[#432E22] shrink-0">
                      {formatMinor(s.owedMinor, expense.currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes if present */}
          {expense.notes && (
            <div className="space-y-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#6E5849]">
                Notes
              </h3>
              <div className="p-3 rounded-2xl bg-[#FAF6F0] border border-[#E5D9CC] text-xs text-[#543A2A] font-medium whitespace-pre-wrap">
                {expense.notes}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 sm:p-5 bg-[#FAF6F0] border-t border-[#E5D9CC] flex flex-col sm:flex-row items-center gap-2.5">
          <button
            type="button"
            onClick={handleEditClick}
            className="w-full sm:flex-1 py-3 px-4 rounded-full bg-[#543A2A] hover:bg-[#432E20] text-[#FAF6F0] font-bold text-xs uppercase tracking-wider transition active:scale-95 shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            <Pencil className="w-4 h-4" />
            <span>Edit Expense</span>
          </button>

          {onDelete && (
            <button
              type="button"
              onClick={handleDeleteClick}
              className={`w-full sm:w-auto py-3 px-4 rounded-full font-bold text-xs uppercase tracking-wider transition active:scale-95 border cursor-pointer ${showDeleteConfirm
                ? 'bg-[#A83232] text-white border-[#A83232] hover:bg-[#8B2525]'
                : 'bg-white text-[#A83232] border-[#E5D9CC] hover:bg-[#FCE8E6]'
                }`}
            >
              {showDeleteConfirm ? 'Confirm Delete?' : 'Delete'}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto py-3 px-4 rounded-full bg-white hover:bg-[#EFE4D6] text-[#543A2A] border border-[#E5D9CC] font-bold text-xs uppercase tracking-wider transition active:scale-95 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

