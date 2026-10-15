'use client';

// app/activity/page.tsx
// Stitch Neo-Brutalist Global Activity Feed with Soft-Delete Audit & Immediate Restore Action

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRepository, useAllGroups } from '../../lib/data/hooks';
import { formatMinor } from '../../lib/engine/money';
import { BottomNav } from '../../components/BottomNav';
import { EmptyState } from '../../components/EmptyState';
import { SyncBadge } from '../../components/SyncBadge';
import { showToast } from '../../lib/ui/toast';
import { haptics } from '../../lib/native/haptics';

interface ActivityItem {
  id: string;
  type: 'expense' | 'settlement' | 'group' | 'deleted';
  timestamp: string;
  groupId: string;
  groupName: string;
  currency: string;
  title: string;
  subtitle: string;
  amountMinor?: number;
  badgeEmoji: string;
  badgeBg: string;
  isDeleted?: boolean;
  deletedExpenseId?: string;
}

export default function ActivityPage() {
  const router = useRouter();
  const repo = useRepository();
  const groups = useAllGroups(repo, false);

  const [mounted, setMounted] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'settlement' | 'deleted'>('all');

  useEffect(() => {
    setMounted(true);
    repo.syncManager?.kick('activity_mount', true).catch(() => {});
  }, [repo]);

  const handleRestoreExpense = async (expenseId: string, title: string) => {
    await haptics.tap().catch(() => {});
    repo.restoreExpense(expenseId);
    showToast(`Restored "${title}"! Balances recalculated.`, 'success', 2500);
  };

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

  // Aggregate all activities across all groups (including soft-deleted expenses)
  const activities: ActivityItem[] = [];

  for (const group of groups) {
    const expenses = repo.store.getGroupExpenses(group.id, true);
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

    // 2. Expenses (Active and Soft-Deleted)
    for (const exp of expenses) {
      if (exp.deletedAt) {
        activities.push({
          id: `exp-del-${exp.id}`,
          type: 'deleted',
          timestamp: exp.deletedAt || exp.updatedAt || new Date().toISOString(),
          groupId: group.id,
          groupName: group.name,
          currency: exp.currency,
          title: `Deleted "${exp.title}"`,
          subtitle: `Soft-deleted • Tap restore to reinstate in group`,
          amountMinor: exp.amountMinor,
          badgeEmoji: '🗑️',
          badgeBg: 'bg-[#ff8a80]',
          isDeleted: true,
          deletedExpenseId: exp.id,
        });
      } else {
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

  const deletedCount = activities.filter((a) => a.type === 'deleted').length;

  // Filter
  const filteredActivities = activities.filter((act) => {
    if (filterType === 'expense' && act.type !== 'expense') return false;
    if (filterType === 'settlement' && act.type !== 'settlement') return false;
    if (filterType === 'deleted' && act.type !== 'deleted') return false;
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
        <div className="flex items-center gap-2 text-xs font-mono font-black flex-wrap">
          {[
            { id: 'all', label: `ALL (${activities.length})` },
            { id: 'expense', label: 'EXPENSES' },
            { id: 'settlement', label: 'SETTLEMENTS' },
            { id: 'deleted', label: `DELETED (${deletedCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg border-2 border-black uppercase transition cursor-pointer active:translate-x-0.5 active:translate-y-0.5 ${
                filterType === tab.id
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
            title={filterType === 'deleted' ? 'No deleted expenses' : 'No activity recorded yet'}
            description={
              filterType === 'deleted'
                ? 'Soft-deleted expenses will appear here. Any member can restore them at any time.'
                : 'When you create groups, record expenses, or log settlements, the ledger event stream will appear here.'
            }
            actionText={filterType === 'deleted' ? undefined : 'Go to Dashboard'}
            onAction={filterType === 'deleted' ? undefined : () => router.push('/')}
          />
        ) : (
          <div className="space-y-3">
            {filteredActivities.map((act) => (
              <div
                key={act.id}
                className={`block rounded-2xl border-2 border-black p-4 shadow-[3px_3px_0px_0px_#000] transition ${
                  act.isDeleted ? 'bg-[#ffebee]' : 'bg-white hover:bg-[#fafaf6]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/group?id=${act.groupId}`}
                    className="flex items-start gap-3 min-w-0 flex-1 hover:opacity-80 transition"
                  >
                    <div
                      className={`w-10 h-10 rounded-xl border-2 border-black flex items-center justify-center text-base shrink-0 shadow-[2px_2px_0px_0px_#000] ${act.badgeBg}`}
                    >
                      {act.badgeEmoji}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`font-bold text-sm text-black uppercase tracking-tight ${
                            act.isDeleted ? 'line-through text-black/50' : ''
                          }`}
                        >
                          {act.title}
                        </span>
                        <span className="font-mono text-[9px] font-black uppercase px-1.5 py-0.5 rounded border border-black bg-[#f0f0ea]">
                          {act.groupName}
                        </span>
                        {act.isDeleted && (
                          <span className="font-mono text-[9px] font-black uppercase px-1.5 py-0.5 rounded border border-black bg-[#ff8a80] text-black">
                            DELETED
                          </span>
                        )}
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
                  </Link>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {typeof act.amountMinor === 'number' && (
                      <div className="text-right">
                        <div
                          className={`font-mono font-black text-sm sm:text-base text-black ${
                            act.isDeleted ? 'line-through text-black/40' : ''
                          }`}
                        >
                          {formatMinor(act.amountMinor, act.currency)}
                        </div>
                        <span className="font-mono text-[9px] uppercase font-bold text-black/50">
                          {act.currency}
                        </span>
                      </div>
                    )}

                    {act.isDeleted && act.deletedExpenseId && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleRestoreExpense(act.deletedExpenseId!, act.title);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#ccff00] hover:bg-[#bbf000] text-black border-2 border-black font-mono font-black text-xs uppercase shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer"
                      >
                        RESTORE
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Persistent Bottom Nav */}
      <BottomNav />
    </div>
  );
}
