'use client';

// components/PayerEditor.tsx
// Stitch-Engineered Neo-Brutalist Payer Selector

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

  const selectedMember = members.find((m) => m.id === singlePayerId);

  return (
    <div className="space-y-3 p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_0px_#000]">
      <div className="flex items-center justify-between">
        <label className="text-xs font-mono font-black text-black uppercase tracking-wider">
          PAID BY
        </label>
        <span className="text-[10px] font-mono text-black/60 font-bold uppercase">
          SETTLEMENT ROOT
        </span>
      </div>

      {/* Segmented Toggle matching Stitch Image 2 */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-[#f0f0ea] border-2 border-black rounded-xl">
        <button
          type="button"
          onClick={() => setIsMultiPayer(false)}
          className={`py-2 text-xs font-mono font-black uppercase rounded-lg transition-all ${
            !isMultiPayer
              ? 'bg-[#ccff00] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]'
              : 'text-black/60 hover:text-black'
          }`}
        >
          PAID BY ONE
        </button>
        <button
          type="button"
          onClick={() => setIsMultiPayer(true)}
          className={`py-2 text-xs font-mono font-black uppercase rounded-lg transition-all ${
            isMultiPayer
              ? 'bg-[#ccff00] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]'
              : 'text-black/60 hover:text-black'
          }`}
        >
          MULTIPLE PAYERS
        </button>
      </div>

      {!isMultiPayer ? (
        <div className="p-3 rounded-xl border-2 border-black bg-[#e8e8e2] flex items-center justify-between gap-3 shadow-[2px_2px_0px_0px_#000]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-lg border-2 border-black bg-white flex items-center justify-center font-black text-sm shrink-0 shadow-[1px_1px_0px_0px_#000]">
              {selectedMember?.displayName.charAt(0).toUpperCase() || 'P'}
            </div>
            <div className="min-w-0">
              <span className="text-xs font-black text-black block truncate">
                {selectedMember?.displayName} {selectedMember?.userId === currentUserId ? '(You)' : ''} paid ₹ {formatMinor(totalAmountMinor, currency)}
              </span>
              <span className="text-[10px] font-mono text-black/60 block">
                Instant ledger deduction
              </span>
            </div>
          </div>

          <div className="shrink-0">
            <select
              value={singlePayerId}
              onChange={(e) => setSinglePayerId(e.target.value)}
              className="px-2 py-1 text-xs font-mono font-black rounded-lg border-2 border-black bg-white text-black shadow-[1.5px_1.5px_0px_0px_#000] focus:outline-none"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5 pt-1">
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="p-2.5 rounded-lg border-2 border-black bg-white flex items-center justify-between gap-3 shadow-[1.5px_1.5px_0px_0px_#000]">
                <span className="text-xs font-black text-black truncate">
                  {m.displayName} {m.userId === currentUserId ? '(You)' : ''}
                </span>
                <div className="w-28 shrink-0">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={multiPayerInputs[m.id] || ''}
                    onChange={(e) => handleInputChange(m.id, e.target.value)}
                    className="w-full px-2 py-1 text-xs font-mono font-black text-right rounded-md border-2 border-black bg-white text-black focus:outline-none"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Residual indicator */}
          <div className="p-2 rounded-lg border-2 border-black bg-white flex items-center justify-between text-xs font-mono font-black shadow-[1.5px_1.5px_0px_0px_#000]">
            <span>TOTAL ALLOCATED:</span>
            {deltaMinor === 0 ? (
              <span className="text-black bg-[#ccff00] px-2 py-0.5 rounded border border-black">
                MATCHED ({formatMinor(totalAmountMinor, currency)})
              </span>
            ) : deltaMinor > 0 ? (
              <span className="text-black bg-[#ffd600] px-2 py-0.5 rounded border border-black">
                {formatMinor(deltaMinor, currency)} REMAINING
              </span>
            ) : (
              <span className="text-black bg-[#ff8a80] px-2 py-0.5 rounded border border-black">
                OVER {formatMinor(Math.abs(deltaMinor), currency)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
