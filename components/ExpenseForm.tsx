'use client';

// components/ExpenseForm.tsx
// Streamlined Expense Creation & Edit Form containing only essential fields

import React, { useState } from 'react';
import type { Member, ExpenseDraft, SplitType } from '../lib/data/types';
import type { Split } from '../lib/engine/split';
import { parseMoneyToMinor, formatMinor } from '../lib/engine/money';
import { PayerEditor, type PayerAllocation } from './PayerEditor';
import { SplitEditor } from './SplitEditor';
import { validateExpense } from '../lib/engine/validate';

interface ExpenseFormProps {
  groupId: string;
  currency: string;
  members: Member[];
  currentUserId?: string;
  initialDraft?: ExpenseDraft;
  onSave: (draft: ExpenseDraft) => void;
  onCancel?: () => void;
}

const CATEGORIES = [
  { id: 'general', label: 'General', icon: '🧾' },
  { id: 'food', label: 'Food & Dining', icon: '🍽️' },
  { id: 'drinks', label: 'Drinks & Bar', icon: '☕' },
  { id: 'groceries', label: 'Groceries', icon: '🛒' },
  { id: 'transport', label: 'Transport', icon: '🚕' },
  { id: 'hotel', label: 'Stay / Hotel', icon: '🏨' },
  { id: 'entertainment', label: 'Entertainment', icon: '🎟️' },
  { id: 'shopping', label: 'Shopping', icon: '🛍️' },
];

