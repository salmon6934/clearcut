'use client';

// components/BalanceSummary.tsx
// Brew & Browse Warm Cafe Group Balance Summary Card

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
      className={`bg-white rounded-3xl border border-[#E5D9CC] shadow-[0_4px_20px_rgba(84,58,42,0.06)] p-5 sm:p-6 ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {isOwed && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EAEFE8] text-[#3D5638] border border-[#D5E2D2] text-xs font-bold uppercase tracking-wider">
                <span>↙ YOU ARE OWED</span>
              </span>
            )}
            {owes && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F8EDEA] text-[#9A3C2D] border border-[#EBD7D3] text-xs font-bold uppercase tracking-wider">
                <span>↗ YOU OWE</span>
              </span>
            )}
            {isSettled && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFE4D6] text-[#543A2A] border border-[#E5D9CC] text-xs font-bold uppercase tracking-wider">
                <span>✓ ALL SETTLED UP</span>
              </span>
            )}
          </div>

          <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#432E22]">
            {isSettled ? formatMinor(0, currency) : (isOwed ? `+${formattedAmount}` : `-${formattedAmount}`)}
          </div>

          {subtitle && (
            <p className="text-xs text-[#8D7868] font-medium">{subtitle}</p>
          )}
        </div>

        {totalGroupSpendMinor !== undefined && totalGroupSpendMinor > 0 && (
          <div className="text-right pl-4 border-l border-[#E5D9CC] shrink-0">
            <span className="text-[10px] font-bold text-[#8D7868] uppercase tracking-wider block">
              TOTAL SPEND
            </span>
            <span className="text-base sm:text-lg font-extrabold text-[#432E22] block mt-0.5">
              {formatMinor(totalGroupSpendMinor, currency)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
