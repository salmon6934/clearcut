'use client';

// app/group/expense/page.tsx
// Neo-Brutalist Expense Creation and Edit Route Matching Stitch Design

import React, { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRepository, useGroup, useGroupMembers } from '../../../lib/data/hooks';
import { useAuth } from '../../../lib/auth';
import { ExpenseForm } from '../../../components/ExpenseForm';
import { ConflictResolutionSheet } from '../../../components/ConflictResolutionSheet';
import { SyncBadge } from '../../../components/SyncBadge';
import { resolveExpenseConflict } from '../../../lib/sync/merge';
import type { ExpenseDraft } from '../../../lib/data/types';

function ExpenseEntryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = searchParams.get('id') || '';
  const expenseId = searchParams.get('expenseId') || searchParams.get('edit') || undefined;

  const authState = useAuth();
  const currentUserId = authState.user?.id || 'local_user';
  const repo = useRepository(currentUserId);
  const group = useGroup(repo, groupId);
  const members = useGroupMembers(repo, groupId);

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
      <div className="min-h-screen bg-transparent text-[#432E22] p-6 flex flex-col items-center justify-center text-center">
        <h2 className="text-base font-bold text-[#432E22] mb-2">Group not found</h2>
        <button
          onClick={() => router.push('/')}
          className="px-5 py-2.5 text-xs font-bold rounded-full bg-[#543A2A] text-[#FAF6F0] hover:bg-[#432E20] shadow-sm transition active:scale-95 cursor-pointer"
        >
          Back to Groups
        </button>
      </div>
    );
  }

  const handleSave = (draft: ExpenseDraft) => {
    if (existingExpense) {
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
        receiptPath: existingExpense.receiptPath,
      }
    : undefined;

  return (
    <div className="min-h-screen bg-transparent text-[#432E22] pb-28 relative">
      <div className="max-w-xl mx-auto p-4 sm:p-5 space-y-4">
        {/* Top Header Bar */}
        <header className="flex items-center justify-between pt-1">
          <Link
            href={`/group?id=${groupId}`}
            className="w-10 h-10 rounded-full border border-[#E5D9CC] bg-white flex items-center justify-center text-[#543A2A] hover:bg-[#EFE4D6] transition active:scale-95 shadow-sm"
          >
            <svg className="w-4 h-4 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>

          <h1 className="text-base sm:text-lg font-bold tracking-tight text-[#432E22]">
            {existingExpense ? 'Edit Expense' : 'Add Expense'}
          </h1>

          <div className="flex items-center gap-2">
            <SyncBadge manager={repo.syncManager} />
          </div>
        </header>

        {/* Group Sub-Chips */}
        <div className="flex items-center gap-2 pt-1">
          <div className="px-3 py-1 rounded-full border border-[#E5D9CC] bg-white text-xs font-bold uppercase shadow-sm flex items-center gap-1.5 text-[#432E22]">
            <span>👥</span>
            <span className="truncate">{group.name}</span>
          </div>
        </div>

        {/* Conflict Warning Banner */}
        {isConflict && (
          <div className="p-4 rounded-2xl bg-[#FFF8EE] border border-[#ECD3B6] shadow-xs flex items-center justify-between gap-3 text-[#8C5E23]">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider">
                  Version Conflict (409)
                </p>
                <p className="text-xs font-medium text-[#8D7868]">
                  Remote server has a newer version of this expense.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowConflictSheet(true)}
              className="px-4 py-2 rounded-full bg-[#543A2A] text-[#FAF6F0] text-xs font-bold uppercase shadow-sm transition shrink-0 active:scale-95 cursor-pointer hover:bg-[#432E20]"
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
    <Suspense fallback={<div className="p-8 text-center text-xs font-bold text-[#8D7868]">Loading form...</div>}>
      <ExpenseEntryContent />
    </Suspense>
  );
}
