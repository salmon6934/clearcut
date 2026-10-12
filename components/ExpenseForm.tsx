'use client';

// components/ExpenseForm.tsx
// Comprehensive Expense Creation & Edit Form Integrating Payer & Split Editors

import React, { useState } from 'react';
import type { Member, ExpenseDraft, SplitType } from '../lib/data/types';
import type { Split } from '../lib/engine/split';
import { parseMoneyToMinor, formatMinor } from '../lib/engine/money';
import { PayerEditor, type PayerAllocation } from './PayerEditor';
import { SplitEditor } from './SplitEditor';
import { validateExpense } from '../lib/engine/validate';
import { ReceiptPicker } from './ReceiptPicker';
import { uploadReceiptToStorage } from '../lib/native/camera';

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
  const [receiptBlob, setReceiptBlob] = useState<Blob | null>(null);
  const [receiptPath, setReceiptPath] = useState<string | null>(initialDraft?.receiptPath || null);
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
      const unifiedSplits: Split[] = members.map((m) => {
        const payerEntry = payers.find((p) => p.memberId === m.id);
        const owedEntry = owedSplits.find((s) => s.memberId === m.id);

        return {
          memberId: m.id,
          paidMinor: payerEntry ? payerEntry.paidMinor : 0,
          owedMinor: owedEntry ? owedEntry.owedMinor : 0,
          splitValue: owedEntry?.splitValue,
        };
      });

      const expenseId = initialDraft?.id || (typeof crypto !== 'undefined' ? crypto.randomUUID() : 'draft-id');
      let finalReceiptPath = receiptPath;

      if (receiptBlob) {
        try {
          const uploadRes = await uploadReceiptToStorage(groupId, expenseId, receiptBlob);
          finalReceiptPath = uploadRes.path;
        } catch (uploadErr) {
          console.warn('Failed to upload receipt, saving expense anyway:', uploadErr);
        }
      }

      const draft: ExpenseDraft = {
        id: initialDraft?.id || expenseId,
        groupId,
        title: title.trim(),
        amountMinor: totalAmountMinor,
        currency,
        category,
        expenseDate,
        notes: notes.trim() || null,
        splitType,
        splits: unifiedSplits,
        receiptPath: finalReceiptPath,
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
        <div className="p-3.5 rounded-xl text-xs font-black uppercase font-mono bg-[#ff8a80] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]">
          {error}
        </div>
      )}

      {/* Expense Description */}
      <div className="space-y-1.5">
        <label className="block text-xs font-mono font-black text-black uppercase tracking-wider">
          EXPENSE DESCRIPTION
        </label>
        <div className="relative flex items-center">
          <input
            type="text"
            required
            maxLength={120}
            placeholder="Dinner at Social, Roadtrip fuel..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-3 text-base font-bold rounded-xl border-2 border-black bg-[#e8e8e2] text-black placeholder:text-black/40 focus:outline-none focus:bg-white shadow-[2px_2px_0px_0px_#000]"
          />
          {title.trim().length > 0 && (
            <span className="absolute right-3.5 text-black font-black text-sm">
              ✓
            </span>
          )}
        </div>
      </div>

      {/* Total Amount Hero Card matching Stitch Image 2 */}
      <div className="p-4 sm:p-5 rounded-2xl border-2 border-black bg-[#ccff00] shadow-[4px_4px_0px_0px_#000] space-y-3">
        <label className="block text-xs font-mono font-black text-black uppercase tracking-wider">
          TOTAL AMOUNT ({currency})
        </label>

        <div className="p-3 bg-[#e6ff66] border-2 border-black rounded-xl flex items-center gap-2 shadow-[2px_2px_0px_0px_#000]">
          <span className="text-3xl font-black font-mono text-black">
            {currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₹'}
          </span>
          <input
            type="text"
            inputMode="decimal"
            required
            placeholder="0.00"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className="w-full text-3xl sm:text-4xl font-black tracking-tight bg-transparent text-black placeholder:text-black/40 focus:outline-none font-mono"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <div className="px-3 py-1 rounded-lg border-2 border-black bg-white text-xs font-mono font-bold text-black shadow-[2px_2px_0px_0px_#000] flex items-center gap-1.5">
            <span>📅</span>
            <input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="bg-transparent border-none text-xs font-mono font-bold text-black focus:outline-none"
            />
          </div>

          <div className="px-3 py-1 rounded-lg border-2 border-black bg-white text-xs font-mono font-black text-black shadow-[2px_2px_0px_0px_#000]">
            ₹ {currency}
          </div>
        </div>
      </div>

      {/* Category Selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-black text-black uppercase tracking-wider">
            CATEGORY
          </span>
          <span className="px-2 py-0.5 rounded border border-black bg-black text-white text-[10px] font-mono font-bold uppercase">
            {CATEGORIES.find((c) => c.id === category)?.label.toUpperCase() || 'GENERAL'}
          </span>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((c) => {
            const isSelected = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`px-3 py-2 rounded-xl border-2 border-black text-xs font-mono font-black shrink-0 transition flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_#000] ${
                  isSelected
                    ? 'bg-black text-[#ccff00]'
                    : 'bg-white text-black hover:bg-[#fafaf6]'
                }`}
              >
                <span>{c.icon}</span>
                <span>{c.id.toUpperCase()}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Receipt Attachment (T-2.9.1) */}
      <ReceiptPicker
        receiptPath={receiptPath}
        onReceiptSelected={(blob) => {
          setReceiptBlob(blob);
        }}
        onReceiptRemoved={() => {
          setReceiptBlob(null);
          setReceiptPath(null);
        }}
        disabled={isSaving}
      />

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
      <div className="p-3.5 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_0px_#000] space-y-1.5">
        <label className="block text-xs font-mono font-black text-black uppercase tracking-wider">
          NOTES & DETAILS
        </label>
        <textarea
          rows={2}
          placeholder="Add table number, notes, or tip details..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border-2 border-black bg-white text-black focus:outline-none focus:bg-[#faffea] resize-none font-medium"
        />
      </div>

      {/* Sticky Save Expense CTA matching Stitch Image 2 */}
      <div className="pt-2 sticky bottom-4 z-30">
        <button
          type="submit"
          disabled={!isFormSubmittable}
          className="w-full py-4 rounded-xl bg-[#ccff00] hover:bg-[#bbf000] text-black font-black text-base uppercase border-2 border-black shadow-[4px_4px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none transition cursor-pointer flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <>
              <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              <span>SAVING EXPENSE...</span>
            </>
          ) : (
            <>
              <span>✓</span>
              <span>
                SAVE EXPENSE • {formatMinor(totalAmountMinor, currency)}
              </span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
