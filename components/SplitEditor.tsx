'use client';

// components/SplitEditor.tsx
// Visual Split Mode Selector (Equal & Exact) with Live Remainder Computation

import React, { useState, useEffect } from 'react';
import type { Member, SplitType } from '../lib/data/types';
import type { Split } from '../lib/engine/split';
import { splitEqual } from '../lib/engine/split';
import { formatMinor, parseMoneyToMinor } from '../lib/engine/money';

interface SplitEditorProps {
  members: Member[];
  totalAmountMinor: number;
  currency: string;
  initialSplitType?: SplitType;
  initialSplits?: Split[];
  onChange: (splits: Split[], isValid: boolean, splitType: SplitType) => void;
}

export function SplitEditor({
  members,
  totalAmountMinor,
  currency,
  initialSplitType = 'equal',
  initialSplits,
  onChange,
}: SplitEditorProps) {
  const [splitType, setSplitType] = useState<SplitType>(
    initialSplitType === 'exact' ? 'exact' : 'equal'
  );

  // Equal split participants (default: all members)
  const [equalParticipantIds, setEqualParticipantIds] = useState<Set<string>>(() => {
    if (initialSplits && initialSplits.length > 0) {
      return new Set(initialSplits.filter((s) => s.owedMinor > 0).map((s) => s.memberId));
    }
    return new Set(members.map((m) => m.id));
  });

  // Exact split per-member text inputs
  const [exactInputs, setExactInputs] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (initialSplits && initialSplits.length > 0) {
      for (const s of initialSplits) {
        if (s.owedMinor > 0) {
          map[s.memberId] = (s.owedMinor / 100).toFixed(2);
        }
      }
    }
    return map;
  });

  const toggleEqualParticipant = (id: string) => {
    const next = new Set(equalParticipantIds);
    if (next.has(id)) {
      if (next.size > 1) next.delete(id);
    } else {
      next.add(id);
    }
    setEqualParticipantIds(next);
  };

  const selectAllEqual = () => {
    setEqualParticipantIds(new Set(members.map((m) => m.id)));
  };

  // Compute resulting splits based on mode
  let computedSplits: Split[] = [];
  let isValid = false;
  let deltaMinor = 0;

  if (splitType === 'equal') {
    const participantList = Array.from(equalParticipantIds);
    if (participantList.length > 0 && totalAmountMinor > 0) {
      const generated = splitEqual(totalAmountMinor, participantList);
      // Map all members: participants get owedMinor, non-participants get 0
      computedSplits = members.map((m) => {
        const found = generated.find((s) => s.memberId === m.id);
        return {
          memberId: m.id,
          paidMinor: 0,
          owedMinor: found ? found.owedMinor : 0,
        };
      });
      isValid = true;
    }
  } else {
    // Exact split
    let exactSum = 0;
    computedSplits = members.map((m) => {
      const text = exactInputs[m.id] || '';
      const minor = parseMoneyToMinor(text, currency) || 0;
      exactSum += minor;
      return {
        memberId: m.id,
        paidMinor: 0,
        owedMinor: minor,
      };
    });

    deltaMinor = totalAmountMinor - exactSum;
    isValid = totalAmountMinor > 0 && deltaMinor === 0;
  }

  useEffect(() => {
    onChange(computedSplits, isValid, splitType);
  }, [splitType, equalParticipantIds, exactInputs, totalAmountMinor]);

  return (
    <div className="space-y-3.5 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          Split Mode
        </label>

        {/* Split Mode Tabs */}
        <div className="flex p-0.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-xs font-medium">
          <button
            type="button"
            onClick={() => setSplitType('equal')}
            className={`px-3 py-1 rounded-lg transition-all ${
              splitType === 'equal'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            Equally
          </button>
          <button
            type="button"
            onClick={() => setSplitType('exact')}
            className={`px-3 py-1 rounded-lg transition-all ${
              splitType === 'exact'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            Unequally (Exact)
          </button>
        </div>
      </div>

      {splitType === 'equal' ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
            <span>{equalParticipantIds.size} of {members.length} people involved</span>
            <button
              type="button"
              onClick={selectAllEqual}
              className="text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              Select all
            </button>
          </div>

          <div className="space-y-1.5">
            {members.map((m) => {
              const isChecked = equalParticipantIds.has(m.id);
              const split = computedSplits.find((s) => s.memberId === m.id);
              const owedAmount = split ? split.owedMinor : 0;

              return (
                <div
                  key={m.id}
                  onClick={() => toggleEqualParticipant(m.id)}
                  className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer select-none transition-all ${
                    isChecked
                      ? 'border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-500/10'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/40 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}} // handled by parent div
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-zinc-300 pointer-events-none"
                    />
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {m.displayName}
                    </span>
                  </div>

                  <span className="text-xs font-mono font-medium text-zinc-600 dark:text-zinc-300">
                    {isChecked ? formatMinor(owedAmount, currency) : formatMinor(0, currency)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                  {m.displayName}
                </span>
                <div className="w-32 shrink-0">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={exactInputs[m.id] || ''}
                    onChange={(e) =>
                      setExactInputs((prev) => ({ ...prev, [m.id]: e.target.value }))
                    }
                    className="w-full px-3 py-1.5 text-sm font-mono text-right rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Delta indicator */}
          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs">
            <span className="text-zinc-500">Split delta:</span>
            {deltaMinor === 0 ? (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                Split in full ({formatMinor(totalAmountMinor, currency)})
              </span>
            ) : deltaMinor > 0 ? (
              <span className="font-semibold text-orange-600 dark:text-orange-400">
                {formatMinor(deltaMinor, currency)} left to allocate
              </span>
            ) : (
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                Over by {formatMinor(Math.abs(deltaMinor), currency)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
