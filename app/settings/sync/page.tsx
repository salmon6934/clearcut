'use client';

// app/settings/sync/page.tsx
// Sync Diagnostics & Conflict Resolution Screen

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { LocalStorageAdapter } from '../../../lib/data/storage-adapter';
import { MutationQueue, MutationRecord } from '../../../lib/data/queue';
import { LocalStore } from '../../../lib/data/local-store';
import { drainQueue } from '../../../lib/sync/push';
import { resolveExpenseConflict } from '../../../lib/sync/merge';
import { supabase } from '../../../lib/supabase';
import { haptics } from '../../../lib/native/haptics';
import { ConflictResolutionSheet } from '../../../components/ConflictResolutionSheet';
import type { Expense, Member } from '../../../lib/data/types';

function SyncDiagnosticsContent() {
  const [items, setItems] = useState<MutationRecord[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Conflict modal state
  const [activeConflictItem, setActiveConflictItem] = useState<MutationRecord | null>(null);
  const [conflictExpense, setConflictExpense] = useState<Expense | null>(null);
  const [conflictMembers, setConflictMembers] = useState<Member[]>([]);

  const loadItems = () => {
    const adapter = new LocalStorageAdapter();
    const queue = new MutationQueue(adapter);
    setItems(queue.getAllItems().filter((m) => m.status === 'dead' || m.status === 'conflict'));
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleOpenConflict = (item: MutationRecord) => {
    const adapter = new LocalStorageAdapter();
    const store = new LocalStore(adapter);
    const exp = store.getExpense(item.entityId);
    if (exp) {
      setConflictExpense(exp);
      setConflictMembers(store.getGroupMembers(exp.groupId));
      setActiveConflictItem(item);
    }
  };

  const handleKeepMine = () => {
    if (!activeConflictItem || !conflictExpense) return;
    const adapter = new LocalStorageAdapter();
    const store = new LocalStore(adapter);
    const queue = new MutationQueue(adapter);

    resolveExpenseConflict({
      mode: 'keep_mine',
      expenseId: conflictExpense.id,
      store,
      queue,
      serverSnapshot: activeConflictItem.conflictDetail?.server_snapshot || activeConflictItem.conflictDetail,
    });

    setMessage('Changes kept! Marked as pending and queued for next sync.');
    setActiveConflictItem(null);
    setConflictExpense(null);
    loadItems();
  };

  const handleUseTheirs = () => {
    if (!activeConflictItem || !conflictExpense) return;
    const adapter = new LocalStorageAdapter();
    const store = new LocalStore(adapter);
    const queue = new MutationQueue(adapter);

    resolveExpenseConflict({
      mode: 'use_theirs',
      expenseId: conflictExpense.id,
      store,
      queue,
      serverSnapshot: activeConflictItem.conflictDetail?.server_snapshot || activeConflictItem.conflictDetail,
    });

    setMessage('Server version accepted and local entity updated.');
    setActiveConflictItem(null);
    setConflictExpense(null);
    loadItems();
  };

  const handleRetryItem = async (item: MutationRecord) => {
    await haptics.tap();
    const adapter = new LocalStorageAdapter();
    const queue = new MutationQueue(adapter);
    const store = new LocalStore(adapter);

    // Reset status back to pending so it can be drained
    queue.markFailed(item.id, 'Manual retry requested', false, 10);
    setIsRetrying(true);
    setMessage(null);

    try {
      const res = await drainQueue(queue, store, supabase);
      if (res.synced > 0) {
        setMessage('Mutation successfully synchronized!');
      } else if (res.conflicts > 0) {
        setMessage('Item still in conflict with remote server.');
      } else if (res.dead > 0) {
        setMessage('Item failed server validation.');
      }
    } catch (err: any) {
      setMessage(`Retry failed: ${err.message}`);
    } finally {
      setIsRetrying(false);
      loadItems();
    }
  };

  const handleDiscardItem = async (id: string) => {
    await haptics.tap();
    const adapter = new LocalStorageAdapter();
    const queue = new MutationQueue(adapter);
    queue.clearDeadLetter(id);
    setMessage('Item discarded from queue.');
    loadItems();
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-4 max-w-xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pt-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>
        <h1 className="text-lg font-semibold">Sync Diagnostics</h1>
        <div className="w-12"></div>
      </div>

      {message && (
        <div className="mb-4 p-3 rounded-lg text-sm bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          {message}
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-16 px-4">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-base font-medium mb-1">All clear!</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            No conflicts or failed mutations found in your local queue.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            Pending Resolution ({items.length})
          </div>

          {items.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <span
                    className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${
                      item.status === 'conflict'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {item.status.toUpperCase()}
                  </span>
                  <span className="ml-2 text-xs font-mono text-zinc-400">
                    {item.type}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-400">
                  {new Date(item.updatedAt).toLocaleTimeString()}
                </span>
              </div>

              {item.lastError && (
                <div className="text-xs text-zinc-600 dark:text-zinc-300 font-mono bg-zinc-100 dark:bg-zinc-800/60 p-2 rounded mb-3 break-all">
                  {item.lastError}
                </div>
              )}

              <div className="flex items-center gap-2">
                {item.status === 'conflict' && item.type === 'UPSERT_EXPENSE' ? (
                  <button
                    onClick={() => handleOpenConflict(item)}
                    className="flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors"
                  >
                    Resolve Conflict
                  </button>
                ) : (
                  <button
                    onClick={() => handleRetryItem(item)}
                    disabled={isRetrying}
                    className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {isRetrying ? 'Retrying...' : 'Retry Push'}
                  </button>
                )}

                <button
                  onClick={() => handleDiscardItem(item.id)}
                  disabled={isRetrying}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-rose-600 dark:text-rose-400"
                >
                  Discard
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Conflict Resolution Modal */}
      {conflictExpense && activeConflictItem && (
        <ConflictResolutionSheet
          isOpen={true}
          onClose={() => {
            setActiveConflictItem(null);
            setConflictExpense(null);
          }}
          localExpense={conflictExpense}
          serverExpense={activeConflictItem.conflictDetail?.server_snapshot || activeConflictItem.conflictDetail}
          members={conflictMembers}
          onKeepMine={handleKeepMine}
          onUseTheirs={handleUseTheirs}
        />
      )}
    </div>
  );
}

export default function SyncDiagnosticsPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-zinc-500">Loading diagnostics...</div>}>
      <SyncDiagnosticsContent />
    </Suspense>
  );
}
