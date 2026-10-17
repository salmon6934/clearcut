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
      <div className="pt-2 border-t border-[#E5D9CC] flex items-center justify-end text-xs font-semibold">
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

    statusMessage = (
      <div className="pt-2 border-t border-[#E5D9CC] flex items-center justify-end text-xs font-semibold">
        {deltaBps === 0 ? (
          <span className="font-bold text-[#2E4226] bg-[#E8F0E4] border border-[#C5D9BE] px-3 py-1 rounded-full shadow-xs">
            100.00% allocated
          </span>
        ) : deltaBps > 0 ? (
          <span className="font-bold text-[#8C5E23] bg-[#FAF0E6] border border-[#ECD3B6] px-3 py-1 rounded-full shadow-xs">
            {(deltaBps / 100).toFixed(2)}% remaining
          </span>
        ) : (
          <span className="font-bold text-[#A83232] bg-[#FCE8E6] border border-[#F5C2C0] px-3 py-1 rounded-full shadow-xs">
            {Math.abs(deltaBps / 100).toFixed(2)}% over 100%
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
      <div className="pt-2 border-t border-[#E5D9CC] flex items-center justify-end text-xs font-semibold">
        <span className={`px-3 py-1 rounded-full border font-bold shadow-xs ${allPositive && totalShares > 0 ? 'bg-[#E8F0E4] text-[#2E4226] border-[#C5D9BE]' : 'bg-[#FCE8E6] text-[#A83232] border-[#F5C2C0]'}`}>
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
          <div className="pt-2 text-xs font-semibold text-[#A83232] bg-[#FCE8E6] px-3 py-1.5 rounded-2xl border border-[#F5C2C0]">
            {err.message || 'Adjustments result in negative shares'}
          </div>
        );
      }
    } else {
      isValid = false;
      statusMessage = (
        <div className="pt-2 text-xs font-semibold text-[#A83232] bg-[#FCE8E6] px-3 py-1.5 rounded-2xl border border-[#F5C2C0]">
          Adjustments exceed total expense amount
        </div>
      );
    }

    if (!statusMessage) {
      statusMessage = (
        <div className="pt-2 border-t border-[#E5D9CC] flex items-center justify-between text-xs font-bold">
          <span className="text-[#6E5849] uppercase">Adjustments sum:</span>
          <span className="px-2.5 py-0.5 rounded-full border border-[#E5D9CC] bg-[#E8F0E4] text-[#2E4226] font-bold">
            {sumAdjustments >= 0 ? `+${formatMinor(sumAdjustments, currency)}` : formatMinor(sumAdjustments, currency)} (Pool: {formatMinor(pool, currency)})
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

  // Equal per-person share calculation
  const equalCount = equalParticipantIds.size;
  const equalPerPersonMinor =
    equalCount > 0 ? Math.floor(totalAmountMinor / equalCount) : 0;

  return (
    <div className="space-y-3.5 p-4 rounded-3xl border border-[#E5D9CC] bg-[#FAF6F0] shadow-xs">
      <div>
        <label className="text-xs font-bold text-[#6E5849] uppercase tracking-wider">
          SPLIT DISTRIBUTION
        </label>
      </div>

      {/* 4-Mode Tabs Bar */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-white border border-[#E5D9CC] rounded-full text-xs font-bold">
        <button
          type="button"
          onClick={() => setMode('equal')}
          className={`py-1.5 rounded-full transition-all cursor-pointer ${
            mode === 'equal'
              ? 'bg-[#543A2A] text-[#FAF6F0] shadow-xs'
              : 'text-[#8D7868] hover:text-[#543A2A]'
          }`}
        >
          Equally
        </button>
        <button
          type="button"
          onClick={() => setMode('exact')}
          className={`py-1.5 rounded-full transition-all cursor-pointer ${
            mode === 'exact'
              ? 'bg-[#543A2A] text-[#FAF6F0] shadow-xs'
              : 'text-[#8D7868] hover:text-[#543A2A]'
          }`}
        >
          Unequally
        </button>
        <button
          type="button"
          onClick={() => setMode('percentage')}
          className={`py-1.5 rounded-full transition-all cursor-pointer ${
            mode === 'percentage'
              ? 'bg-[#543A2A] text-[#FAF6F0] shadow-xs'
              : 'text-[#8D7868] hover:text-[#543A2A]'
          }`}
        >
          % Percent
        </button>
        <button
          type="button"
          onClick={() => setMode('shares')}
          className={`py-1.5 rounded-full transition-all cursor-pointer ${
            mode === 'shares'
              ? 'bg-[#543A2A] text-[#FAF6F0] shadow-xs'
              : 'text-[#8D7868] hover:text-[#543A2A]'
          }`}
        >
          Shares
        </button>
      </div>

      {/* Per-Person Share Box */}
      {mode === 'equal' && (
        <div className="p-3.5 rounded-2xl border border-[#E5D9CC] bg-white flex items-center justify-between shadow-xs">
          <span className="text-xs font-bold text-[#6E5849] uppercase tracking-wider">
            Per-Person Share
          </span>
          <span className="px-3 py-1 rounded-full bg-[#EFE4D6] text-[#543A2A] font-bold text-sm">
            ₹{formatMinor(equalPerPersonMinor, currency)}
          </span>
        </div>
      )}

      {/* Mode 1: Equal Split */}
      {mode === 'equal' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-[#8D7868] px-1">
            <span>{equalParticipantIds.size} members participating</span>
            <button
              type="button"
              onClick={selectAllEqual}
              className="font-bold text-[#543A2A] hover:underline"
            >
              Select all ({members.length})
            </button>
          </div>

          <div className="space-y-2">
            {members.map((m) => {
              const isChecked = equalParticipantIds.has(m.id);
              const split = computedSplits.find((s) => s.memberId === m.id);
              const owedAmount = split ? split.owedMinor : 0;
              const percent = totalAmountMinor > 0 && isChecked
                ? ((owedAmount / totalAmountMinor) * 100).toFixed(1)
                : '0.0';

              return (
                <div
                  key={m.id}
                  onClick={() => toggleEqualParticipant(m.id)}
                  className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer select-none transition-all shadow-xs ${
                    isChecked
                      ? 'bg-white border-[#E5D9CC] hover:border-[#D4B89B]'
                      : 'bg-[#FAF6F0]/60 border-[#E5D9CC]/60 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center font-bold text-xs shrink-0 transition ${
                        isChecked ? 'bg-[#543A2A] text-[#FAF6F0] border-[#543A2A]' : 'bg-white border-[#E5D9CC]'
                      }`}
                    >
                      {isChecked ? '✓' : ''}
                    </div>

                    <div className="w-8 h-8 rounded-full bg-[#EFE4D6] text-[#543A2A] flex items-center justify-center font-bold text-xs shrink-0">
                      {m.displayName.charAt(0).toUpperCase()}
                    </div>

                    <div className="min-w-0">
                      <span className="text-xs font-bold text-[#432E22] block truncate">
                        {m.displayName}
                      </span>
                      <span className="text-[10px] text-[#8D7868] block truncate">
                        {isChecked ? '1 share included' : 'Excluded'}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0 space-y-0.5">
                    <div className="text-xs sm:text-sm font-bold text-[#432E22]">
                      ₹{formatMinor(owedAmount, currency)}
                    </div>
                    {isChecked && (
                      <span className="px-2 py-0.5 rounded-full border border-[#E5D9CC] bg-[#FAF6F0] text-[9px] font-semibold text-[#8D7868]">
                        {percent}%
                      </span>
                    )}
                  </div>
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
              <div key={m.id} className="flex items-center justify-between gap-3 p-2.5 rounded-2xl border border-[#E5D9CC] bg-white shadow-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[#EFE4D6] text-[#543A2A] flex items-center justify-center text-xs font-bold shrink-0">
                    {m.displayName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs font-bold text-[#432E22] truncate">
                    {m.displayName}
                  </span>
                </div>
                <div className="w-32 shrink-0 flex items-center gap-1">
                  <span className="text-xs font-bold text-[#8D7868]">₹</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={exactInputs[m.id] || ''}
                    onChange={(e) =>
                      setExactInputs((prev) => ({ ...prev, [m.id]: e.target.value }))
                    }
                    className="w-full px-2.5 py-1 text-xs sm:text-sm font-bold text-right rounded-xl border border-[#E5D9CC] bg-[#FAF6F0] text-[#432E22] focus:outline-none focus:border-[#543A2A]"
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
          <div className="flex items-center justify-between text-xs font-bold text-[#8D7868] px-1">
            <span>ENTER PERCENTAGE PER PERSON</span>
            <button
              type="button"
              onClick={distributePercentagesEvenly}
              className="text-[#543A2A] font-bold hover:underline"
            >
              Split evenly
            </button>
          </div>

          <div className="space-y-2">
            {members.map((m) => {
              const split = computedSplits.find((s) => s.memberId === m.id);
              const owed = split ? split.owedMinor : 0;

              return (
                <div key={m.id} className="flex items-center justify-between gap-3 p-2.5 rounded-2xl border border-[#E5D9CC] bg-white shadow-xs">
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#432E22] block truncate">
                      {m.displayName}
                    </span>
                    <span className="text-[10px] font-semibold text-[#8D7868]">
                      ≈ ₹{formatMinor(owed, currency)}
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
                      className="w-full pl-2.5 pr-6 py-1 text-xs sm:text-sm font-bold text-right rounded-xl border border-[#E5D9CC] bg-[#FAF6F0] text-[#432E22] focus:outline-none focus:border-[#543A2A]"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-[#8D7868] pointer-events-none">
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
          <div className="text-xs font-bold text-[#8D7868] px-1 uppercase">
            Assign Shares (e.g. 2 for couples, 1 for singles)
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
                <div key={m.id} className="flex items-center justify-between gap-3 p-2.5 rounded-2xl border border-[#E5D9CC] bg-white shadow-xs">
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#432E22] block truncate">
                      {m.displayName}
                    </span>
                    <span className="text-[10px] text-[#8D7868] font-semibold">
                      ₹{formatMinor(owed, currency)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => step(-1)}
                      className="w-7 h-7 flex items-center justify-center rounded-full border border-[#E5D9CC] bg-[#FAF6F0] text-[#543A2A] font-bold hover:bg-[#EFE4D6] transition cursor-pointer"
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
                      className="w-12 px-1 py-1 text-xs sm:text-sm font-bold text-center rounded-xl border border-[#E5D9CC] bg-[#FAF6F0] text-[#432E22] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => step(1)}
                      className="w-7 h-7 flex items-center justify-center rounded-full border border-[#E5D9CC] bg-[#FAF6F0] text-[#543A2A] font-bold hover:bg-[#EFE4D6] transition cursor-pointer"
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
          <div className="text-xs font-bold text-[#8D7868] px-1 uppercase">
            Equal baseline with per-person +/- adjustment
          </div>

          <div className="space-y-2">
            {members.map((m) => {
              const split = computedSplits.find((s) => s.memberId === m.id);
              const owed = split ? split.owedMinor : 0;

              return (
                <div key={m.id} className="flex items-center justify-between gap-3 p-2.5 rounded-2xl border border-[#E5D9CC] bg-white shadow-xs">
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#432E22] block truncate">
                      {m.displayName}
                    </span>
                    <span className="text-[10px] font-bold text-[#543A2A] bg-[#EFE4D6] px-2 py-0.5 rounded-full">
                      Total: ₹{formatMinor(owed, currency)}
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
                      className="w-full px-2.5 py-1 text-xs sm:text-sm font-bold text-right rounded-xl border border-[#E5D9CC] bg-[#FAF6F0] text-[#432E22] focus:outline-none focus:border-[#543A2A]"
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
