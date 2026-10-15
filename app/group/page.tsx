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
import { exportAndShareGroupCsv } from '../../lib/data/export-csv';
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
  const allExpenses = useGroupExpenses(repo, groupId, true);
  const settlements = useGroupSettlements(repo, groupId, false);
  const ledger = useGroupLedger(repo, groupId);

  const currentMember = members.find((m) => m.userId === currentUserId);
  const currentMemberId = currentMember?.id;

  const [activeTab, setActiveTab] = useState<GroupTab>('expenses');
  const [expenseFilter, setExpenseFilter] = useState<'active' | 'deleted'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [undoToast, setUndoToast] = useState<{ id: string; title: string } | null>(null);

  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<SuggestedPayment | null>(null);
  const [isExporting, setIsExporting] = useState(false);

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
      <div className="min-h-screen bg-[#f5f5f0] text-black pb-28">
        <header className="sticky top-0 z-30 bg-[#f5f5f0] border-b-2 border-black px-4 py-3 animate-pulse">
          <div className="max-w-xl mx-auto flex items-center justify-between">
            <div className="h-9 w-9 rounded-lg bg-[#e0e0d8] border-2 border-black" />
            <div className="h-5 w-32 bg-[#e0e0d8] rounded-lg border border-black" />
            <div className="h-7 w-16 bg-[#e0e0d8] rounded-lg border border-black" />
          </div>
        </header>
        <div className="max-w-xl mx-auto p-4 sm:p-5 space-y-5 animate-pulse">
          <div className="h-32 w-full bg-white rounded-2xl border-2 border-black" />
          <div className="h-11 w-full bg-white rounded-xl border-2 border-black" />
        </div>
      </div>
    );
  }

  if (!groupId || !group) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] text-black p-6 flex flex-col items-center justify-center text-center">
        <EmptyState
          icon={<span className="text-2xl">🔍</span>}
          title="Group not found"
          description="This group may have been deleted or does not exist locally."
          actionText="Back to Dashboard"
          onAction={() => router.push('/')}
        />
      </div>
    );
  }

  // Active vs Deleted expenses
  const activeExpenses = allExpenses.filter((e) => !e.deletedAt);
  const deletedExpenses = allExpenses.filter((e) => Boolean(e.deletedAt));
  const baseExpenses = activeExpenses;

  // Group Activity Event Stream (includes soft-deleted expenses with restore actions)
  interface GroupActivityEvent {
    id: string;
    type: 'deleted' | 'expense' | 'settlement' | 'init';
    timestamp: string;
    title: string;
    subtitle: string;
    amountMinor?: number;
    badgeEmoji: string;
    badgeBg: string;
    isDeleted?: boolean;
    expenseId?: string;
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
      badgeBg: 'bg-[#ffd600]',
    });
  }

  for (const exp of allExpenses) {
    if (exp.deletedAt) {
      groupActivities.push({
        id: `exp-del-${exp.id}`,
        type: 'deleted',
        timestamp: exp.deletedAt || exp.updatedAt || new Date().toISOString(),
        title: `Deleted "${exp.title}"`,
        subtitle: `Soft-deleted • Tap restore to reinstate in group`,
        amountMinor: exp.amountMinor,
        badgeEmoji: '🗑️',
        badgeBg: 'bg-[#ff8a80]',
        isDeleted: true,
        expenseId: exp.id,
      });
    } else {
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
        badgeBg: 'bg-[#00e5ff]',
      });
    }
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
      badgeBg: 'bg-[#ccff00]',
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
    repo.deleteExpense(expense.id);
    setUndoToast({ id: expense.id, title: expense.title });
  };

  const handleUndoDeleteExpense = () => {
    if (undoToast) {
      repo.restoreExpense(undoToast.id);
      setUndoToast(null);
    }
  };

  const handleRestoreExpense = async (expenseId: string) => {
    await haptics.tap().catch(() => {});
    const restored = repo.restoreExpense(expenseId);
    showToast(`Restored "${restored?.title || 'Expense'}"! Balances updated.`, 'success', 2500);
  };

  const handleDeleteSettlement = (settlementId: string) => {
    repo.deleteSettlement(settlementId);
  };

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-black pb-28 relative">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-[#f5f5f0] border-b-2 border-black px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-10 h-10 rounded-lg border-2 border-black bg-white flex items-center justify-center text-black hover:bg-[#ffd600] transition active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_0px_#000]"
            >
              <svg className="w-4 h-4 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-base font-black text-black leading-tight uppercase tracking-tight">
                {group.name}
              </h1>
              <p className="text-[11px] text-black/60 font-mono uppercase flex items-center gap-1.5 font-bold">
                <span>{group.type}</span>
                <span>•</span>
                <span>{members.length} member{members.length > 1 ? 's' : ''}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SyncBadge manager={repo.syncManager} realtimeStatus={realtimeStatus} />
            <button
              type="button"
              onClick={async () => {
                setIsExporting(true);
                try {
                  await exportAndShareGroupCsv(group, activeExpenses, members, settlements);
                } catch (e: any) {
                  alert(`Export failed: ${e?.message || 'Unknown error'}`);
                } finally {
                  setIsExporting(false);
                }
              }}
              disabled={isExporting}
              title="Export Group Ledger to CSV"
              className="px-2.5 py-1.5 rounded-lg border-2 border-black bg-white text-xs font-mono font-black text-black shadow-[2px_2px_0px_0px_#000] hover:bg-[#ffd600] transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer active:translate-x-0.5 active:translate-y-0.5"
            >
              <span>{isExporting ? '...' : 'CSV'}</span>
            </button>
            <Link
              href={`/group/members?id=${group.id}`}
              className="px-2.5 py-1.5 rounded-lg border-2 border-black bg-white text-xs font-mono font-black text-black shadow-[2px_2px_0px_0px_#000] hover:bg-[#ffd600] transition active:translate-x-0.5 active:translate-y-0.5"
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
        <div className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-white border-2 border-black shadow-[3px_3px_0px_0px_#000] text-xs font-mono font-black">
          <button
            onClick={() => setActiveTab('expenses')}
            className={`py-2 rounded-xl transition-all uppercase ${
              activeTab === 'expenses'
                ? 'bg-[#ccff00] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]'
                : 'text-black/60 hover:text-black'
            }`}
          >
            EXPENSES ({activeExpenses.length})
          </button>
          <button
            onClick={() => setActiveTab('balances')}
            className={`py-2 rounded-xl transition-all uppercase ${
              activeTab === 'balances'
                ? 'bg-[#ccff00] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]'
                : 'text-black/60 hover:text-black'
            }`}
          >
            BALANCES ({ledger.suggestedPayments.length})
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`py-2 rounded-xl transition-all uppercase ${
              activeTab === 'activity'
                ? 'bg-[#ccff00] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]'
                : 'text-black/60 hover:text-black'
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

            {/* Notice for soft-deleted expenses */}
            {deletedExpenses.length > 0 && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#ffebee] border-2 border-black text-xs font-mono font-bold text-black shadow-[2px_2px_0px_0px_#000]">
                <div className="flex items-center gap-2">
                  <span className="text-base">🗑️</span>
                  <span>{deletedExpenses.length} expense{deletedExpenses.length > 1 ? 's' : ''} soft-deleted</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('activity')}
                  className="px-2.5 py-1 rounded-lg bg-white border-2 border-black font-black text-[11px] uppercase hover:bg-[#ffd600] transition active:scale-95 shadow-[1px_1px_0px_0px_#000]"
                >
                  VIEW IN ACTIVITY
                </button>
              </div>
            )}

            {displayedExpenses.length === 0 ? (
              <EmptyState
                icon={<span className="text-2xl">🧾</span>}
                title="No expenses added yet"
                description="Tap the '+ Add Expense' button below to record dinner, tickets, or groceries."
                actionText="+ Add Expense"
                onAction={() => router.push(`/group/expense?id=${group.id}`)}
              />
            ) : (
              <div className="space-y-2">
                {displayedExpenses.map((exp) => (
                  <ExpenseRow
                    key={exp.id}
                    expense={exp}
                    members={members}
                    currentMemberId={currentMemberId}
                    onClick={() => {
                      if (!exp.deletedAt) {
                        router.push(`/group/expense?id=${group.id}&expenseId=${exp.id}`);
                      }
                    }}
                    onDelete={!exp.deletedAt ? () => handleDeleteExpense(exp) : undefined}
                    onRestore={exp.deletedAt ? () => handleRestoreExpense(exp.id) : undefined}
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
              <h3 className="text-xs font-mono font-black uppercase tracking-wider text-black px-1">
                INDIVIDUAL BALANCES
              </h3>
              <div className="divide-y-2 divide-black rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_0px_#000] overflow-hidden">
                {members.map((m) => {
                  const balance = ledger.balances.get(m.id) ?? 0;
                  const isYou = m.userId === currentUserId;

                  return (
                    <div key={m.id} className="flex items-center justify-between p-3.5 hover:bg-[#fafaf6] transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg border-2 border-black bg-[#00e5ff] flex items-center justify-center text-xs font-mono font-black text-black shadow-[1px_1px_0px_0px_#000]">
                          {m.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-xs sm:text-sm font-mono font-black text-black">
                            {m.displayName} {isYou ? '(You)' : ''}
                          </span>
                          <span className="text-[10px] font-mono text-black/60 block uppercase font-bold">{m.role}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        {balance > 0 ? (
                          <span className="px-2 py-0.5 rounded border border-black bg-[#ccff00] text-xs font-mono font-black text-black">
                            +{formatMinor(balance, group.currency)}
                          </span>
                        ) : balance < 0 ? (
                          <span className="px-2 py-0.5 rounded border border-black bg-[#ff8a80] text-xs font-mono font-black text-black">
                            -{formatMinor(Math.abs(balance), group.currency)}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded border border-black bg-[#f0f0ea] text-[10px] font-mono font-bold text-black/60 uppercase">
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
              <h3 className="text-xs font-mono font-black uppercase tracking-wider text-black px-1">
                SETTLEMENT HISTORY ({settlements.length})
              </h3>
              {settlements.length === 0 ? (
                <div className="p-4 rounded-xl border-2 border-black bg-white text-xs font-mono font-bold text-black/60 text-center shadow-[2px_2px_0px_0px_#000]">
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
              className="w-full py-3 text-xs font-mono font-black uppercase rounded-xl border-2 border-black bg-white hover:bg-[#ffd600] text-black shadow-[3px_3px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition"
            >
              RECORD CUSTOM SETTLEMENT
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
                description="When you record expenses, log settlements, or soft-delete entries, the ledger event stream will appear here."
              />
            ) : (
              groupActivities.map((act) => (
                <div
                  key={act.id}
                  className={`rounded-2xl border-2 border-black p-3.5 shadow-[3px_3px_0px_0px_#000] flex items-center justify-between gap-3 ${
                    act.isDeleted ? 'bg-[#ffebee]' : 'bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl border-2 border-black flex items-center justify-center text-sm shrink-0 shadow-[1.5px_1.5px_0px_0px_#000] ${act.badgeBg}`}
                    >
                      {act.badgeEmoji}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`font-bold text-xs sm:text-sm text-black uppercase tracking-tight ${
                            act.isDeleted ? 'line-through text-black/50' : ''
                          }`}
                        >
                          {act.title}
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
                      <p className="font-mono text-[10px] text-black/40 font-bold">
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
                        <div
                          className={`font-mono font-black text-xs sm:text-sm text-black ${
                            act.isDeleted ? 'line-through text-black/40' : ''
                          }`}
                        >
                          ₹ {formatMinor(act.amountMinor, group.currency)}
                        </div>
                      </div>
                    )}

                    {act.isDeleted && act.expenseId && (
                      <button
                        type="button"
                        onClick={() => handleRestoreExpense(act.expenseId!)}
                        className="px-2.5 py-1 rounded-lg bg-[#ccff00] hover:bg-[#bbf000] text-black border-2 border-black font-mono font-black text-xs uppercase shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer"
                      >
                        RESTORE
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Floating Action Bar */}
      <div className="fixed bottom-4 left-0 right-0 z-40 px-4 max-w-xl mx-auto">
        <div className="grid grid-cols-2 gap-3">
          <Link
            href={`/group/expense?id=${group.id}`}
            className="py-3.5 px-4 rounded-xl bg-[#ccff00] hover:bg-[#bbf000] text-black font-black text-xs sm:text-sm tracking-wider uppercase border-2 border-black shadow-[3px_3px_0px_0px_#000] flex items-center justify-center gap-2 active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer"
          >
            <span>+ ADD EXPENSE</span>
          </Link>

          <button
            onClick={() => {
              setSelectedSuggestion(null);
              setIsSettleModalOpen(true);
            }}
            className="py-3.5 px-4 rounded-xl bg-[#00e5ff] hover:bg-[#00cbe6] text-black font-black text-xs sm:text-sm tracking-wider uppercase border-2 border-black shadow-[3px_3px_0px_0px_#000] flex items-center justify-center gap-2 active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer"
          >
            <span>⚡ SETTLE UP</span>
          </button>
        </div>
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
