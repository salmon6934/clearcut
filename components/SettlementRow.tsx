'use client';

// components/SettlementRow.tsx
// Warm Cafe Settlement Transaction Row

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
  bank: { label: 'Bank', icon: '🏦' },
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
    <div className="p-3.5 rounded-2xl border border-[#E5D9CC] bg-white shadow-xs transition hover:border-[#D4B89B]">
      <div className="flex items-start justify-between gap-3">
        {/* Left: Icon & Narrative */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-[#EFE4D6] text-[#543A2A] flex items-center justify-center text-base shrink-0 shadow-xs">
            {methodInfo.icon}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-[#432E22] truncate">
                {fromMember?.displayName || 'Someone'}
              </span>
              <span className="text-xs text-[#8D7868] font-medium">paid</span>
              <span className="text-sm font-bold text-[#432E22] truncate">
                {toMember?.displayName || 'Someone'}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-0.5 text-xs text-[#8D7868]">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#E5D9CC] bg-[#FAF6F0] text-[10px] font-semibold text-[#6E5849]">
                {methodInfo.label}
              </span>
              {formattedDate && <span>• {formattedDate}</span>}
              {settlement.note && (
                <span className="italic truncate max-w-[140px] text-[#8D7868]">
                  &ldquo;{settlement.note}&rdquo;
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Amount & Delete action */}
        <div className="text-right shrink-0">
          <div className="text-sm font-bold text-[#432E22]">
            ₹{formatMinor(settlement.amountMinor, currency)}
          </div>

          {canDelete && (
            <div className="mt-1">
              {confirmDelete ? (
                <div className="flex items-center gap-1.5 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (onDelete) onDelete(settlement.id);
                      setConfirmDelete(false);
                    }}
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FCE8E6] text-[#A83232] border border-[#F5C2C0] shadow-xs active:scale-95 transition"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-2 py-0.5 rounded-full text-[11px] text-[#8D7868] hover:text-[#432E22]"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="text-[11px] font-semibold text-[#8D7868] hover:text-[#A83232] transition"
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

