'use client';

// app/group/expense/page.tsx
// Full-Screen Expense Creation and Edit Route Hosting ExpenseForm with Conflict Resolution

import React, { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRepository, useGroup, useGroupMembers } from '../../../lib/data/hooks';
import { getAuthState } from '../../../lib/auth';
import { ExpenseForm } from '../../../components/ExpenseForm';
import { ConflictResolutionSheet } from '../../../components/ConflictResolutionSheet';
import { resolveExpenseConflict } from '../../../lib/sync/merge';
import type { ExpenseDraft } from '../../../lib/data/types';

function ExpenseEntryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = searchParams.get('id') || '';
  const expenseId = searchParams.get('expenseId') || searchParams.get('edit') || undefined;

  const repo = useRepository();
  const group = useGroup(repo, groupId);
  const members = useGroupMembers(repo, groupId);
  const authState = getAuthState();
  const currentUserId = authState.user?.id || 'local_user';

  const [showConflictSheet, setShowConflictSheet] = useState(false);

  // If editing, find existing expense
  const existingExpense = expenseId ? repo.store.getExpense(expenseId) : undefined;
  const isConflict = existingExpense?._sync === 'conflict';

  // Conflict mutation detail if available
  const conflictMutation = expenseId
    ? repo.queue.getAllItems().find((m) => m.entityId === expenseId && m.status === 'conflict')
    : undefined;
  const serverSnapshot = conflictMutation?.conflictDetail?.server_snapshot || conflictMutation?.conflictDetail;

  if (!groupId || !group) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 flex flex-col items-center justify-center text-center">
        <h2 className="text-base font-bold mb-2">Group not found</h2>
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 text-white"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  const handleSave = (draft: ExpenseDraft) => {
    if (draft.id) {
      repo.editExpense(draft, currentUserId);
    } else {
      repo.addExpense(draft, currentUserId);
    }
    router.push(`/group?id=${groupId}`);
  };

  const handleKeepMine = () => {
    if (!existingExpense) return;
    resolveExpenseConflict({
      mode: 'keep_mine',
      expenseId: existingExpense.id,
      store: repo.store,
      queue: repo.queue,
      serverSnapshot,
    });
    repo.syncManager?.kick('conflict_resolved_keep_mine');
    setShowConflictSheet(false);
    router.push(`/group?id=${groupId}`);
  };

  const handleUseTheirs = () => {
    if (!existingExpense) return;
    resolveExpenseConflict({
      mode: 'use_theirs',
      expenseId: existingExpense.id,
      store: repo.store,
      queue: repo.queue,
      serverSnapshot,
    });
    setShowConflictSheet(false);
    router.push(`/group?id=${groupId}`);
  };

  const initialDraft: ExpenseDraft | undefined = existingExpense
    ? {
        id: existingExpense.id,
        groupId: existingExpense.groupId,
        title: existingExpense.title,
        notes: existingExpense.notes,
        amountMinor: existingExpense.amountMinor,
        currency: existingExpense.currency,
        category: existingExpense.category,
        expenseDate: existingExpense.expenseDate,
        splitType: existingExpense.splitType,
        splits: existingExpense.splits,
      }
    : undefined;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-4 sm:p-6 pb-12">
      <div className="max-w-lg mx-auto space-y-5">
        {/* Header */}
        <header className="flex items-center justify-between pt-1">
          <Link
            href={`/group?id=${groupId}`}
            className="w-9 h-9 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>

          <h1 className="text-base font-bold">
            {existingExpense ? 'Edit Expense' : 'Add an Expense'}
          </h1>

          <div className="w-9" />
        </header>

        {/* Conflict Warning Banner */}
        {isConflict && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Version Conflict (409)
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Remote server has a newer version of this expense.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowConflictSheet(true)}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-sm transition shrink-0"
            >
              Resolve
            </button>
          </div>
        )}

        {/* Expense Form */}
        <ExpenseForm
          groupId={groupId}
          currency={group.currency}
          members={members}
          currentUserId={currentUserId}
          initialDraft={initialDraft}
          onSave={handleSave}
          onCancel={() => router.push(`/group?id=${groupId}`)}
        />

        {/* Conflict Resolution Modal */}
        {existingExpense && (
          <ConflictResolutionSheet
            isOpen={showConflictSheet}
            onClose={() => setShowConflictSheet(false)}
            localExpense={existingExpense}
            serverExpense={serverSnapshot}
            members={members}
            onKeepMine={handleKeepMine}
            onUseTheirs={handleUseTheirs}
          />
        )}
      </div>
    </div>
  );
}

export default function ExpenseEntryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-zinc-500">Loading form...</div>}>
      <ExpenseEntryContent />
    </Suspense>
  );
}
