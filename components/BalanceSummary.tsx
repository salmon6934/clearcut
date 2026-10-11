'use client';

// components/BalanceSummary.tsx
// Perspective-Aware Group Balance Banner with WCAG 2.1 AA Accessible Indicators

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
      className={`rounded-2xl p-5 border transition-all shadow-sm ${
        isOwed
          ? 'bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/20 text-emerald-950 dark:text-emerald-50'
          : owes
          ? 'bg-gradient-to-br from-orange-500/10 via-rose-500/5 to-transparent border-orange-500/20 text-orange-950 dark:text-orange-50'
          : 'bg-zinc-100/80 dark:bg-zinc-900/80 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100'
      } ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {isOwed && (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
                <span>You are owed overall</span>
              </span>
            )}
            {owes && (
              <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                <span>You owe overall</span>
              </span>
            )}
            {isSettled && (
              <span className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
                <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span>Status</span>
              </span>
            )}
          </div>

          <div
            className={`text-2xl sm:text-3xl font-bold tracking-tight ${
              isOwed
                ? 'text-emerald-600 dark:text-emerald-400'
                : owes
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-zinc-700 dark:text-zinc-300'
            }`}
          >
            {isSettled ? 'All settled up' : formattedAmount}
          </div>

          {subtitle && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
          )}
        </div>

        {totalGroupSpendMinor !== undefined && totalGroupSpendMinor > 0 && (
          <div className="text-right pl-4 border-l border-zinc-200 dark:border-zinc-800">
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider block">
              Group Spend
            </span>
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 font-mono">
              {formatMinor(totalGroupSpendMinor, currency)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
