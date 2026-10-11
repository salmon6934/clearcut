'use client';

// components/PayerEditor.tsx
// Single & Multi-Payer Selector with Real-Time Residual Indicators

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

  // Default single payer to current user or first member
  const defaultSinglePayerId =
    members.find((m) => m.userId === currentUserId)?.id || members[0]?.id || '';

  const [singlePayerId, setSinglePayerId] = useState(
    initialPayers && initialPayers.length === 1
      ? initialPayers[0]!.memberId
      : defaultSinglePayerId
  );

  // Map of memberId -> text string entered
  const [multiPayerInputs, setMultiPayerInputs] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (initialPayers && initialPayers.length > 1) {
      for (const p of initialPayers) {
        map[p.memberId] = (p.paidMinor / 100).toFixed(2);
      }
    }
    return map;
  });

  // Calculate sum of multi-payers
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

  return (
    <div className="space-y-3 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          Who Paid?
        </label>
        <button
          type="button"
          onClick={() => setIsMultiPayer(!isMultiPayer)}
          className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
        >
          {isMultiPayer ? 'Switch to single payer' : 'Multiple people paid'}
        </button>
      </div>

      {!isMultiPayer ? (
        <div>
          <select
            value={singlePayerId}
            onChange={(e) => setSinglePayerId(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName} {m.userId === currentUserId ? '(You)' : ''}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                  {m.displayName} {m.userId === currentUserId ? '(You)' : ''}
                </span>
                <div className="w-32 shrink-0">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={multiPayerInputs[m.id] || ''}
                    onChange={(e) => handleInputChange(m.id, e.target.value)}
                    className="w-full px-3 py-1.5 text-sm font-mono text-right rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Residual indicator */}
          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs">
            <span className="text-zinc-500">Allocation check:</span>
            {deltaMinor === 0 ? (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                Paid in full ({formatMinor(totalAmountMinor, currency)})
              </span>
            ) : deltaMinor > 0 ? (
              <span className="font-semibold text-orange-600 dark:text-orange-400">
                {formatMinor(deltaMinor, currency)} remaining to assign
              </span>
            ) : (
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                Over allocated by {formatMinor(Math.abs(deltaMinor), currency)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
