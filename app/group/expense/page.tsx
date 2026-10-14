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
      <div className="min-h-screen bg-[#f5f5f0] text-black p-6 flex flex-col items-center justify-center text-center">
        <h2 className="text-base font-black uppercase mb-2 font-mono">Group not found</h2>
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 text-xs font-black uppercase rounded-xl bg-[#ccff00] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]"
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
        receiptPath: existingExpense.receiptPath,
      }
    : undefined;

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-black pb-28 relative">
      <div className="max-w-xl mx-auto p-4 sm:p-5 space-y-4">
        {/* Top Header Bar matching Stitch Image 2 */}
        <header className="flex items-center justify-between pt-1">
          <Link
            href={`/group?id=${groupId}`}
            className="w-10 h-10 rounded-lg border-2 border-black bg-white flex items-center justify-center text-black hover:bg-[#ffd600] transition active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_0px_#000]"
          >
            <svg className="w-4 h-4 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>

          <div className="flex items-center gap-2">
            <span className="w-6 h-6 bg-[#ccff00] border-2 border-black flex items-center justify-center font-mono font-black text-xs shadow-[1px_1px_0px_0px_#000]">
              C/
            </span>
            <h1 className="text-base sm:text-lg font-black tracking-tight uppercase font-mono">
              {existingExpense ? 'EDIT EXPENSE' : 'NEW EXPENSE'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <SyncBadge manager={repo.syncManager} />
            <Link
              href="/settings"
              className="w-9 h-9 rounded-lg border-2 border-black bg-white shadow-[2px_2px_0px_0px_#000] flex items-center justify-center overflow-hidden font-mono font-bold text-xs"
            >
              {authState.profile?.avatarUrl ? (
                <img src={authState.profile.avatarUrl} alt="User" className="w-full h-full object-cover" />
              ) : (
                '👤'
              )}
            </Link>
          </div>
        </header>

        {/* Group Sub-Chips */}
        <div className="flex items-center gap-2 pt-1">
          <div className="px-3 py-1 rounded-md border-2 border-black bg-white text-xs font-mono font-black uppercase shadow-[1.5px_1.5px_0px_0px_#000] flex items-center gap-1.5">
            <span>👥</span>
            <span className="truncate">{group.name}</span>
          </div>
          <div className="px-3 py-1 rounded-md border-2 border-black bg-white text-xs font-mono font-bold uppercase shadow-[1.5px_1.5px_0px_0px_#000] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-black" />
            <span>LEDGER READY</span>
          </div>
        </div>

        {/* Conflict Warning Banner */}
        {isConflict && (
          <div className="p-3.5 rounded-xl bg-[#ffd600] border-2 border-black shadow-[3px_3px_0px_0px_#000] flex items-center justify-between gap-3 text-black">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="text-xs font-black uppercase font-mono">
                  Version Conflict (409)
                </p>
                <p className="text-[11px] font-medium">
                  Remote server has a newer version of this expense.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowConflictSheet(true)}
              className="px-3 py-1.5 rounded-lg bg-black text-white text-xs font-mono font-black shadow-sm transition shrink-0 active:scale-95"
            >
              RESOLVE
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
    <Suspense fallback={<div className="p-8 text-center text-xs font-mono font-black uppercase text-black">Loading form...</div>}>
      <ExpenseEntryContent />
    </Suspense>
  );
}
