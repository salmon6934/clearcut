'use client';

// components/SplitEditor.tsx
// Visual Split Mode Selector (Equal, Exact, Percentage, Shares, Adjustment)
// Implements T-2.1.2 with real-time recalculation, invariant safety, and instant UI feedback.

import React, { useState, useEffect } from 'react';
import type { Member, SplitType } from '../lib/data/types';
import type { Split } from '../lib/engine/split';
import {
  splitEqual,
  splitPercent,
  splitShares,
  splitAdjust,
} from '../lib/engine/split';
import { formatMinor, parseMoneyToMinor } from '../lib/engine/money';

export type UiSplitMode = 'equal' | 'exact' | 'percentage' | 'shares' | 'adjustment';

interface SplitEditorProps {
  members: Member[];
  totalAmountMinor: number;
  currency: string;
  initialSplitType?: SplitType;
  initialSplits?: Split[];
  onChange: (splits: Split[], isValid: boolean, splitType: SplitType) => void;
}

function parseSignedMoneyToMinor(input: string, currency: string): number {
  const trimmed = input.trim();
  if (!trimmed) return 0;
  const isNegative = trimmed.startsWith('-');
  const clean = trimmed.replace(/^[+-]/, '');
  const minor = parseMoneyToMinor(clean, currency) || 0;
  return isNegative ? -minor : minor;
}

