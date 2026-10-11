'use client';

// components/SettleModal.tsx
// Settle Up Dialog with Hardware Back-Button Support & Method Selectors

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

const SETTLEMENT_METHODS: { id: SettlementMethod; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'upi', label: 'UPI / GPay' },
  { id: 'venmo', label: 'Venmo' },
  { id: 'paypal', label: 'PayPal' },
  { id: 'bank', label: 'Bank Transfer' },
  { id: 'other', label: 'Other' },
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
  const [method, setMethod] = useState<SettlementMethod>('cash');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialFromMemberId) setFromId(initialFromMemberId);
    if (initialToMemberId) setToId(initialToMemberId);
    if (initialAmountMinor) setAmountStr((initialAmountMinor / 100).toFixed(2));
  }, [initialFromMemberId, initialToMemberId, initialAmountMinor]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (fromId === toId) {
      setError('Payer and payee cannot be the same member');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        className="relative w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settle-title"
      >
        <div className="flex items-center justify-between">
          <h2 id="settle-title" className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Record a Payment
          </h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Payer and Payee Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                Payer (Paid)
              </label>
              <select
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                Payee (Received)
              </label>
              <select
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Amount ({currency})
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2.5 text-base font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Payment Method Pills */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
              Payment Method
            </label>
            <div className="flex flex-wrap gap-1.5">
              {SETTLEMENT_METHODS.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                    method === m.id
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Note */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Note (Optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Paid via GPay"
              className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-700 dark:text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-md transition-all"
            >
              Record Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