export function ExpenseForm({
  groupId,
  currency,
  members,
  currentUserId,
  initialDraft,
  onSave,
  onCancel,
}: ExpenseFormProps) {
  const [title, setTitle] = useState(initialDraft?.title || '');
  const [amountStr, setAmountStr] = useState(
    initialDraft?.amountMinor ? (initialDraft.amountMinor / 100).toFixed(2) : ''
  );
  const [category, setCategory] = useState(initialDraft?.category || 'general');
  const [expenseDate, setExpenseDate] = useState(
    initialDraft?.expenseDate || new Date().toISOString().split('T')[0]
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Payers & Splits state from child editors
  const [payers, setPayers] = useState<PayerAllocation[]>([]);
  const [isPayersValid, setIsPayersValid] = useState(false);

  const [owedSplits, setOwedSplits] = useState<Split[]>([]);
  const [isSplitsValid, setIsSplitsValid] = useState(false);
  const [splitType, setSplitType] = useState<SplitType>(
    initialDraft?.splitType || 'equal'
  );

  const totalAmountMinor = parseMoneyToMinor(amountStr, currency) || 0;

  const isFormSubmittable =
    title.trim().length > 0 &&
    totalAmountMinor > 0 &&
    isPayersValid &&
    isSplitsValid &&
    !isSaving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Please enter a description for the expense');
      return;
    }
    if (totalAmountMinor <= 0) {
      setError('Please enter a valid amount greater than 0');
      return;
    }
    if (!isPayersValid) {
      setError('Paid amounts must equal the total expense amount');
      return;
    }
    if (!isSplitsValid) {
      setError('Split shares must equal the total expense amount');
      return;
    }

    setIsSaving(true);
    try {
      // Build unified Split[] containing both paidMinor and owedMinor per member
      const rawSplits: Split[] = members.map((m) => {
        const payerEntry = payers.find((p) => p.memberId === m.id);
        const owedEntry = owedSplits.find((s) => s.memberId === m.id);

        return {
          memberId: m.id,
          paidMinor: payerEntry ? payerEntry.paidMinor : 0,
          owedMinor: owedEntry ? owedEntry.owedMinor : 0,
          splitValue: owedEntry?.splitValue,
        };
      });

      // Filter to active participants only (satisfies DB constraint: paid_minor > 0 or owed_minor > 0)
      const unifiedSplits = rawSplits.filter((s) => s.paidMinor > 0 || s.owedMinor > 0);

      const draft: ExpenseDraft = {
        id: initialDraft?.id,
        groupId,
        title: title.trim(),
        amountMinor: totalAmountMinor,
        currency,
        category,
        expenseDate,
        notes: null,
        splitType,
        splits: unifiedSplits.length > 0 ? unifiedSplits : rawSplits,
        receiptPath: null,
      };

      // Dry-run Invariant I2 verification
      validateExpense({
        ...draft,
        id: draft.id || 'draft-id',
        version: 1,
        createdBy: currentUserId || 'local',
        expenseDate: draft.expenseDate || new Date().toISOString().split('T')[0] || '',
      });

      onSave(draft);
    } catch (err: any) {
      setError(err.message || 'Validation failed for this expense');
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg mx-auto">
      {error && (
        <div className="p-3.5 rounded-2xl text-xs font-bold bg-[#FCE8E6] text-[#A83232] border border-[#F5C2C0] shadow-sm">
          {error}
        </div>
      )}

      {/* Expense Description */}
      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-[#6E5849] uppercase tracking-wider">
          DESCRIPTION
        </label>
        <div className="relative flex items-center">
          <input
            type="text"
            required
            maxLength={120}
            placeholder="e.g. Coffee, Dinner, Groceries"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-3 text-base font-medium rounded-2xl border border-[#E5D9CC] bg-white text-[#432E22] placeholder:text-[#A89689] focus:outline-none focus:border-[#543A2A] shadow-sm"
          />
        </div>
      </div>

      {/* Total Amount Hero Card */}
      <div className="p-4 sm:p-5 rounded-3xl border border-[#E5D9CC] bg-[#FAF6F0] shadow-sm space-y-3">
        <label className="block text-xs font-bold text-[#6E5849] uppercase tracking-wider">
          TOTAL AMOUNT ({currency})
        </label>

        <div className="p-3 bg-white border border-[#E5D9CC] rounded-2xl flex items-center gap-2 shadow-xs">
          <span className="text-3xl font-bold text-[#543A2A]">
            {currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₹'}
          </span>
          <input
            type="text"
            inputMode="decimal"
            required
            placeholder="0.00"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className="w-full text-3xl sm:text-4xl font-bold tracking-tight bg-transparent text-[#432E22] placeholder:text-[#A89689] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <div className="px-3 py-1.5 rounded-full border border-[#E5D9CC] bg-white text-xs font-semibold text-[#543A2A] shadow-xs flex items-center gap-1.5">
            <span>📅</span>
            <input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="bg-transparent border-none text-xs font-semibold text-[#543A2A] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Category Selector */}
      <div className="space-y-2">
        <label className="block text-xs font-bold text-[#6E5849] uppercase tracking-wider">
          CATEGORY
        </label>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((c) => {
            const isSelected = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`px-3.5 py-2 rounded-full text-xs font-bold shrink-0 transition flex items-center gap-1.5 cursor-pointer border ${
                  isSelected
                    ? 'bg-[#543A2A] text-[#FAF6F0] border-[#543A2A] shadow-sm'
                    : 'bg-white text-[#543A2A] border-[#E5D9CC] hover:bg-[#EFE4D6]'
                }`}
              >
                <span>{c.icon}</span>
                <span>{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Who Paid Section */}
      <PayerEditor
        members={members}
        totalAmountMinor={totalAmountMinor}
        currency={currency}
        currentUserId={currentUserId}
        initialPayers={initialDraft?.splits.map((s) => ({
          memberId: s.memberId,
          paidMinor: s.paidMinor,
        }))}
        onChange={(p, valid) => {
          setPayers(p);
          setIsPayersValid(valid);
        }}
      />

      {/* Split Section */}
      <SplitEditor
        members={members}
        totalAmountMinor={totalAmountMinor}
        currency={currency}
        initialSplitType={initialDraft?.splitType}
        initialSplits={initialDraft?.splits}
        onChange={(splits, valid, type) => {
          setOwedSplits(splits);
          setIsSplitsValid(valid);
          setSplitType(type);
        }}
      />

      {/* Sticky Save Expense CTA */}
      <div className="pt-2 sticky bottom-4 z-30">
        <button
          type="submit"
          disabled={!isFormSubmittable}
          className="w-full py-4 rounded-full bg-[#543A2A] hover:bg-[#432E20] text-[#FAF6F0] font-bold text-sm tracking-wide shadow-xl active:scale-95 disabled:bg-[#8D7868] disabled:text-[#EFE4D6] disabled:opacity-100 disabled:pointer-events-none transition cursor-pointer flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>SAVING...</span>
            </>
          ) : (
            <>
              <span>✓</span>
              <span>
                SAVE EXPENSE {totalAmountMinor > 0 ? `• ₹${formatMinor(totalAmountMinor, currency)}` : ''}
              </span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
