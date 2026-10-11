'use client';

// app/group/page.tsx
// Production Group Screen with Tabs (Expenses, Balances, Activity), BalanceSummary, FAB, Undo Toast & Restore Filter

import React, { useState, Suspense } from 'react';
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
import { getAuthState } from '../../lib/auth';
import { formatMinor } from '../../lib/engine/money';
import { BalanceSummary } from '../../components/BalanceSummary';
import { ExpenseRow } from '../../components/ExpenseRow';
import { SettlementRow } from '../../components/SettlementRow';
import { SettleSuggestionList } from '../../components/SettleSuggestionList';
import { SettleModal } from '../../components/SettleModal';
import { EmptyState } from '../../components/EmptyState';
import { SyncBadge } from '../../components/SyncBadge';
import { Toast } from '../../components/Toast';
import type { SuggestedPayment, SettlementDraft, Expense } from '../../lib/data/types';

type GroupTab = 'expenses' | 'balances' | 'activity';

function GroupDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = searchParams.get('id') || '';

  const repo = useRepository();
  const group = useGroup(repo, groupId);
  const members = useGroupMembers(repo, groupId);
  const allExpenses = useGroupExpenses(repo, groupId, true);
  const settlements = useGroupSettlements(repo, groupId, false);
  const ledger = useGroupLedger(repo, groupId);

  const authState = getAuthState();
  const currentUserId = authState.user?.id || 'local_user';
  const currentMember = members.find((m) => m.userId === currentUserId);
  const currentMemberId = currentMember?.id;

  const [activeTab, setActiveTab] = useState<GroupTab>('expenses');
  const [expenseFilter, setExpenseFilter] = useState<'active' | 'deleted'>('active');
  const [undoToast, setUndoToast] = useState<{ id: string; title: string } | null>(null);

  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<SuggestedPayment | null>(null);

  if (!groupId || !group) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 flex flex-col items-center justify-center text-center">
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
  const displayedExpenses = expenseFilter === 'active' ? activeExpenses : deletedExpenses;

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

  const handleRestoreExpense = (expenseId: string) => {
    repo.restoreExpense(expenseId);
  };

  const handleDeleteSettlement = (settlementId: string) => {
    repo.deleteSettlement(settlementId);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 pb-28">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-9 h-9 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                {group.name}
              </h1>
              <p className="text-[11px] text-zinc-400 capitalize">
                {group.type} • {members.length} members
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SyncBadge />
            <Link
              href={`/group/members?id=${group.id}`}
              className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition shadow-sm"
            >
              Members
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
        <div className="flex p-1 rounded-2xl bg-zinc-200/80 dark:bg-zinc-900/80 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('expenses')}
            className={`flex-1 py-2 rounded-xl transition-all ${
              activeTab === 'expenses'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            Expenses ({activeExpenses.length})
          </button>
          <button
            onClick={() => setActiveTab('balances')}
            className={`flex-1 py-2 rounded-xl transition-all ${
              activeTab === 'balances'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            Balances ({ledger.suggestedPayments.length})
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`flex-1 py-2 rounded-xl transition-all ${
              activeTab === 'activity'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            Activity
          </button>
        </div>

        {/* Tab 1: Expenses List */}
        {activeTab === 'expenses' && (
          <div className="space-y-3">
            {/* Filter Toggle: Active vs Deleted */}
            {deletedExpenses.length > 0 && (
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-200/80 dark:bg-zinc-800/80 text-xs font-semibold w-fit">
                <button
                  type="button"
                  onClick={() => setExpenseFilter('active')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    expenseFilter === 'active'
                      ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  Active ({activeExpenses.length})
                </button>
                <button
                  type="button"
                  onClick={() => setExpenseFilter('deleted')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    expenseFilter === 'deleted'
                      ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  Deleted ({deletedExpenses.length})
                </button>
              </div>
            )}

            {displayedExpenses.length === 0 ? (
              <EmptyState
                icon={<span className="text-2xl">{expenseFilter === 'active' ? '🧾' : '🗑️'}</span>}
                title={expenseFilter === 'active' ? 'No expenses added yet' : 'No deleted expenses'}
                description={
                  expenseFilter === 'active'
                    ? "Tap the '+ Add Expense' button below to record dinner, tickets, or groceries."
                    : 'Expenses you soft-delete will appear here for review and restoration.'
                }
                actionText={expenseFilter === 'active' ? '+ Add Expense' : undefined}
                onAction={expenseFilter === 'active' ? () => router.push(`/group/expense?id=${group.id}`) : undefined}
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

        {/* Tab 2: Balances & Simplified Debts */}
        {activeTab === 'balances' && (
          <div className="space-y-5">
            {/* Settle Suggestions */}
            <SettleSuggestionList
              suggestions={ledger.suggestedPayments}
              members={members}
              currency={group.currency}
              currentUserId={currentUserId}
              onSettleClick={handleOpenSettleWithSuggestion}
            />

            {/* Individual Members Breakdown */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 px-1">
                Individual Balances
              </h3>
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
                {members.map((m) => {
                  const balance = ledger.balances.get(m.id) ?? 0;
                  const isYou = m.userId === currentUserId;

                  return (
                    <div key={m.id} className="flex items-center justify-between p-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-300">
                          {m.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {m.displayName} {isYou ? '(You)' : ''}
                          </span>
                          <span className="text-[10px] text-zinc-400 block capitalize">{m.role}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        {balance > 0 ? (
                          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                            +{formatMinor(balance, group.currency)}
                          </span>
                        ) : balance < 0 ? (
                          <span className="text-sm font-bold text-orange-600 dark:text-orange-400 font-mono">
                            -{formatMinor(Math.abs(balance), group.currency)}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400 font-medium">settled</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Settlement History */}
            <div className="space-y-2.5 pt-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 px-1">
                Settlement History ({settlements.length})
              </h3>
              {settlements.length === 0 ? (
                <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-500 text-center">
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
              className="w-full py-3 text-sm font-semibold rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors text-zinc-700 dark:text-zinc-300"
            >
              Record Custom Settlement
            </button>
          </div>
        )}

        {/* Tab 3: Activity Feed */}
        {activeTab === 'activity' && (
          <div className="space-y-2">
            <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-500 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Group &ldquo;{group.name}&rdquo; initialized</span>
                <span className="text-zinc-400 ml-auto">{new Date(group.createdAt || '').toLocaleDateString()}</span>
              </div>
              {activeExpenses.slice(0, 5).map((e) => (
                <div key={e.id} className="flex items-center gap-2 border-t border-zinc-100 dark:border-zinc-800/80 pt-2.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="truncate">Added expense &ldquo;{e.title}&rdquo; ({formatMinor(e.amountMinor, e.currency)})</span>
                  <span className="text-zinc-400 ml-auto shrink-0">{new Date(e.createdAt || e.expenseDate || '').toLocaleDateString()}</span>
                </div>
              ))}
              {settlements.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center gap-2 border-t border-zinc-100 dark:border-zinc-800/80 pt-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="truncate">Recorded payment of {formatMinor(s.amountMinor, group.currency)}</span>
                  <span className="text-zinc-400 ml-auto shrink-0">{new Date(s.createdAt || s.settledOn || '').toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Floating Action Button for Adding Expense */}
      <div className="fixed bottom-6 right-6 z-40 max-w-xl mx-auto">
        <Link
          href={`/group/expense?id=${group.id}`}
          className="flex items-center gap-2 px-5 py-3.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-xl shadow-emerald-600/30 active:scale-95 transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          <span>Add Expense</span>
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
    <Suspense fallback={<div className="p-8 text-center text-sm text-zinc-500">Loading group...</div>}>
      <GroupDetailContent />
    </Suspense>
  );
}
