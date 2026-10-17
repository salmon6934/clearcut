'use client';

// app/group/page.tsx
// Production Group Screen with Tabs (Expenses, Balances, Activity), BalanceSummary, FAB, Undo Toast & Restore Filter

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useRepository,
  useGroup,
  useGroupMembers,
  useGroupExpenses,
  useGroupSettlements,
  useGroupLedger,
} from '../../lib/data/hooks';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { formatMinor } from '../../lib/engine/money';
import { BalanceSummary } from '../../components/BalanceSummary';
import { ExpenseRow } from '../../components/ExpenseRow';
import { SettlementRow } from '../../components/SettlementRow';
import { SettleSuggestionList } from '../../components/SettleSuggestionList';
import { PairwiseBreakdown } from '../../components/PairwiseBreakdown';
import { ExpenseFilters, FILTER_CATEGORIES } from '../../components/ExpenseFilters';
import { SettleModal } from '../../components/SettleModal';
import { EmptyState } from '../../components/EmptyState';
import { SyncBadge } from '../../components/SyncBadge';
import { Toast } from '../../components/Toast';
import { GroupRealtimeManager, type RealtimeStatus } from '../../lib/sync/realtime';
import { showToast } from '../../lib/ui/toast';
import { haptics } from '../../lib/native/haptics';
import type { SuggestedPayment, SettlementDraft, Expense } from '../../lib/data/types';

type GroupTab = 'expenses' | 'balances' | 'activity';

function GroupDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = searchParams.get('id') || '';

  const authState = useAuth();
  const currentUserId = authState.user?.id || 'local_user';
  const repo = useRepository(currentUserId);
  const group = useGroup(repo, groupId);
  const members = useGroupMembers(repo, groupId);
  const allExpenses = useGroupExpenses(repo, groupId, false);
  const settlements = useGroupSettlements(repo, groupId, false);
  const ledger = useGroupLedger(repo, groupId);

  const currentMember = members.find((m) => m.userId === currentUserId);
  const currentMemberId = currentMember?.id;

  const [activeTab, setActiveTab] = useState<GroupTab>('expenses');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [undoToast, setUndoToast] = useState<{ id: string; title: string } | null>(null);

  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<SuggestedPayment | null>(null);

  // Realtime postgres_changes subscription
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('disconnected');

  useEffect(() => {
    if (!groupId) return;
    const rt = new GroupRealtimeManager(groupId, supabase, async () => {
      await repo.syncManager?.kick('realtime_hint');
    });

    const unsub = rt.subscribeStatus((st) => {
      setRealtimeStatus(st);
    });

    rt.start();

    return () => {
      unsub();
      rt.destroy();
    };
  }, [groupId, repo]);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    repo.syncManager?.kick('group_mount', true).catch(() => {});
  }, [repo]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-transparent text-[#432E22] pb-28">
        <header className="sticky top-0 z-30 bg-[#FAF6F0]/95 backdrop-blur-md border-b border-[#E5D9CC] px-4 py-3 animate-pulse">
          <div className="max-w-xl mx-auto flex items-center justify-between">
            <div className="h-9 w-9 rounded-full bg-[#EFE4D6]" />
            <div className="h-5 w-32 bg-[#EFE4D6] rounded-full" />
            <div className="h-7 w-16 bg-[#EFE4D6] rounded-full" />
          </div>
        </header>
        <div className="max-w-xl mx-auto p-4 sm:p-5 space-y-5 animate-pulse">
          <div className="h-32 w-full bg-white rounded-3xl border border-[#E5D9CC]" />
          <div className="h-11 w-full bg-white rounded-2xl border border-[#E5D9CC]" />
        </div>
      </div>
    );
  }

  if (!groupId || !group) {
    return (
      <div className="min-h-screen bg-transparent text-[#432E22] p-6 flex flex-col items-center justify-center text-center">
        <EmptyState
          icon={<span className="text-2xl">🔍</span>}
          title="Group not found"
          description="This group may have been deleted or does not exist locally."
          actionText="Back to Groups"
          onAction={() => router.push('/')}
        />
      </div>
    );
  }

  // Active vs Deleted expenses
  const activeExpenses = allExpenses.filter((e) => !e.deletedAt);
  const deletedExpenses = allExpenses.filter((e) => Boolean(e.deletedAt));
  const baseExpenses = activeExpenses;

  // Group Activity Event Stream
  interface GroupActivityEvent {
    id: string;
    type: 'expense' | 'settlement' | 'init';
    timestamp: string;
    title: string;
    subtitle: string;
    amountMinor?: number;
    badgeEmoji: string;
  }

  const groupActivities: GroupActivityEvent[] = [];

  if (group) {
    groupActivities.push({
      id: `group-init-${group.id}`,
      type: 'init',
      timestamp: group.createdAt || new Date().toISOString(),
      title: `Group "${group.name}" initialized`,
      subtitle: `${members.length} member${members.length > 1 ? 's' : ''} enrolled in ${group.currency}`,
      badgeEmoji: '📁',
    });
  }

  for (const exp of allExpenses) {
    const payerSplits = (exp.splits || []).filter((s) => s.paidMinor > 0);
    const payerNames = payerSplits
      .map((s) => members.find((m) => m.id === s.memberId)?.displayName || 'Someone')
      .join(', ');

    groupActivities.push({
      id: `exp-${exp.id}`,
      type: 'expense',
      timestamp: exp.createdAt || exp.expenseDate || new Date().toISOString(),
      title: `Added "${exp.title}"`,
      subtitle: payerNames ? `Paid by ${payerNames}` : `Expense recorded`,
      amountMinor: exp.amountMinor,
      badgeEmoji: '🧾',
    });
  }

  for (const s of settlements) {
    const fromName = members.find((m) => m.id === s.fromMemberId)?.displayName || 'Member';
    const toName = members.find((m) => m.id === s.toMemberId)?.displayName || 'Member';

    groupActivities.push({
      id: `settle-${s.id}`,
      type: 'settlement',
      timestamp: s.createdAt || s.settledOn || new Date().toISOString(),
      title: `${fromName} paid ${toName}`,
      subtitle: s.note || `Settlement recorded`,
      amountMinor: s.amountMinor,
      badgeEmoji: '⚡',
    });
  }

  groupActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Search & category filtering
  const displayedExpenses = baseExpenses.filter((exp) => {
    // 1. Category filter
    if (selectedCategory !== 'all') {
      const catConfig = FILTER_CATEGORIES.find((c) => c.id === selectedCategory);
      const matches = catConfig?.matches || [selectedCategory];
      const expCat = (exp.category || 'general').toLowerCase();
      if (!matches.includes(expCat) && expCat !== selectedCategory) {
        return false;
      }
    }

    // 2. Text search on title and notes
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const inTitle = exp.title.toLowerCase().includes(q);
      const inNotes = exp.notes ? exp.notes.toLowerCase().includes(q) : false;
      if (!inTitle && !inNotes) return false;
    }

    return true;
  });

  // Calculate current user net balance
  const userNetBalanceMinor = currentMemberId
    ? ledger.balances.get(currentMemberId) ?? 0
    : 0;

  // Calculate total group spend across active expenses
  const totalSpendMinor = activeExpenses.reduce((acc, exp) => acc + exp.amountMinor, 0);

  const handleOpenSettleWithSuggestion = (sug: SuggestedPayment) => {
    setSelectedSuggestion(sug);
    setIsSettleModalOpen(true);
  };

  const handleSettle = (draft: SettlementDraft) => {
    repo.addSettlement(draft, currentUserId);
    setIsSettleModalOpen(false);
  };

  const handleDeleteExpense = (expense: Expense) => {
    if (!window.confirm(`Are you sure you want to delete "${expense.title}"?`)) {
      return;
    }
    repo.deleteExpense(expense.id);
    setUndoToast({ id: expense.id, title: expense.title });
  };

  const handleUndoDeleteExpense = () => {
    if (undoToast) {
      repo.restoreExpense(undoToast.id);
      setUndoToast(null);
    }
  };

  const handleDeleteSettlement = (settlementId: string) => {
    repo.deleteSettlement(settlementId);
  };

  return (
    <div className="min-h-screen bg-transparent text-[#432E22] pb-28 relative">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-[#FAF6F0]/95 backdrop-blur-md border-b border-[#E5D9CC] px-4 py-3 shadow-xs">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-10 h-10 rounded-full border border-[#E5D9CC] bg-white flex items-center justify-center text-[#543A2A] hover:bg-[#EFE4D6] transition active:scale-95 shadow-sm"
            >
              <svg className="w-4 h-4 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-base font-bold text-[#432E22] leading-tight truncate max-w-[180px] sm:max-w-xs">
                {group.name}
              </h1>
              <p className="text-[11px] text-[#8D7868] font-semibold">
                {members.length} member{members.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SyncBadge manager={repo.syncManager} realtimeStatus={realtimeStatus} />
            <Link
              href={`/group/members?id=${group.id}`}
              className="px-3.5 py-1.5 rounded-full border border-[#E5D9CC] bg-white text-xs font-bold text-[#543A2A] shadow-sm hover:bg-[#EFE4D6] transition active:scale-95"
            >
              MEMBERS
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-xl mx-auto p-4 sm:p-5 space-y-5">
        {/* Balance Summary Header Banner */}
        <BalanceSummary
          netBalanceMinor={userNetBalanceMinor}
          currency={group.currency}
          totalGroupSpendMinor={totalSpendMinor}
        />

        {/* Tab Navigation */}
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-full bg-[#EFE4D6] border border-[#E5D9CC] text-xs font-bold">
          <button
            onClick={() => setActiveTab('expenses')}
            className={`py-2 rounded-full transition-all uppercase ${
              activeTab === 'expenses'
                ? 'bg-[#543A2A] text-[#FAF6F0] shadow-sm'
                : 'text-[#8D7868] hover:text-[#543A2A]'
            }`}
          >
            EXPENSES ({activeExpenses.length})
          </button>
          <button
            onClick={() => setActiveTab('balances')}
            className={`py-2 rounded-full transition-all uppercase ${
              activeTab === 'balances'
                ? 'bg-[#543A2A] text-[#FAF6F0] shadow-sm'
                : 'text-[#8D7868] hover:text-[#543A2A]'
            }`}
          >
            BALANCES ({ledger.suggestedPayments.length})
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`py-2 rounded-full transition-all uppercase ${
              activeTab === 'activity'
                ? 'bg-[#543A2A] text-[#FAF6F0] shadow-sm'
                : 'text-[#8D7868] hover:text-[#543A2A]'
            }`}
          >
            ACTIVITY
          </button>
        </div>

        {/* Tab 1: Expenses List */}
        {activeTab === 'expenses' && (
          <div className="space-y-4">
            {/* Real-Time Search & Category Filters */}
            <ExpenseFilters
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              totalCount={baseExpenses.length}
              filteredCount={displayedExpenses.length}
            />

            {displayedExpenses.length === 0 ? (
              <div className="py-16 text-center text-sm font-medium text-[#8D7868]">
                No expenses yet. Add an expense to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {displayedExpenses.map((exp) => (
                  <ExpenseRow
                    key={exp.id}
                    expense={exp}
                    members={members}
                    currentMemberId={currentMemberId}
                    onClick={() => {
                      router.push(`/group/expense?id=${group.id}&expenseId=${exp.id}`);
                    }}
                    onDelete={() => handleDeleteExpense(exp)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Balances & Simplified / Pairwise Debts */}
        {activeTab === 'balances' && (
          <div className="space-y-5">
            {/* Pairwise & Simplified Debt Breakdown */}
            <PairwiseBreakdown
              pairwiseDebts={ledger.pairwiseDebts || []}
              suggestedPayments={ledger.suggestedPayments || []}
              members={members}
              currency={group.currency}
              currentMemberId={currentMemberId}
              onSettleUp={(from, to, amt) =>
                handleOpenSettleWithSuggestion({
                  fromMemberId: from,
                  toMemberId: to,
                  amountMinor: amt,
                  currency: group.currency,
                })
              }
            />

            {/* Individual Members Breakdown */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#8D7868] px-1">
                Individual Balances
              </h3>
              <div className="divide-y divide-[#E5D9CC] rounded-3xl border border-[#E5D9CC] bg-white shadow-sm overflow-hidden">
                {members.map((m) => {
                  const balance = ledger.balances.get(m.id) ?? 0;
                  const isYou = m.userId === currentUserId;

                  return (
                    <div key={m.id} className="flex items-center justify-between p-4 hover:bg-[#FAF6F0] transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full border border-[#E5D9CC] bg-[#EFE4D6] text-[#543A2A] flex items-center justify-center text-xs font-bold shrink-0">
                          {m.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-sm font-bold text-[#432E22]">
                            {m.displayName} {isYou ? '(You)' : ''}
                          </span>
                          <span className="text-[10px] text-[#8D7868] font-medium block uppercase">{m.role}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        {balance > 0 ? (
                          <span className="px-2.5 py-0.5 rounded-full border border-[#C5D9BE] bg-[#E8F0E4] text-xs font-bold text-[#2E4226]">
                            +{formatMinor(balance, group.currency)}
                          </span>
                        ) : balance < 0 ? (
                          <span className="px-2.5 py-0.5 rounded-full border border-[#F5C2C0] bg-[#FCE8E6] text-xs font-bold text-[#A83232]">
                            -{formatMinor(Math.abs(balance), group.currency)}
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full border border-[#E5D9CC] bg-[#FAF6F0] text-[10px] font-semibold text-[#8D7868] uppercase">
                            settled
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Settlement History */}
            <div className="space-y-2.5 pt-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#8D7868] px-1">
                Settlement History ({settlements.length})
              </h3>
              {settlements.length === 0 ? (
                <div className="p-6 rounded-3xl border border-[#E5D9CC] bg-white text-xs font-semibold text-[#8D7868] text-center shadow-xs">
                  No settlements recorded yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {settlements.map((s) => (
                    <SettlementRow
                      key={s.id}
                      settlement={s}
                      members={members}
                      currency={group.currency}
                      currentUserId={currentUserId}
                      onDelete={(id) => handleDeleteSettlement(id)}
                    />
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setSelectedSuggestion(null);
                setIsSettleModalOpen(true);
              }}
              className="w-full py-3.5 text-xs font-bold uppercase tracking-wider rounded-full border border-[#E5D9CC] bg-[#FAF6F0] hover:bg-[#EFE4D6] text-[#432E22] shadow-xs active:scale-95 transition cursor-pointer"
            >
              Record Custom Settlement
            </button>
          </div>
        )}

        {/* Tab 3: Activity Feed */}
        {activeTab === 'activity' && (
          <div className="space-y-3">
            {groupActivities.length === 0 ? (
              <EmptyState
                icon={<span>⚡</span>}
                title="No activity recorded yet"
                description="When you record expenses or log settlements, activity will appear here."
              />
            ) : (
              groupActivities.map((act) => (
                <div
                  key={act.id}
                  className="rounded-3xl border border-[#E5D9CC] p-4 shadow-xs flex items-center justify-between gap-3 bg-white"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full border border-[#E5D9CC] flex items-center justify-center text-sm shrink-0 bg-[#EFE4D6] text-[#543A2A]">
                      {act.badgeEmoji}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-[#432E22] tracking-tight">
                          {act.title}
                        </span>
                      </div>
                      <p className="text-xs text-[#8D7868] font-medium truncate mt-0.5">
                        {act.subtitle}
                      </p>
                      <p className="text-[10px] text-[#A89689] font-medium mt-0.5">
                        {new Date(act.timestamp).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {typeof act.amountMinor === 'number' && (
                      <div className="text-right">
                        <div className="font-bold text-sm text-[#432E22]">
                          ₹ {formatMinor(act.amountMinor, group.currency)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Floating Action Button (Bottom-Right: Add Expense) */}
      <div className="fixed bottom-6 right-5 z-40">
        <Link
          href={`/group/expense?id=${group.id}`}
          className="px-5 py-3 rounded-full bg-[#543A2A] text-[#FAF6F0] font-bold text-sm tracking-wide shadow-xl hover:bg-[#432E20] transition active:scale-95 flex items-center gap-2 cursor-pointer"
        >
          <svg className="w-4 h-4 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span>Add expense</span>
        </Link>
      </div>

      {/* Settle Up Modal */}
      <SettleModal
        isOpen={isSettleModalOpen}
        onClose={() => setIsSettleModalOpen(false)}
        groupId={group.id}
        currency={group.currency}
        members={members}
        initialFromMemberId={selectedSuggestion?.fromMemberId}
        initialToMemberId={selectedSuggestion?.toMemberId}
        initialAmountMinor={selectedSuggestion?.amountMinor}
        onSettle={handleSettle}
      />

      {/* 5-Second Undo Toast */}
      {undoToast && (
        <Toast
          message={`Deleted "${undoToast.title}"`}
          actionText="Undo"
          onAction={handleUndoDeleteExpense}
          onClose={() => setUndoToast(null)}
          durationMs={5000}
        />
      )}
    </div>
  );
}

export default function GroupDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs font-mono font-black uppercase text-black">Loading group...</div>}>
      <GroupDetailContent />
    </Suspense>
  );
}
