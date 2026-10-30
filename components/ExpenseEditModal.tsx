'use client';

// components/ExpenseEditModal.tsx
// Warm Cafe Modal wrapper for editing an existing expense

import React from 'react';
import { Pencil, X } from 'lucide-react';
import type { Expense, Member, ExpenseDraft } from '../lib/data/types';
import { ExpenseForm } from './ExpenseForm';

interface ExpenseEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense: Expense | null;
  groupId: string;
  currency: string;
  members: Member[];
  currentUserId?: string;
  onSave: (draft: ExpenseDraft) => void;
}

export function ExpenseEditModal({
  isOpen,
  onClose,
  expense,
  groupId,
  currency,
  members,
  currentUserId,
  onSave,
}: ExpenseEditModalProps) {
  if (!isOpen || !expense) return null;

  const initialDraft: ExpenseDraft = {
    id: expense.id,
    groupId: expense.groupId,
    title: expense.title,
    notes: expense.notes,
    amountMinor: expense.amountMinor,
    currency: expense.currency,
    category: expense.category,
    expenseDate: expense.expenseDate,
    splitType: expense.splitType,
    splits: expense.splits,
    receiptPath: expense.receiptPath,
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
      <div className="w-full max-w-xl bg-white rounded-t-3xl sm:rounded-3xl border border-[#E5D9CC] shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-[#FAF6F0] border-b border-[#E5D9CC] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-[#543A2A]" />
            <h2 className="text-base sm:text-lg font-bold text-[#432E22]">
              Edit Expense
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full border border-[#E5D9CC] bg-white text-[#8D7868] hover:text-[#432E22] hover:bg-[#EFE4D6] transition flex items-center justify-center font-bold cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-4 sm:p-5 overflow-y-auto">
          <ExpenseForm
            groupId={groupId}
            currency={currency}
            members={members}
            currentUserId={currentUserId}
            initialDraft={initialDraft}
            onSave={(draft) => {
              onSave(draft);
              onClose();
            }}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}