export function SplitEditor({
  members,
  totalAmountMinor,
  currency,
  initialSplitType = 'equal',
  initialSplits,
  onChange,
}: SplitEditorProps) {
  const [mode, setMode] = useState<UiSplitMode>(() => {
    if (initialSplitType === 'exact') return 'exact';
    if (initialSplitType === 'percentage') return 'percentage';
    if (initialSplitType === 'shares') return 'shares';
    return 'equal';
  });

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
    if (initialSplits && initialSplits.length > 0 && initialSplitType === 'exact') {
      for (const s of initialSplits) {
        if (s.owedMinor > 0) {
          map[s.memberId] = (s.owedMinor / 100).toFixed(2);
        }
      }
    }
    return map;
  });

  // Percentage split per-member text inputs (default: evenly divided %)
  const [percentInputs, setPercentInputs] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (initialSplits && initialSplits.length > 0 && initialSplitType === 'percentage') {
      for (const s of initialSplits) {
        if (s.splitValue !== undefined) {
          map[s.memberId] = (s.splitValue / 100).toFixed(2);
        }
      }
    } else if (members.length > 0) {
      // Default: 100 / count
      const defaultPct = (100 / members.length).toFixed(2);
      for (const m of members) {
        map[m.id] = defaultPct;
      }
    }
    return map;
  });

  // Shares split per-member inputs (default: 1 share for everyone)
  const [sharesInputs, setSharesInputs] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (initialSplits && initialSplits.length > 0 && initialSplitType === 'shares') {
      for (const s of initialSplits) {
        map[s.memberId] = String(s.splitValue || 1);
      }
    } else {
      for (const m of members) {
        map[m.id] = '1';
      }
    }
    return map;
  });

  // Adjustment split per-member inputs (default: 0.00 for everyone)
  const [adjustmentInputs, setAdjustmentInputs] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const m of members) {
      map[m.id] = '0.00';
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

  // Helper to distribute percentages evenly with exact 100.00% sum
  const distributePercentagesEvenly = () => {
    if (members.length === 0) return;
    const baseBps = Math.floor(10000 / members.length);
    const remBps = 10000 - baseBps * members.length;
    const next: Record<string, string> = {};
    members.forEach((m, i) => {
      const bps = baseBps + (i < remBps ? 1 : 0);
      next[m.id] = (bps / 100).toFixed(2);
    });
    setPercentInputs(next);
  };

  // -------------------------------------------------------------
  // Dynamic Computation based on active mode
  // -------------------------------------------------------------
  let computedSplits: Split[] = [];
  let isValid = false;
  let backendSplitType: SplitType = 'equal';
  let statusMessage: React.ReactNode = null;

  if (mode === 'equal') {
    backendSplitType = 'equal';
    const participantList = Array.from(equalParticipantIds);
    if (participantList.length > 0 && totalAmountMinor > 0) {
      try {
        const generated = splitEqual(totalAmountMinor, participantList);
        computedSplits = members.map((m) => {
          const found = generated.find((s) => s.memberId === m.id);
          return {
            memberId: m.id,
            paidMinor: 0,
            owedMinor: found ? found.owedMinor : 0,
          };
        });
        isValid = true;
      } catch {
        isValid = false;
      }
    }
  } else if (mode === 'exact') {
    backendSplitType = 'exact';
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

    const deltaMinor = totalAmountMinor - exactSum;
    isValid = totalAmountMinor > 0 && deltaMinor === 0;

    statusMessage = (
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
    );
  } else if (mode === 'percentage') {
    backendSplitType = 'percentage';
    let sumBps = 0;
    const participantsWithBps = members.map((m) => {
      const val = parseFloat(percentInputs[m.id] || '0');
      const bps = Number.isNaN(val) ? 0 : Math.round(val * 100);
      sumBps += bps;
      return { memberId: m.id, bps };
    });

    const deltaBps = 10000 - sumBps;
    if (totalAmountMinor > 0 && sumBps === 10000) {
      try {
        computedSplits = splitPercent(totalAmountMinor, participantsWithBps);
        isValid = true;
      } catch {
        isValid = false;
      }
    } else {
      // Estimated shares for preview
      computedSplits = members.map((m) => {
        const p = participantsWithBps.find((item) => item.memberId === m.id);
        const approxMinor = totalAmountMinor > 0 && p
          ? Math.round((totalAmountMinor * p.bps) / 10000)
          : 0;
        return {
          memberId: m.id,
          paidMinor: 0,
          owedMinor: approxMinor,
          splitValue: p?.bps,
        };
      });
      isValid = false;
    }

    const currentPercent = (sumBps / 100).toFixed(2);
    statusMessage = (
      <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs">
        <span className="text-zinc-500">Total percentage:</span>
        {deltaBps === 0 ? (
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            100.00% allocated
          </span>
        ) : deltaBps > 0 ? (
          <span className="font-semibold text-orange-600 dark:text-orange-400">
            {currentPercent}% entered ({(deltaBps / 100).toFixed(2)}% remaining)
          </span>
        ) : (
          <span className="font-semibold text-rose-600 dark:text-rose-400">
            {currentPercent}% entered ({Math.abs(deltaBps / 100).toFixed(2)}% over 100%)
          </span>
        )}
      </div>
    );
  } else if (mode === 'shares') {
    backendSplitType = 'shares';
    let totalShares = 0;
    let allPositive = true;

    const participantsWithWeights = members.map((m) => {
      const val = parseFloat(sharesInputs[m.id] || '0');
      if (Number.isNaN(val) || val <= 0) {
        allPositive = false;
      }
      totalShares += Number.isNaN(val) || val < 0 ? 0 : val;
      return { memberId: m.id, weight: Number.isNaN(val) || val <= 0 ? 1 : val };
    });

    if (totalAmountMinor > 0 && totalShares > 0 && allPositive) {
      try {
        computedSplits = splitShares(totalAmountMinor, participantsWithWeights);
        isValid = true;
      } catch {
        isValid = false;
      }
    } else {
      computedSplits = members.map((m) => ({
        memberId: m.id,
        paidMinor: 0,
        owedMinor: 0,
      }));
      isValid = false;
    }

    statusMessage = (
      <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs">
        <span className="text-zinc-500">Total shares:</span>
        <span className={`font-semibold ${allPositive && totalShares > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {totalShares > 0 ? `${totalShares} share${totalShares === 1 ? '' : 's'}` : 'Enter positive shares'}
        </span>
      </div>
    );
  } else if (mode === 'adjustment') {
    backendSplitType = 'exact'; // Adjustments produce exact rows with splitValue
    const participantsWithAdj = members.map((m) => {
      const rawText = adjustmentInputs[m.id] || '0';
      const adjMinor = parseSignedMoneyToMinor(rawText, currency);
      return { memberId: m.id, adjustmentMinor: adjMinor };
    });

    const sumAdjustments = participantsWithAdj.reduce((acc, p) => acc + p.adjustmentMinor, 0);
    const pool = totalAmountMinor - sumAdjustments;

    if (totalAmountMinor > 0 && pool >= 0) {
      try {
        computedSplits = splitAdjust(totalAmountMinor, participantsWithAdj);
        isValid = true;
      } catch (err: any) {
        isValid = false;
        statusMessage = (
          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-rose-600 dark:text-rose-400">
            {err.message || 'Adjustments result in negative shares'}
          </div>
        );
      }
    } else {
      isValid = false;
      statusMessage = (
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-rose-600 dark:text-rose-400">
          Adjustments exceed total expense amount
        </div>
      );
    }

    if (!statusMessage) {
      statusMessage = (
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs">
          <span className="text-zinc-500">Adjustments sum:</span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {sumAdjustments >= 0 ? `+${formatMinor(sumAdjustments, currency)}` : formatMinor(sumAdjustments, currency)} (Base pool: {formatMinor(pool, currency)})
          </span>
        </div>
      );
    }
  }

  useEffect(() => {
    onChange(computedSplits, isValid, backendSplitType);
  }, [
    mode,
    equalParticipantIds,
    exactInputs,
    percentInputs,
    sharesInputs,
    adjustmentInputs,
    totalAmountMinor,
    isValid,
  ]);

  return (
    <div className="space-y-3.5 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          Split Mode
        </label>

        {/* 5-Mode Tabs Bar */}
        <div className="flex p-0.5 rounded-xl bg-zinc-200/90 dark:bg-zinc-800 text-xs font-medium overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setMode('equal')}
            className={`px-2.5 py-1 rounded-lg transition-all whitespace-nowrap ${
              mode === 'equal'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            Equally
          </button>
          <button
            type="button"
            onClick={() => setMode('exact')}
            className={`px-2.5 py-1 rounded-lg transition-all whitespace-nowrap ${
              mode === 'exact'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            Exact
          </button>
          <button
            type="button"
            onClick={() => setMode('percentage')}
            className={`px-2.5 py-1 rounded-lg transition-all whitespace-nowrap ${
              mode === 'percentage'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            % Percent
          </button>
          <button
            type="button"
            onClick={() => setMode('shares')}
            className={`px-2.5 py-1 rounded-lg transition-all whitespace-nowrap ${
              mode === 'shares'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            Shares
          </button>
          <button
            type="button"
            onClick={() => setMode('adjustment')}
            className={`px-2.5 py-1 rounded-lg transition-all whitespace-nowrap ${
              mode === 'adjustment'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            +/- Adjust
          </button>
        </div>
      </div>

      {/* Mode 1: Equal Split */}
      {mode === 'equal' && (
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
                      onChange={() => {}}
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
      )}

      {/* Mode 2: Exact Split */}
      {mode === 'exact' && (
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
          {statusMessage}
        </div>
      )}

      {/* Mode 3: Percentage Split */}
      {mode === 'percentage' && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
            <span>Enter percentage for each person</span>
            <button
              type="button"
              onClick={distributePercentagesEvenly}
              className="text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              Split evenly
            </button>
          </div>

          <div className="space-y-2">
            {members.map((m) => {
              const split = computedSplits.find((s) => s.memberId === m.id);
              const owed = split ? split.owedMinor : 0;

              return (
                <div key={m.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 block truncate">
                      {m.displayName}
                    </span>
                    <span className="text-xs font-mono text-zinc-400">
                      ≈ {formatMinor(owed, currency)}
                    </span>
                  </div>
                  <div className="relative w-28 shrink-0">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={percentInputs[m.id] || ''}
                      onChange={(e) =>
                        setPercentInputs((prev) => ({ ...prev, [m.id]: e.target.value }))
                      }
                      className="w-full pl-3 pr-7 py-1.5 text-sm font-mono text-right rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 pointer-events-none">
                      %
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {statusMessage}
        </div>
      )}

      {/* Mode 4: Shares Split */}
      {mode === 'shares' && (
        <div className="space-y-2.5">
          <div className="text-xs text-zinc-500 px-1">
            Assign weights (e.g. 2 for couples, 1 for singles)
          </div>

          <div className="space-y-2">
            {members.map((m) => {
              const split = computedSplits.find((s) => s.memberId === m.id);
              const owed = split ? split.owedMinor : 0;
              const currentWeight = parseFloat(sharesInputs[m.id] || '1');

              const step = (delta: number) => {
                const nextVal = Math.max(0.5, (currentWeight || 1) + delta);
                setSharesInputs((prev) => ({ ...prev, [m.id]: String(nextVal) }));
              };

              return (
                <div key={m.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 block truncate">
                      {m.displayName}
                    </span>
                    <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                      {formatMinor(owed, currency)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => step(-1)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 active:scale-95"
                    >
                      -
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={sharesInputs[m.id] || '1'}
                      onChange={(e) =>
                        setSharesInputs((prev) => ({ ...prev, [m.id]: e.target.value }))
                      }
                      className="w-14 px-1 py-1 text-sm font-mono text-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => step(1)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 active:scale-95"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {statusMessage}
        </div>
      )}

      {/* Mode 5: Adjustment Split */}
      {mode === 'adjustment' && (
        <div className="space-y-2.5">
          <div className="text-xs text-zinc-500 px-1">
            Equal baseline with per-person +/- adjustment amounts
          </div>

          <div className="space-y-2">
            {members.map((m) => {
              const split = computedSplits.find((s) => s.memberId === m.id);
              const owed = split ? split.owedMinor : 0;

              return (
                <div key={m.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 block truncate">
                      {m.displayName}
                    </span>
                    <span className="text-xs font-mono font-medium text-emerald-600 dark:text-emerald-400">
                      Total: {formatMinor(owed, currency)}
                    </span>
                  </div>

                  <div className="w-32 shrink-0">
                    <input
                      type="text"
                      placeholder="+0.00 or -0.00"
                      value={adjustmentInputs[m.id] || ''}
                      onChange={(e) =>
                        setAdjustmentInputs((prev) => ({ ...prev, [m.id]: e.target.value }))
                      }
                      className="w-full px-3 py-1.5 text-sm font-mono text-right rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {statusMessage}
        </div>
      )}
    </div>
  );
}
