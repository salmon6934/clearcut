'use client';

// components/ExpenseForm.tsx
// Streamlined Expense Creation & Edit Form containing only essential fields

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
  Calendar,
  Zap,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Handshake,
  Check,
  SlidersHorizontal,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';
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

const CATEGORIES: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'general', label: 'General', icon: Receipt },
  { id: 'food', label: 'Food & Dining', icon: Utensils },
  { id: 'drinks', label: 'Drinks & Bar', icon: Wine },
  { id: 'groceries', label: 'Groceries', icon: ShoppingCart },
  { id: 'transport', label: 'Transport', icon: Car },
  { id: 'hotel', label: 'Stay / Hotel', icon: Building2 },
  { id: 'entertainment', label: 'Entertainment', icon: Ticket },
  { id: 'shopping', label: 'Shopping', icon: ShoppingBag },
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
  const [showMoreSplitOptions, setShowMoreSplitOptions] = useState<boolean>(
    Boolean(initialDraft?.splitType && initialDraft.splitType !== 'equal')
  );

  // Identify current user member and friends for presets
  const myMember = members.find((m) => m.userId === currentUserId) || members[0];
  const myMemberId = myMember?.id;
  const otherMembers = members.filter((m) => m.id !== myMemberId);

  type PresetType = 'owed_full' | 'owe_full' | 'paid_half' | 'friend_paid_half' | null;
  const [selectedFriendId, setSelectedFriendId] = useState<string>(
    otherMembers[0]?.id || ''
  );
  const [activePreset, setActivePreset] = useState<PresetType>(null);
  const [controlledPayerId, setControlledPayerId] = useState<string | undefined>(undefined);
  const [controlledParticipantIds, setControlledParticipantIds] = useState<string[] | undefined>(undefined);

  const applyPreset = (type: PresetType, friendId = selectedFriendId) => {
    if (activePreset === type) {
      // Toggle off preset back to default
      setActivePreset(null);
      setControlledPayerId(undefined);
      setControlledParticipantIds(members.map((m) => m.id));
      return;
    }

    const targetFriendId = friendId || otherMembers[0]?.id;
    if (!myMemberId || !targetFriendId) return;

    setActivePreset(type);

    if (type === 'owed_full') {
      // I am owed the full amount: You paid full, friend owes full
      setControlledPayerId(myMemberId);
      setControlledParticipantIds([targetFriendId]);
    } else if (type === 'owe_full') {
      // I owe the full amount: Friend paid full, you owe full
      setControlledPayerId(targetFriendId);
      setControlledParticipantIds([myMemberId]);
    } else if (type === 'paid_half') {
      // I paid and my friend owes half amount: You paid, split equally between both
      setControlledPayerId(myMemberId);
      setControlledParticipantIds([myMemberId, targetFriendId]);
    } else if (type === 'friend_paid_half') {
      // My friend paid and I owe half amount: Friend paid, split equally between both
      setControlledPayerId(targetFriendId);
      setControlledParticipantIds([myMemberId, targetFriendId]);
    }
  };

  const selectedFriend = otherMembers.find((m) => m.id === selectedFriendId) || otherMembers[0];
  const friendName = selectedFriend?.displayName || 'Friend';

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
            <Calendar className="w-4 h-4 text-[#8D7868]" />
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
            const CategoryIcon = c.icon;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`px-3.5 py-2 rounded-full text-xs font-bold shrink-0 transition flex items-center gap-1.5 cursor-pointer border ${isSelected
                    ? 'bg-[#543A2A] text-[#FAF6F0] border-[#543A2A] shadow-sm'
                    : 'bg-white text-[#543A2A] border-[#E5D9CC] hover:bg-[#EFE4D6]'
                  }`}
              >
                <CategoryIcon className={`w-3.5 h-3.5 ${isSelected ? 'text-[#FAF6F0]' : 'text-[#7A6251]'}`} />
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
        selectedPayerId={controlledPayerId}
        initialPayers={initialDraft?.splits.map((s) => ({
          memberId: s.memberId,
          paidMinor: s.paidMinor,
        }))}
        onChange={(p, valid) => {
          setPayers(p);
          setIsPayersValid(valid);
        }}
      />

      {/* Quick Presets for Split (Placed below Category and Paid By) */}
      {otherMembers.length > 0 && (
        <div className="space-y-2.5 p-3.5 sm:p-4 rounded-3xl border border-[#E5D9CC] bg-[#FAF6F0] shadow-xs">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[#6E5849] uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-[#D36135]" /> Quick Presets
            </label>
            {otherMembers.length > 1 && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8D7868]">
                <span>With:</span>
                <select
                  value={selectedFriendId}
                  onChange={(e) => {
                    setSelectedFriendId(e.target.value);
                    if (activePreset) {
                      applyPreset(activePreset, e.target.value);
                    }
                  }}
                  className="px-2.5 py-1 rounded-full bg-white border border-[#E5D9CC] text-[#432E22] font-bold text-xs focus:outline-none cursor-pointer"
                >
                  {otherMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* 1. I am owed the full amount */}
            <button
              type="button"
              onClick={() => applyPreset('owed_full')}
              className={`p-3 rounded-2xl border text-left transition active:scale-[0.98] cursor-pointer flex items-center justify-between ${activePreset === 'owed_full'
                  ? 'bg-[#543A2A] text-[#FAF6F0] border-[#543A2A] shadow-sm'
                  : 'bg-white hover:bg-[#EFE4D6] text-[#432E22] border-[#E5D9CC]'
                }`}
            >
              <div className="min-w-0 pr-2">
                <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                  <ArrowDownLeft className="w-3.5 h-3.5 text-[#2E7D32] shrink-0" />
                  <span>You are owed full amount</span>
                </div>
                <div
                  className={`text-[11px] font-medium truncate mt-0.5 ${activePreset === 'owed_full' ? 'text-[#FAF6F0]/80' : 'text-[#8D7868]'
                    }`}
                >
                  You paid, {friendName} owes all
                </div>
              </div>
              <ArrowRight className="w-4 h-4 font-bold shrink-0" />
            </button>

            {/* 2. I owe the full amount */}
            <button
              type="button"
              onClick={() => applyPreset('owe_full')}
              className={`p-3 rounded-2xl border text-left transition active:scale-[0.98] cursor-pointer flex items-center justify-between ${activePreset === 'owe_full'
                  ? 'bg-[#543A2A] text-[#FAF6F0] border-[#543A2A] shadow-sm'
                  : 'bg-white hover:bg-[#EFE4D6] text-[#432E22] border-[#E5D9CC]'
                }`}
            >
              <div className="min-w-0 pr-2">
                <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#C62828] shrink-0" />
                  <span>You owe the full amount</span>
                </div>
                <div
                  className={`text-[11px] font-medium truncate mt-0.5 ${activePreset === 'owe_full' ? 'text-[#FAF6F0]/80' : 'text-[#8D7868]'
                    }`}
                >
                  {friendName} paid, you owe all
                </div>
              </div>
              <ArrowLeft className="w-4 h-4 font-bold shrink-0" />
            </button>

            {/* 3. I paid and my friend owes half amount */}
            <button
              type="button"
              onClick={() => applyPreset('paid_half')}
              className={`p-3 rounded-2xl border text-left transition active:scale-[0.98] cursor-pointer flex items-center justify-between ${activePreset === 'paid_half'
                  ? 'bg-[#543A2A] text-[#FAF6F0] border-[#543A2A] shadow-sm'
                  : 'bg-white hover:bg-[#EFE4D6] text-[#432E22] border-[#E5D9CC]'
                }`}
            >
              <div className="min-w-0 pr-2">
                <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                  <Handshake className="w-3.5 h-3.5 text-[#543A2A] shrink-0" />
                  <span>You paid, {friendName} owes half</span>
                </div>
                <div
                  className={`text-[11px] font-medium truncate mt-0.5 ${activePreset === 'paid_half' ? 'text-[#FAF6F0]/80' : 'text-[#8D7868]'
                    }`}
                >
                  You paid, split 50/50
                </div>
              </div>
              <span className="text-xs font-bold shrink-0">½</span>
            </button>

            {/* 4. My friend paid and I owe half amount */}
            <button
              type="button"
              onClick={() => applyPreset('friend_paid_half')}
              className={`p-3 rounded-2xl border text-left transition active:scale-[0.98] cursor-pointer flex items-center justify-between ${activePreset === 'friend_paid_half'
                  ? 'bg-[#543A2A] text-[#FAF6F0] border-[#543A2A] shadow-sm'
                  : 'bg-white hover:bg-[#EFE4D6] text-[#432E22] border-[#E5D9CC]'
                }`}
            >
              <div className="min-w-0 pr-2">
                <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                  <Handshake className="w-3.5 h-3.5 text-[#543A2A] shrink-0" />
                  <span>{friendName} paid, You owe half</span>
                </div>
                <div
                  className={`text-[11px] font-medium truncate mt-0.5 ${activePreset === 'friend_paid_half' ? 'text-[#FAF6F0]/80' : 'text-[#8D7868]'
                    }`}
                >
                  {friendName} paid, split 50/50
                </div>
              </div>
              <span className="text-xs font-bold shrink-0">½</span>
            </button>
          </div>
        </div>
      )}

      {/* More Split Options Section (Hidden by default, appears at the bottom on click) */}
      <div className="space-y-3 pt-1">
        <button
          type="button"
          onClick={() => setShowMoreSplitOptions((prev) => !prev)}
          className="w-full py-3 px-4 rounded-2xl border border-[#E5D9CC] bg-[#FAF6F0] hover:bg-[#EFE4D6] text-[#543A2A] text-xs font-bold uppercase tracking-wider transition active:scale-[0.99] flex items-center justify-between cursor-pointer shadow-xs"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[#7A6251]" />
            <span>{showMoreSplitOptions ? 'Hide Split Options' : 'More Split Options'}</span>
            {!showMoreSplitOptions && splitType !== 'equal' && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#543A2A] text-[#FAF6F0]">
                {splitType.toUpperCase()}
              </span>
            )}
          </div>
          <ChevronDown
            className={`w-4 h-4 text-[#8D7868] transition-transform duration-200 ${
              showMoreSplitOptions ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Split Distribution (Hidden by default) */}
        <div className={showMoreSplitOptions ? 'block space-y-3 animate-fadeIn' : 'hidden'}>
          <SplitEditor
            members={members}
            totalAmountMinor={totalAmountMinor}
            currency={currency}
            initialSplitType={initialDraft?.splitType}
            initialSplits={initialDraft?.splits}
            selectedParticipantIds={controlledParticipantIds}
            onChange={(splits, valid, type) => {
              setOwedSplits(splits);
              setIsSplitsValid(valid);
              setSplitType(type);
            }}
          />
        </div>
      </div>

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
              <Check className="w-4 h-4" />
              <span>
                SAVE EXPENSE {totalAmountMinor > 0 ? `• ${formatMinor(totalAmountMinor, currency)}` : ''}
              </span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
