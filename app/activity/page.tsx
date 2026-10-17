'use client';

// app/activity/page.tsx
// Brew & Browse Warm Cafe Global Activity Feed with Soft-Delete Audit & Immediate Restore Action

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
  type: 'expense' | 'settlement' | 'group';
  timestamp: string;
  groupId: string;
  groupName: string;
  currency: string;
  title: string;
  subtitle: string;
  amountMinor?: number;
  badgeEmoji: string;
}

export default function ActivityPage() {
  const router = useRouter();
  const repo = useRepository();
  const groups = useAllGroups(repo, false);

  const [mounted, setMounted] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'settlement'>('all');

  useEffect(() => {
    setMounted(true);
    repo.syncManager?.kick('activity_mount', true).catch(() => {});
  }, [repo]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-transparent text-[#432E22] pb-28">
        <div className="max-w-xl mx-auto p-4 sm:p-5 space-y-5 animate-pulse">
          <header className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#EFE4D6]" />
              <div className="h-7 w-28 bg-[#EFE4D6] rounded-xl" />
            </div>
            <div className="h-9 w-24 bg-[#EFE4D6] rounded-full" />
          </header>
          <div className="h-20 w-full bg-white rounded-3xl border border-[#E5D9CC]" />
          <div className="h-20 w-full bg-white rounded-3xl border border-[#E5D9CC]" />
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
    });

    // 2. Expenses (Active only)
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
    <div className="min-h-screen bg-transparent text-[#432E22] pb-28">
      <div className="max-w-xl mx-auto p-4 sm:p-5 space-y-5">
        {/* Seamless Top Header Bar labeled "Activity" */}
        <header className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#543A2A] text-[#FAF6F0] flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-extrabold text-[#432E22] tracking-tight">
              Activity
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <SyncBadge manager={repo.syncManager} />
          </div>
        </header>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 text-xs font-bold flex-wrap">
          {[
            { id: 'all', label: `ALL (${activities.length})` },
            { id: 'expense', label: 'EXPENSES' },
            { id: 'settlement', label: 'SETTLEMENTS' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id as any)}
              className={`px-3.5 py-1.5 rounded-full uppercase transition cursor-pointer active:scale-95 ${
                filterType === tab.id
                  ? 'bg-[#543A2A] text-[#FAF6F0] shadow-sm'
                  : 'bg-white text-[#8D7868] hover:text-[#543A2A] border border-[#E5D9CC]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Activity Items */}
        {filteredActivities.length === 0 ? (
          <EmptyState
            icon={
              <div className="w-12 h-12 rounded-2xl bg-[#543A2A]/10 text-[#543A2A] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-hat-glasses preview-icon">
                  <path d="M14 18a2 2 0 0 0-4 0"/>
                  <path d="m19 11-2.11-6.657a2 2 0 0 0-2.752-1.148l-1.276.61A2 2 0 0 1 12 4H8.5a2 2 0 0 0-1.925 1.456L5 11"/>
                  <path d="M2 11h20"/>
                  <circle cx="17" cy="18" r="3"/>
                  <circle cx="7" cy="18" r="3"/>
                </svg>
              </div>
            }
            title="No activity recorded yet"
            description="When you create groups, record expenses, or log settlements, your activity will appear here."
            actionText="Go to Dashboard"
            onAction={() => router.push('/')}
          />
        ) : (
          <div className="space-y-3">
            {filteredActivities.map((act) => (
              <div
                key={act.id}
                className="block rounded-3xl border border-[#E5D9CC] p-4 shadow-xs transition bg-white hover:bg-[#FAF6F0]"
              >
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/group?id=${act.groupId}`}
                    className="flex items-start gap-3 min-w-0 flex-1 hover:opacity-85 transition"
                  >
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-base shrink-0 shadow-xs bg-[#EFE4D6] text-[#543A2A]">
                      {act.badgeEmoji}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-[#432E22] tracking-tight">
                          {act.title}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-[#E5D9CC] bg-[#FAF6F0] text-[#6E5849]">
                          {act.groupName}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#8D7868] font-medium truncate mt-0.5">
                        {act.subtitle}
                      </p>
                      <p className="text-[10px] text-[#A89689] font-medium mt-1">
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
                        <div className="font-bold text-sm sm:text-base text-[#432E22]">
                          ₹{formatMinor(act.amountMinor, act.currency)}
                        </div>
                      </div>
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
