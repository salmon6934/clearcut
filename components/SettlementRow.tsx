'use client';

// components/SettlementRow.tsx
// Stitch Neo-Brutalist Settlement Transaction Row

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
  cash: { label: 'CASH', icon: '💵' },
  upi: { label: 'UPI', icon: '⚡' },
  venmo: { label: 'VENMO', icon: '📱' },
  paypal: { label: 'PAYPAL', icon: '🅿️' },
  bank: { label: 'IMPS/BANK', icon: '🏦' },
  other: { label: 'OTHER', icon: '🤝' },
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

  const currentMember = members.find((m) => m.userId === currentUserId);
  const canDelete =
    Boolean(onDelete) &&
    (currentMember?.role === 'owner' ||
      currentMember?.role === 'admin' ||
      settlement.createdBy === currentUserId ||
      settlement.createdBy === currentMember?.id ||
      !settlement.createdBy);

  const methodInfo = settlement.method
    ? METHOD_LABELS[settlement.method] || { label: settlement.method.toUpperCase(), icon: '💸' }
    : { label: 'PAYMENT', icon: '💸' };

  const dateStr = settlement.settledOn || settlement.createdAt || '';
  const formattedDate = dateStr
    ? new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <div className="p-3.5 rounded-xl border-2 border-black bg-white shadow-[2px_2px_0px_0px_#000] transition">
      <div className="flex items-start justify-between gap-3">
        {/* Left: Icon & Narrative */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg border-2 border-black bg-[#ccff00] text-black flex items-center justify-center text-lg shrink-0 shadow-[1px_1px_0px_0px_#000]">
            {methodInfo.icon}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-black text-black truncate">
                {fromMember?.displayName || 'Someone'}
              </span>
              <span className="text-xs text-black/60 font-mono font-bold">➔ paid ➔</span>
              <span className="text-sm font-black text-black truncate">
                {toMember?.displayName || 'Someone'}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-0.5 text-xs text-black/60 font-mono">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded border border-black bg-[#f0f0ea] text-[10px] font-bold text-black">
                {methodInfo.label}
              </span>
              {formattedDate && <span>• {formattedDate}</span>}
              {settlement.note && (
                <span className="italic truncate max-w-[140px] text-black/60 font-mono">
                  &ldquo;{settlement.note}&rdquo;
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Amount & Delete action */}
        <div className="text-right shrink-0">
          <div className="text-sm font-black font-mono text-black">
            ₹ {formatMinor(settlement.amountMinor, currency)}
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
                    className="px-2 py-0.5 rounded border border-black text-[11px] font-mono font-bold bg-[#ff8a80] text-black shadow-[1px_1px_0px_0px_#000]"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-2 py-0.5 rounded text-[11px] font-mono text-black/60 hover:text-black"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="text-[11px] font-mono font-black text-black/60 hover:text-black uppercase"
                >
                  Undo
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
