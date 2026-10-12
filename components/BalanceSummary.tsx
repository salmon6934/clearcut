'use client';

// components/BalanceSummary.tsx
// Neo-Brutalist Group Balance Summary Card

import React from 'react';
import { formatMinor } from '../lib/engine/money';

interface BalanceSummaryProps {
  netBalanceMinor: number;
  currency: string;
  totalGroupSpendMinor?: number;
  subtitle?: string;
  className?: string;
}

export function BalanceSummary({
  netBalanceMinor,
  currency,
  totalGroupSpendMinor,
  subtitle,
  className = '',
}: BalanceSummaryProps) {
  const isOwed = netBalanceMinor > 0;
  const owes = netBalanceMinor < 0;
  const isSettled = netBalanceMinor === 0;

  const formattedAmount = formatMinor(Math.abs(netBalanceMinor), currency);

  return (
    <div
      role="region"
      aria-label="Balance summary"
      className={`bg-white rounded-2xl border-2 border-black shadow-[4px_4px_0px_0px_#000] p-5 ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {isOwed && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#ccff00] text-black border-2 border-black text-[11px] font-mono font-black uppercase shadow-[2px_2px_0px_0px_#000]">
                <span>↗ YOU ARE OWED</span>
              </span>
            )}
            {owes && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#ff8a80] text-black border-2 border-black text-[11px] font-mono font-black uppercase shadow-[2px_2px_0px_0px_#000]">
                <span>↙ YOU OWE</span>
              </span>
            )}
            {isSettled && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#f0f0ea] text-black border-2 border-black text-[11px] font-mono font-black uppercase shadow-[2px_2px_0px_0px_#000]">
                <span>✓ ALL SETTLED UP</span>
              </span>
            )}
          </div>

          <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-black">
            {isSettled ? '₹0.00' : (isOwed ? `+${formattedAmount}` : `-${formattedAmount}`)}
          </div>

          {subtitle && (
            <p className="text-xs text-black/60 font-mono font-bold">{subtitle}</p>
          )}
        </div>

        {totalGroupSpendMinor !== undefined && totalGroupSpendMinor > 0 && (
          <div className="text-right pl-4 border-l-2 border-black shrink-0">
            <span className="text-[10px] font-mono font-black text-black/60 uppercase tracking-wider block">
              TOTAL SPEND
            </span>
            <span className="text-base sm:text-lg font-black text-black font-mono block mt-0.5">
              ₹ {formatMinor(totalGroupSpendMinor, currency)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
