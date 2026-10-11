'use client';

// components/ExpenseForm.tsx
// Comprehensive Expense Creation & Edit Form Integrating Payer & Split Editors

import React, { useState } from 'react';
import type { Member, ExpenseDraft, SplitType } from '../lib/data/types';
import type { Split } from '../lib/engine/split';
import { parseMoneyToMinor } from '../lib/engine/money';
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
  { id: 'drinks', label: 'Drinks & Bar', icon: '🍻' },
  { id: 'groceries', label: 'Groceries', icon: '🛒' },
  { id: 'transport', label: 'Transport / Taxi', icon: '🚕' },
  { id: 'hotel', label: 'Stay / Hotel', icon: '🏨' },
  { id: 'entertainment', label: 'Fun & Movies', icon: '🎟️' },
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
  const [notes, setNotes] = useState(initialDraft?.notes || '');
  const [error, setError] = useState<string | null>(null);

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
    isSplitsValid;

  const handleSubmit = (e: React.FormEvent) => {
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

    // Build unified Split[] containing both paidMinor and owedMinor per member
    const unifiedSplits: Split[] = members.map((m) => {
      const payerEntry = payers.find((p) => p.memberId === m.id);
      const owedEntry = owedSplits.find((s) => s.memberId === m.id);

      return {
        memberId: m.id,
        paidMinor: payerEntry ? payerEntry.paidMinor : 0,
        owedMinor: owedEntry ? owedEntry.owedMinor : 0,
      };
    });

    const draft: ExpenseDraft = {
      id: initialDraft?.id,
      groupId,
      title: title.trim(),
      amountMinor: totalAmountMinor,
      currency,
      category,
      expenseDate,
      notes: notes.trim() || null,
      splitType,
      splits: unifiedSplits,
    };

    try {
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
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg mx-auto">
      {error && (
        <div className="p-3.5 rounded-xl text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
          {error}
        </div>
      )}

      {/* Title & Amount Card */}
      <div className="p-5 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm space-y-4">
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
            Description
          </label>
          <input
            type="text"
            required
            maxLength={120}
            placeholder="e.g. Dinner at Olive Beach, Flight tickets"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3.5 py-2.5 text-base font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
            Total Amount ({currency})
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              required
              placeholder="0.00"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="w-full px-3.5 py-3 text-2xl font-bold tracking-tight rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
            />
          </div>
        </div>

        {/* Date & Category Grid */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Date</label>
            <input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.label}
                </option>
              ))}
            </select>
          </div>
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

      {/* Notes */}
      <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <label className="block text-xs font-medium text-zinc-400 mb-1">
          Notes (Optional)
        </label>
        <textarea
          rows={2}
          placeholder="Add receipt notes or references..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
        />
      </div>

      {/* Bottom Actions */}
      <div className="flex items-center gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 text-sm font-semibold rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-700 dark:text-zinc-300"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!isFormSubmittable}
          className="flex-1 py-3 text-sm font-semibold rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-lg shadow-emerald-600/20 disabled:opacity-50 disabled:pointer-events-none transition-all"
        >
          {initialDraft?.id ? 'Save Changes' : 'Save Expense'}
        </button>
      </div>
    </form>
  );
}
