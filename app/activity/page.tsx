'use client';

// app/activity/page.tsx
// Stitch Neo-Brutalist Global Activity Feed (P2P LEDGER V2.4)

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRepository, useAllGroups } from '../../lib/data/hooks';
import { formatMinor } from '../../lib/engine/money';
import { BottomNav } from '../../components/BottomNav';
import { EmptyState } from '../../components/EmptyState';
import { SyncBadge } from '../../components/SyncBadge';

interface ActivityItem {
  id: string;
  type: 'expense' | 'settlement' | 'group';
  timestamp: string;
  groupId: string;
  groupName: string;
  currency: string;
  title: string;
  subtitle: string;
  amountMinor?: number;
  badgeEmoji: string;
  badgeBg: string;
}

export default function ActivityPage() {
  const router = useRouter();
  const repo = useRepository();
  const groups = useAllGroups(repo, false);

  const [mounted, setMounted] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'settlement'>('all');

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] text-black pb-28">
        <header className="sticky top-0 z-30 bg-[#f5f5f0] border-b-2 border-black px-4 py-3 animate-pulse">
          <div className="max-w-xl mx-auto flex items-center justify-between">
            <div className="h-6 w-32 bg-[#e0e0d8] rounded border border-black" />
            <div className="h-8 w-20 bg-[#e0e0d8] rounded-lg border border-black" />
          </div>
        </header>
        <div className="max-w-xl mx-auto p-4 space-y-4 animate-pulse">
          <div className="h-20 w-full bg-white rounded-2xl border-2 border-black" />
          <div className="h-20 w-full bg-white rounded-2xl border-2 border-black" />
        </div>
      </div>
    );
  }

  // Aggregate all activities across all groups
  const activities: ActivityItem[] = [];

  for (const group of groups) {
    const expenses = repo.store.getGroupExpenses(group.id, false);
    const settlements = repo.store.getGroupSettlements(group.id, false);
    const members = repo.store.getGroupMembers(group.id, false);

    // 1. Group creation event
    activities.push({
      id: `group-init-${group.id}`,
      type: 'group',
      timestamp: group.createdAt || group.updatedAt || new Date().toISOString(),
      groupId: group.id,
      groupName: group.name,
      currency: group.currency,
      title: `Group "${group.name}" Created`,
      subtitle: `${members.length} member${members.length > 1 ? 's' : ''} enrolled in ${group.currency}`,
      badgeEmoji: '📁',
      badgeBg: 'bg-[#ffd600]',
    });

    // 2. Expenses
    for (const exp of expenses) {
      const payerSplits = exp.splits.filter((s) => s.paidMinor > 0);
      const payerNames = payerSplits
        .map((s) => members.find((m) => m.id === s.memberId)?.displayName || 'Someone')
        .join(', ');

      activities.push({
        id: `exp-${exp.id}`,
        type: 'expense',
        timestamp: exp.createdAt || exp.expenseDate || new Date().toISOString(),
        groupId: group.id,
        groupName: group.name,
        currency: exp.currency,
        title: exp.title,
        subtitle: payerNames ? `Paid by ${payerNames}` : `Expense recorded`,
        amountMinor: exp.amountMinor,
        badgeEmoji: '🧾',
        badgeBg: 'bg-[#00e5ff]',
      });
    }

    // 3. Settlements
    for (const s of settlements) {
      const fromName = members.find((m) => m.id === s.fromMemberId)?.displayName || 'Member';
      const toName = members.find((m) => m.id === s.toMemberId)?.displayName || 'Member';

      activities.push({
        id: `settle-${s.id}`,
        type: 'settlement',
        timestamp: s.createdAt || s.settledOn || new Date().toISOString(),
        groupId: group.id,
        groupName: group.name,
        currency: group.currency,
        title: `${fromName} paid ${toName}`,
        subtitle: s.note || `Settlement recorded`,
        amountMinor: s.amountMinor,
        badgeEmoji: '⚡',
        badgeBg: 'bg-[#ccff00]',
      });
    }
  }

  // Sort descending by timestamp
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Filter
  const filteredActivities = activities.filter((act) => {
    if (filterType === 'expense' && act.type !== 'expense') return false;
    if (filterType === 'settlement' && act.type !== 'settlement') return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-black pb-28">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#f5f5f0] border-b-2 border-black px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#00e5ff] border-2 border-black flex items-center justify-center font-mono font-black text-sm shadow-[2px_2px_0px_0px_#000]">
              ⚡
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight uppercase leading-none">
                ACTIVITY FEED
              </h1>
            </div>
          </div>

          <SyncBadge manager={repo.syncManager} />
        </div>
      </header>

      <div className="max-w-xl mx-auto p-4 sm:p-5 space-y-4">
        {/* Filter Tabs */}
        <div className="flex items-center gap-2 text-xs font-mono font-black">
          {[
            { id: 'all', label: `ALL EVENTS (${activities.length})` },
            { id: 'expense', label: 'EXPENSES' },
            { id: 'settlement', label: 'SETTLEMENTS' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg border-2 border-black uppercase transition cursor-pointer active:translate-x-0.5 active:translate-y-0.5 ${filterType === tab.id
                  ? 'bg-[#ccff00] text-black shadow-[2px_2px_0px_0px_#000]'
                  : 'bg-white text-black/70 hover:text-black shadow-[1px_1px_0px_0px_#000]'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Activity Items */}
        {filteredActivities.length === 0 ? (
          <EmptyState
            icon={<span>⚡</span>}
            title="No activity recorded yet"
            description="When you create groups, record expenses, or log settlements, the ledger event stream will appear here."
            actionText="Go to Dashboard"
            onAction={() => router.push('/')}
          />
        ) : (
          <div className="space-y-3">
            {filteredActivities.map((act) => (
              <Link
                key={act.id}
                href={`/group?id=${act.groupId}`}
                className="block bg-white rounded-2xl border-2 border-black p-4 shadow-[3px_3px_0px_0px_#000] hover:bg-[#fafaf6] transition active:translate-x-0.5 active:translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl border-2 border-black flex items-center justify-center text-base shrink-0 shadow-[2px_2px_0px_0px_#000] ${act.badgeBg}`}
                    >
                      {act.badgeEmoji}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-black uppercase tracking-tight">
                          {act.title}
                        </span>
                        <span className="font-mono text-[9px] font-black uppercase px-1.5 py-0.5 rounded border border-black bg-[#f0f0ea]">
                          {act.groupName}
                        </span>
                      </div>
                      <p className="font-mono text-[11px] text-black/60 font-bold truncate">
                        {act.subtitle}
                      </p>
                      <p className="font-mono text-[10px] text-black/40 font-bold mt-1">
                        {new Date(act.timestamp).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  {typeof act.amountMinor === 'number' && (
                    <div className="text-right shrink-0">
                      <div className="font-mono font-black text-sm sm:text-base text-black">
                        {formatMinor(act.amountMinor, act.currency)}
                      </div>
                      <span className="font-mono text-[9px] uppercase font-bold text-black/50">
                        {act.currency}
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Persistent Bottom Nav */}
      <BottomNav />
    </div>
  );
}
