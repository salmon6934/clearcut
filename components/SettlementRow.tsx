'use client';

// components/SettlementRow.tsx
// Rich Settlement Transaction Row with Method Tags & Undo (Soft-Delete) Action
// Implements T-2.3.2 for settlement history and deletion.

import React, { useState } from 'react';
import type { Settlement, Member } from '../lib/data/types';
import { formatMinor } from '../lib/engine/money';

export interface SettlementRowProps {
  settlement: Settlement;
  members: Member[];
  currency: string;
  currentUserId?: string;
  onDelete?: (settlementId: string) => void;
}

const METHOD_LABELS: Record<string, { label: string; icon: string }> = {
  cash: { label: 'Cash', icon: '💵' },
  upi: { label: 'UPI', icon: '⚡' },
  venmo: { label: 'Venmo', icon: '📱' },
  paypal: { label: 'PayPal', icon: '🅿️' },
  bank: { label: 'Bank Transfer', icon: '🏦' },
  other: { label: 'Other', icon: '🤝' },
};

export function SettlementRow({
  settlement,
  members,
  currency,
  currentUserId,
  onDelete,
}: SettlementRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const memberMap = new Map<string, Member>();
  for (const m of members) {
    memberMap.set(m.id, m);
  }

  const fromMember = memberMap.get(settlement.fromMemberId);
  const toMember = memberMap.get(settlement.toMemberId);

  // Check if current user has permission to delete this settlement
  // (Creator, group owner, or group admin)
  const currentMember = members.find((m) => m.userId === currentUserId);
  const canDelete =
    Boolean(onDelete) &&
    (currentMember?.role === 'owner' ||
      currentMember?.role === 'admin' ||
      settlement.createdBy === currentUserId ||
      settlement.createdBy === currentMember?.id ||
      !settlement.createdBy);

  const methodInfo = settlement.method
    ? METHOD_LABELS[settlement.method] || { label: settlement.method, icon: '💸' }
    : { label: 'Payment', icon: '💸' };

  const dateStr = settlement.settledOn || settlement.createdAt || '';
  const formattedDate = dateStr
    ? new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <div className="p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm transition hover:border-zinc-300 dark:hover:border-zinc-700">
      <div className="flex items-start justify-between gap-3">
        {/* Left: Icon & Narrative */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-lg shrink-0">
            {methodInfo.icon}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                {fromMember?.displayName || 'Someone'}
              </span>
              <span className="text-xs text-zinc-400">paid</span>
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                {toMember?.displayName || 'Someone'}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
                {methodInfo.label}
              </span>
              {formattedDate && <span>• {formattedDate}</span>}
              {settlement.note && (
                <span className="italic truncate max-w-[140px] text-zinc-400">
                  &ldquo;{settlement.note}&rdquo;
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Amount & Delete action */}
        <div className="text-right shrink-0">
          <div className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {formatMinor(settlement.amountMinor, currency)}
          </div>

          {canDelete && (
            <div className="mt-1">
              {confirmDelete ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (onDelete) onDelete(settlement.id);
                      setConfirmDelete(false);
                    }}
                    className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-600 text-white hover:bg-rose-500 transition"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="text-[11px] font-medium text-zinc-400 hover:text-rose-500 transition-colors"
                >
                  Undo / Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
