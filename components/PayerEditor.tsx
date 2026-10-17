'use client';

// components/PayerEditor.tsx
// Warm Cafe Payer Selector

import React, { useState, useEffect } from 'react';
import type { Member } from '../lib/data/types';
import { formatMinor, parseMoneyToMinor } from '../lib/engine/money';

export interface PayerAllocation {
  memberId: string;
  paidMinor: number;
}

interface PayerEditorProps {
  members: Member[];
  totalAmountMinor: number;
  currency: string;
  currentUserId?: string;
  initialPayers?: PayerAllocation[];
  onChange: (payers: PayerAllocation[], isValid: boolean) => void;
}

export function PayerEditor({
  members,
  totalAmountMinor,
  currency,
  currentUserId,
  initialPayers,
  onChange,
}: PayerEditorProps) {
  const [isMultiPayer, setIsMultiPayer] = useState(
    initialPayers && initialPayers.length > 1 ? true : false
  );

  const defaultSinglePayerId =
    members.find((m) => m.userId === currentUserId)?.id || members[0]?.id || '';

  const [singlePayerId, setSinglePayerId] = useState(
    initialPayers && initialPayers.length === 1
      ? initialPayers[0]!.memberId
      : defaultSinglePayerId
  );

  const [multiPayerInputs, setMultiPayerInputs] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (initialPayers && initialPayers.length > 1) {
      for (const p of initialPayers) {
        map[p.memberId] = (p.paidMinor / 100).toFixed(2);
      }
    }
    return map;
  });

  let multiPayerSumMinor = 0;
  const currentPayers: PayerAllocation[] = [];

  if (isMultiPayer) {
    for (const m of members) {
      const text = multiPayerInputs[m.id] || '';
      const minor = parseMoneyToMinor(text, currency) || 0;
      if (minor > 0) {
        multiPayerSumMinor += minor;
        currentPayers.push({ memberId: m.id, paidMinor: minor });
      }
    }
  } else {
    currentPayers.push({ memberId: singlePayerId, paidMinor: totalAmountMinor });
  }

  const deltaMinor = totalAmountMinor - (isMultiPayer ? multiPayerSumMinor : totalAmountMinor);
  const isValid = totalAmountMinor > 0 && deltaMinor === 0;

  useEffect(() => {
    onChange(currentPayers, isValid);
  }, [isMultiPayer, singlePayerId, multiPayerInputs, totalAmountMinor]);

  const handleInputChange = (memberId: string, val: string) => {
    setMultiPayerInputs((prev) => ({ ...prev, [memberId]: val }));
  };

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const selectedMember = members.find((m) => m.id === singlePayerId);

  return (
    <div className="space-y-3 p-4 rounded-3xl border border-[#E5D9CC] bg-[#FAF6F0] shadow-xs">
      <div>
        <label className="text-xs font-bold text-[#6E5849] uppercase tracking-wider">
          PAID BY
        </label>
      </div>

      {/* Segmented Toggle */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-white border border-[#E5D9CC] rounded-full text-xs font-bold">
        <button
          type="button"
          onClick={() => {
            setIsMultiPayer(false);
            setIsDropdownOpen(false);
          }}
          className={`py-2 rounded-full transition-all cursor-pointer ${
            !isMultiPayer
              ? 'bg-[#543A2A] text-[#FAF6F0] shadow-xs'
              : 'text-[#8D7868] hover:text-[#543A2A]'
          }`}
        >
          Paid by one
        </button>
        <button
          type="button"
          onClick={() => {
            setIsMultiPayer(true);
            setIsDropdownOpen(false);
          }}
          className={`py-2 rounded-full transition-all cursor-pointer ${
            isMultiPayer
              ? 'bg-[#543A2A] text-[#FAF6F0] shadow-xs'
              : 'text-[#8D7868] hover:text-[#543A2A]'
          }`}
        >
          Multiple payers
        </button>
      </div>

      {!isMultiPayer ? (
        <div className="relative">
          {/* Custom Single Payer Card with inline dropdown trigger */}
          <div
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className="p-3 rounded-2xl border border-[#E5D9CC] bg-white flex items-center justify-between gap-3 shadow-xs cursor-pointer hover:border-[#D4B89B] transition select-none"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-full bg-[#EFE4D6] text-[#543A2A] flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                {selectedMember?.displayName.charAt(0).toUpperCase() || 'P'}
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold text-[#432E22] block truncate">
                  {selectedMember?.displayName} {selectedMember?.userId === currentUserId ? '(You)' : ''}
                </span>
                <span className="text-[11px] text-[#8D7868] block">
                  Paid ₹{formatMinor(totalAmountMinor, currency)}
                </span>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E5D9CC] bg-[#FAF6F0] text-xs font-semibold text-[#543A2A]">
              <span>Change</span>
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* In-UI Dropdown (Drops down inside UI without opening native modal) */}
          {isDropdownOpen && (
            <div className="mt-2 p-1.5 bg-white border border-[#E5D9CC] rounded-2xl shadow-lg space-y-1 z-20 animate-fadeIn">
              {members.map((m) => {
                const isSelected = m.id === singlePayerId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSinglePayerId(m.id);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition cursor-pointer ${
                      isSelected
                        ? 'bg-[#EFE4D6] text-[#543A2A] font-bold'
                        : 'text-[#432E22] hover:bg-[#FAF6F0] font-medium'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-[#E5D9CC] text-[#543A2A] flex items-center justify-center font-bold text-xs shrink-0">
                        {m.displayName.charAt(0).toUpperCase()}
                      </div>
                      <span className="truncate">
                        {m.displayName} {m.userId === currentUserId ? '(You)' : ''}
                      </span>
                    </div>

                    {isSelected && (
                      <span className="text-xs font-bold text-[#543A2A] shrink-0">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2.5 pt-1">
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="p-2.5 rounded-2xl border border-[#E5D9CC] bg-white flex items-center justify-between gap-3 shadow-xs">
                <span className="text-xs font-bold text-[#432E22] truncate">
                  {m.displayName} {m.userId === currentUserId ? '(You)' : ''}
                </span>
                <div className="w-28 shrink-0 flex items-center gap-1">
                  <span className="text-xs font-bold text-[#8D7868]">₹</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={multiPayerInputs[m.id] || ''}
                    onChange={(e) => handleInputChange(m.id, e.target.value)}
                    className="w-full px-2 py-1 text-xs font-bold text-right rounded-xl border border-[#E5D9CC] bg-[#FAF6F0] text-[#432E22] focus:outline-none focus:border-[#543A2A]"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Residual indicator (shows only "xxx remaining" without "TOTAL ALLOCATED") */}
          <div className="pt-2 flex items-center justify-end text-xs font-semibold">
            {deltaMinor === 0 ? (
              <span className="font-bold text-[#2E4226] bg-[#E8F0E4] border border-[#C5D9BE] px-3 py-1 rounded-full shadow-xs">
                Matched ({currency === 'INR' ? '₹' : ''}{formatMinor(totalAmountMinor, currency)})
              </span>
            ) : deltaMinor > 0 ? (
              <span className="font-bold text-[#8C5E23] bg-[#FAF0E6] border border-[#ECD3B6] px-3 py-1 rounded-full shadow-xs">
                {currency === 'INR' ? '₹' : ''}{formatMinor(deltaMinor, currency)} remaining
              </span>
            ) : (
              <span className="font-bold text-[#A83232] bg-[#FCE8E6] border border-[#F5C2C0] px-3 py-1 rounded-full shadow-xs">
                Over by {currency === 'INR' ? '₹' : ''}{formatMinor(Math.abs(deltaMinor), currency)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

