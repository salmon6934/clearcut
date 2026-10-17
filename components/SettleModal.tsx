'use client';

// components/SettleModal.tsx
// Warm Cafe Settlement Modal

import React, { useState, useEffect } from 'react';
import type { Member, SettlementDraft, SettlementMethod } from '../lib/data/types';
import { parseMoneyToMinor, formatMinor } from '../lib/engine/money';
import { useHardwareBackButton } from '../lib/native/back-button';

interface SettleModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  currency: string;
  members: Member[];
  initialFromMemberId?: string;
  initialToMemberId?: string;
  initialAmountMinor?: number;
  onSettle: (draft: SettlementDraft) => void;
}

const SETTLEMENT_METHODS: { id: SettlementMethod; label: string; icon: string }[] = [
  { id: 'upi', label: 'UPI / QR', icon: '⚡' },
  { id: 'cash', label: 'Cash', icon: '💵' },
  { id: 'venmo', label: 'Venmo', icon: '💳' },
  { id: 'bank', label: 'Bank Transfer', icon: '🏦' },
];

export function SettleModal({
  isOpen,
  onClose,
  groupId,
  currency,
  members,
  initialFromMemberId,
  initialToMemberId,
  initialAmountMinor,
  onSettle,
}: SettleModalProps) {
  useHardwareBackButton(isOpen, onClose);

  const [fromId, setFromId] = useState(initialFromMemberId || members[0]?.id || '');
  const [toId, setToId] = useState(
    initialToMemberId || members.find((m) => m.id !== initialFromMemberId)?.id || ''
  );
  const [amountStr, setAmountStr] = useState(
    initialAmountMinor ? (initialAmountMinor / 100).toFixed(2) : ''
  );
  const [method, setMethod] = useState<SettlementMethod>('upi');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialFromMemberId) setFromId(initialFromMemberId);
    if (initialToMemberId) setToId(initialToMemberId);
    if (initialAmountMinor) setAmountStr((initialAmountMinor / 100).toFixed(2));
  }, [initialFromMemberId, initialToMemberId, initialAmountMinor]);

  if (!isOpen) return null;

  const payerMember = members.find((m) => m.id === fromId);
  const payeeMember = members.find((m) => m.id === toId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (fromId === toId) {
      setError('Debtor and collector cannot be the same member');
      return;
    }

    const minor = parseMoneyToMinor(amountStr, currency);
    if (!minor || minor <= 0) {
      setError('Please enter a valid settlement amount greater than 0');
      return;
    }

    const draft: SettlementDraft = {
      groupId,
      fromMemberId: fromId,
      toMemberId: toId,
      amountMinor: minor,
      method,
      note: note.trim() || null,
      settledOn: new Date().toISOString().split('T')[0],
    };

    onSettle(draft);
    onClose();
  };

  const handleQuickAmount = (ratio: number) => {
    if (initialAmountMinor) {
      const amt = Math.round(initialAmountMinor * ratio) / 100;
      setAmountStr(amt.toFixed(2));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div
        className="relative w-full max-w-lg bg-white border border-[#E5D9CC] rounded-3xl p-5 sm:p-6 shadow-xl space-y-4 my-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settle-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E5D9CC]">
          <div>
            <h2 id="settle-title" className="text-xl font-bold text-[#432E22] tracking-tight">
              Settle Balance
            </h2>
            <p className="text-xs text-[#8D7868]">Record a direct settlement payment</p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="w-8 h-8 rounded-full border border-[#E5D9CC] bg-white hover:bg-[#FAF6F0] text-[#543A2A] font-bold text-xs flex items-center justify-center transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl text-xs font-bold bg-[#FCE8E6] text-[#A83232] border border-[#F5C2C0]">
            {error}
          </div>
        )}

        {/* Visual Netting Route Card */}
        <div className="border border-[#E5D9CC] rounded-2xl overflow-hidden bg-[#FAF6F0] p-4">
          <div className="flex items-center justify-between gap-3">
            {/* Debtor */}
            <div className="text-center space-y-1">
              <div className="w-12 h-12 mx-auto rounded-full bg-[#E5BFB0] text-[#432E22] flex items-center justify-center font-bold text-lg shadow-xs">
                {payerMember?.displayName?.charAt(0).toUpperCase() || 'D'}
              </div>
              <span className="text-xs font-bold text-[#432E22] block truncate max-w-[90px]">
                {payerMember?.displayName || 'Debtor'}
              </span>
              <span className="inline-block px-2 py-0.5 rounded-full bg-[#FCE8E6] text-[#A83232] text-[10px] font-bold uppercase">
                Payer
              </span>
            </div>

            {/* Arrow & Amount Center */}
            <div className="flex-1 text-center space-y-1.5 px-2">
              <div className="inline-block px-3 py-1 bg-[#543A2A] text-[#FAF6F0] font-bold text-sm rounded-full shadow-xs">
                ₹{amountStr || '0.00'}
              </div>
              <div className="flex items-center justify-center gap-1">
                <div className="h-0.5 bg-[#E5D9CC] flex-1" />
                <div className="w-6 h-6 rounded-full bg-[#EFE4D6] text-[#543A2A] flex items-center justify-center font-bold text-xs">
                  ➔
                </div>
                <div className="h-0.5 bg-[#E5D9CC] flex-1" />
              </div>
            </div>

            {/* Collector */}
            <div className="text-center space-y-1">
              <div className="w-12 h-12 mx-auto rounded-full bg-[#D4B89B] text-[#432E22] flex items-center justify-center font-bold text-lg shadow-xs">
                {payeeMember?.displayName?.charAt(0).toUpperCase() || 'C'}
              </div>
              <span className="text-xs font-bold text-[#432E22] block truncate max-w-[90px]">
                {payeeMember?.displayName || 'Collector'}
              </span>
              <span className="inline-block px-2 py-0.5 rounded-full bg-[#E8F0E4] text-[#2E4226] text-[10px] font-bold uppercase">
                Recipient
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Dropdown Pickers */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#6E5849] uppercase tracking-wider mb-1">
                Who is paying?
              </label>
              <select
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-2xl border border-[#E5D9CC] bg-white text-[#432E22] focus:outline-none focus:border-[#543A2A]"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#6E5849] uppercase tracking-wider mb-1">
                Paying to whom?
              </label>
              <select
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-2xl border border-[#E5D9CC] bg-white text-[#432E22] focus:outline-none focus:border-[#543A2A]"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Settlement Sum */}
          <div className="p-4 rounded-2xl border border-[#E5D9CC] bg-[#FAF6F0] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#6E5849] uppercase tracking-wider">
                Settlement Amount
              </span>
              <span className="text-[10px] text-[#8D7868] font-bold uppercase">
                {currency}
              </span>
            </div>

            <div className="p-3 bg-white border border-[#E5D9CC] rounded-xl flex items-center gap-2">
              <span className="text-2xl font-bold text-[#543A2A]">
                {currency === 'INR' ? '₹' : currency}
              </span>
              <input
                type="text"
                inputMode="decimal"
                required
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
                className="w-full text-2xl sm:text-3xl font-bold tracking-tight bg-transparent text-[#432E22] focus:outline-none"
              />
            </div>

            {/* Quick Pills */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleQuickAmount(1.0)}
                className="flex-1 py-1.5 rounded-full border border-[#E5D9CC] bg-white text-[#543A2A] font-bold text-xs hover:bg-[#EFE4D6] transition cursor-pointer"
              >
                Full Amount
              </button>
              <button
                type="button"
                onClick={() => handleQuickAmount(0.5)}
                className="flex-1 py-1.5 rounded-full border border-[#E5D9CC] bg-white text-[#543A2A] font-bold text-xs hover:bg-[#EFE4D6] transition cursor-pointer"
              >
                Half
              </button>
              <button
                type="button"
                onClick={() => handleQuickAmount(0.25)}
                className="flex-1 py-1.5 rounded-full border border-[#E5D9CC] bg-white text-[#543A2A] font-bold text-xs hover:bg-[#EFE4D6] transition cursor-pointer"
              >
                25%
              </button>
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#6E5849] uppercase tracking-wider block">
              Payment Method
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SETTLEMENT_METHODS.map((m) => {
                const isSelected = method === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    className={`py-2 px-2.5 rounded-full text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border ${
                      isSelected
                        ? 'bg-[#543A2A] text-[#FAF6F0] border-[#543A2A] shadow-xs'
                        : 'bg-white text-[#543A2A] border-[#E5D9CC] hover:bg-[#FAF6F0]'
                    }`}
                  >
                    <span>{m.icon}</span>
                    <span className="truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#6E5849] uppercase tracking-wider block">
              Note (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Dinner settlement, GPay #9482"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3.5 py-2 text-xs font-medium rounded-2xl border border-[#E5D9CC] bg-white text-[#432E22] focus:outline-none focus:border-[#543A2A]"
            />
          </div>

          {/* Save Button */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3.5 rounded-full bg-[#543A2A] hover:bg-[#432E20] text-[#FAF6F0] font-bold text-sm tracking-wide shadow-sm active:scale-95 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <span>✓ Record Settlement</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

