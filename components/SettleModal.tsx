'use client';

// components/SettleModal.tsx
// Stitch-Engineered Clearinghouse Netting Settlement Modal (Algorithmic Netting Hub)

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
  { id: 'cash', label: 'CASH', icon: '💵' },
  { id: 'venmo', label: 'VENMO', icon: '💳' },
  { id: 'bank', label: 'IMPS / BANK', icon: '🏦' },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div
        className="relative w-full max-w-lg bg-white border-2 border-black rounded-2xl p-5 sm:p-6 shadow-[5px_5px_0px_0px_#000] space-y-4 my-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settle-title"
      >
        {/* Header Badges matching Stitch Image 3 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-black text-[#ccff00] text-[10px] font-mono font-black uppercase flex items-center gap-1">
              <span>■</span>
              <span>ALGORITHMIC NETTING HUB</span>
            </span>
            <span className="px-2 py-0.5 rounded border border-black bg-white text-[10px] font-mono font-bold uppercase">
              🛡️ ZERO-LEAK LEDGER
            </span>
          </div>

          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="w-8 h-8 rounded-lg border-2 border-black bg-white hover:bg-[#ffd600] font-mono font-black text-xs flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        {/* Clearinghouse Title & Batch ID */}
        <div className="flex items-baseline justify-between border-b-2 border-black pb-3">
          <h2 id="settle-title" className="text-2xl font-black text-black tracking-tight uppercase font-mono">
            CLEARINGHOUSE
          </h2>
          <span className="text-[11px] font-mono font-bold text-black/60 uppercase">
            BATCH ID: #{groupId.slice(0, 4)}-NET
          </span>
        </div>

        {error && (
          <div className="p-3 rounded-xl text-xs font-mono font-black uppercase bg-[#ff8a80] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]">
            {error}
          </div>
        )}

        {/* Visual Netting Route Card */}
        <div className="border-2 border-black rounded-xl overflow-hidden shadow-[3px_3px_0px_0px_#000]">
          <div className="bg-black text-white px-3 py-2 flex items-center justify-between text-xs font-mono font-bold">
            <span className="uppercase">OPTIMAL ROUTE DETECTED</span>
            <span className="px-1.5 py-0.5 rounded bg-[#ccff00] text-black text-[10px] font-black">
              SAVED TRANSFERS (-57%)
            </span>
          </div>

          <div className="bg-[#f0f0ea] p-4 flex items-center justify-between gap-2">
            {/* Debtor */}
            <div className="text-center space-y-1">
              <div className="w-12 h-12 mx-auto rounded-xl border-2 border-black bg-white flex items-center justify-center font-black text-lg shadow-[2px_2px_0px_0px_#000]">
                {payerMember?.displayName?.charAt(0).toUpperCase() || 'D'}
              </div>
              <span className="text-xs font-black text-black block truncate max-w-[90px]">
                {payerMember?.displayName || 'DEBTOR'}
              </span>
              <span className="inline-block px-1.5 py-0.2 rounded bg-[#ff8a80] text-black border border-black text-[9px] font-mono font-black uppercase">
                DEBTOR
              </span>
            </div>

            {/* Arrow & Amount Center */}
            <div className="flex-1 text-center space-y-1 px-2">
              <div className="inline-block px-2.5 py-1 bg-black text-[#ccff00] font-mono font-black text-xs sm:text-sm rounded border border-black shadow-[1px_1px_0px_0px_#000]">
                ₹ {amountStr || '0.00'}
              </div>
              <div className="flex items-center justify-center gap-1">
                <div className="h-0.5 bg-black flex-1" />
                <div className="w-6 h-6 bg-[#ccff00] border-2 border-black flex items-center justify-center font-black text-xs shadow-[1px_1px_0px_0px_#000]">
                  ➔
                </div>
                <div className="h-0.5 bg-black flex-1" />
              </div>
              <span className="text-[10px] font-mono text-black/60 font-bold uppercase block">
                DIRECT NET CLEAR
              </span>
            </div>

            {/* Collector */}
            <div className="text-center space-y-1">
              <div className="w-12 h-12 mx-auto rounded-xl border-2 border-black bg-white flex items-center justify-center font-black text-lg shadow-[2px_2px_0px_0px_#000]">
                {payeeMember?.displayName?.charAt(0).toUpperCase() || 'C'}
              </div>
              <span className="text-xs font-black text-black block truncate max-w-[90px]">
                {payeeMember?.displayName || 'COLLECTOR'}
              </span>
              <span className="inline-block px-1.5 py-0.2 rounded bg-[#ccff00] text-black border border-black text-[9px] font-mono font-black uppercase">
                COLLECTOR
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Dropdown Pickers */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono font-black text-black uppercase tracking-wider mb-1">
                WHO IS PAYING?
              </label>
              <select
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className="w-full px-3 py-2.5 text-xs font-mono font-bold rounded-xl border-2 border-black bg-white text-black shadow-[2px_2px_0px_0px_#000] focus:outline-none focus:bg-[#faffea]"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono font-black text-black uppercase tracking-wider mb-1">
                PAYING TO WHOM?
              </label>
              <select
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className="w-full px-3 py-2.5 text-xs font-mono font-bold rounded-xl border-2 border-black bg-white text-black shadow-[2px_2px_0px_0px_#000] focus:outline-none focus:bg-[#faffea]"
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
          <div className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_0px_#000] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-black text-black uppercase tracking-wider">
                SETTLEMENT SUM
              </span>
              <span className="text-[10px] font-mono text-black/60 font-bold uppercase">
                CURRENCY: {currency} [₹]
              </span>
            </div>

            <div className="p-3 bg-[#e8e8e2] border-2 border-black rounded-xl flex items-center gap-2">
              <span className="text-2xl font-mono font-black text-black">
                {currency === 'INR' ? '₹' : currency}
              </span>
              <input
                type="text"
                inputMode="decimal"
                required
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0.00"
                className="w-full text-2xl sm:text-3xl font-black font-mono tracking-tight bg-transparent text-black focus:outline-none"
              />
            </div>

            {/* Quick Pills */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleQuickAmount(1.0)}
                className="flex-1 py-1.5 rounded-lg border-2 border-black bg-[#ccff00] text-black font-mono font-black text-xs shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
              >
                ■ FULL
              </button>
              <button
                type="button"
                onClick={() => handleQuickAmount(0.5)}
                className="flex-1 py-1.5 rounded-lg border-2 border-black bg-[#ffd600] text-black font-mono font-black text-xs shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
              >
                ■ HALF
              </button>
              <button
                type="button"
                onClick={() => handleQuickAmount(0.25)}
                className="flex-1 py-1.5 rounded-lg border-2 border-black bg-[#f0f0ea] text-black font-mono font-bold text-xs shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
              >
                25%
              </button>
            </div>
          </div>

          {/* Settlement Instrument */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-black text-black uppercase tracking-wider">
                SETTLEMENT INSTRUMENT
              </label>
              <span className="px-1.5 py-0.2 rounded border border-black bg-[#ffd600] text-black text-[9px] font-mono font-black uppercase">
                DEEP-LINK READY
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SETTLEMENT_METHODS.map((m) => {
                const isSelected = method === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    className={`py-2 px-2.5 rounded-xl border-2 border-black text-xs font-mono font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_#000] ${
                      isSelected
                        ? 'bg-[#ccff00] text-black'
                        : 'bg-white text-black/70 hover:bg-[#fafaf6]'
                    }`}
                  >
                    <span>{m.icon}</span>
                    <span className="truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Memo & Tag */}
          <div className="p-3.5 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_0px_#000] space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-black text-black uppercase tracking-wider">
                MEMO & CRYPTOGRAPHIC REF
              </label>
              <span className="px-1.5 py-0.2 rounded border border-black bg-[#ffd600] text-black text-[9px] font-mono font-black uppercase">
                #TRIP
              </span>
            </div>
            <input
              type="text"
              placeholder="e.g. Goa dinner split settlement, GPay ref #8493"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-lg border-2 border-black bg-white text-black focus:outline-none focus:bg-[#faffea]"
            />
          </div>

          {/* Sticky CTA Button */}
          <div className="pt-2 space-y-2">
            <button
              type="submit"
              className="w-full py-4 rounded-xl bg-[#ccff00] hover:bg-[#bbf000] text-black font-black text-base uppercase border-2 border-black shadow-[4px_4px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <span>✓ RECORD SETTLEMENT →</span>
            </button>
            <p className="text-[10px] font-mono font-bold text-black/60 text-center uppercase tracking-wider">
              💾 WRITES IMMEDIATELY TO LOCAL SQLITE LEDGER
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
