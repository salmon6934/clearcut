'use client';

// app/settings/sync/page.tsx
// Sync Diagnostics & Conflict Resolution Screen in Neo-Brutalist Style

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { LocalStorageAdapter } from '../../../lib/data/storage-adapter';
import { MutationQueue, MutationRecord } from '../../../lib/data/queue';
import { LocalStore } from '../../../lib/data/local-store';
import { drainQueue, resetBackoff } from '../../../lib/sync/push';
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
      resetBackoff();
      const res = await drainQueue(queue, store, supabase, true);
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

  const handleDiscardAll = async () => {
    await haptics.tap();
    const adapter = new LocalStorageAdapter();
    const queue = new MutationQueue(adapter);
    for (const item of items) {
      queue.clearDeadLetter(item.id);
    }
    setMessage('All failed items discarded from queue.');
    loadItems();
  };

  return (
    <div className="min-h-screen bg-transparent text-[#432E22] p-4 max-w-xl mx-auto font-sans">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pt-2">
        <Link
          href="/settings"
          className="w-10 h-10 rounded-full border border-[#E5D9CC] bg-[#FAF6F0] flex items-center justify-center text-[#543A2A] hover:bg-[#EFE4D6] shadow-sm active:scale-95 transition cursor-pointer"
        >
          ←
        </Link>
        <h1 className="text-sm sm:text-base font-bold tracking-tight text-[#432E22]">
          Sync Diagnostics
        </h1>
        <div className="w-10"></div>
      </div>

      {message && (
        <div className="mb-4 p-3.5 rounded-2xl text-xs font-semibold bg-[#FAF0E6] text-[#8C5E23] border border-[#ECD3B6] shadow-xs">
          {message}
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-12 px-6 rounded-3xl border border-[#E5D9CC] bg-white shadow-sm">
          <div className="w-12 h-12 rounded-2xl border border-[#C5D9BE] bg-[#E8F0E4] text-[#2E4226] flex items-center justify-center mx-auto mb-3 text-xl font-bold">
            ✓
          </div>
          <h2 className="text-base font-bold text-[#432E22] mb-1">All Synced!</h2>
          <p className="text-xs text-[#8D7868] font-medium">
            No conflicts or dead-letter mutations in your local queue.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-xs font-bold text-[#8D7868] uppercase tracking-wider flex items-center justify-between">
            <span>Pending Resolution ({items.length})</span>
            <button
              onClick={handleDiscardAll}
              className="text-xs font-bold text-[#A83232] px-3 py-1 rounded-full bg-[#FCE8E6] border border-[#F5C2C0] hover:bg-[#F8D8D5] shadow-xs active:scale-95 transition cursor-pointer"
            >
              Discard All
            </button>
          </div>

          {items.map((item) => (
            <div
              key={item.id}
              className="p-4 sm:p-5 rounded-3xl border border-[#E5D9CC] bg-white shadow-sm space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span
                    className={`inline-block px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full border ${
                      item.status === 'conflict'
                        ? 'bg-[#FAF0E6] text-[#8C5E23] border-[#ECD3B6]'
                        : 'bg-[#FCE8E6] text-[#A83232] border-[#F5C2C0]'
                    }`}
                  >
                    {item.status.toUpperCase()}
                  </span>
                  <span className="ml-2 text-xs font-semibold text-[#8D7868]">
                    {item.type}
                  </span>
                </div>
                <span className="text-[10px] text-[#8D7868] font-medium">
                  {new Date(item.updatedAt).toLocaleTimeString()}
                </span>
              </div>

              {item.lastError && (
                <div className="text-xs text-[#432E22] bg-[#FAF6F0] p-3 rounded-2xl border border-[#E5D9CC] break-all font-mono">
                  {item.lastError}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                {item.status === 'conflict' && item.type === 'UPSERT_EXPENSE' ? (
                  <button
                    onClick={() => handleOpenConflict(item)}
                    className="flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-full bg-[#FAF0E6] text-[#8C5E23] border border-[#ECD3B6] hover:bg-[#F4E4D0] shadow-xs active:scale-95 transition cursor-pointer"
                  >
                    Resolve Conflict
                  </button>
                ) : (
                  <button
                    onClick={() => handleRetryItem(item)}
                    disabled={isRetrying}
                    className="flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-full bg-[#543A2A] text-[#FAF6F0] hover:bg-[#432E20] shadow-sm active:scale-95 transition disabled:opacity-50 cursor-pointer"
                  >
                    {isRetrying ? 'Retrying...' : 'Retry Push'}
                  </button>
                )}

                <button
                  onClick={() => handleDiscardItem(item.id)}
                  disabled={isRetrying}
                  className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-full border border-[#F5C2C0] bg-[#FCE8E6] text-[#A83232] hover:bg-[#F8D8D5] shadow-xs active:scale-95 transition cursor-pointer"
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
    <Suspense fallback={<div className="p-4 text-xs font-bold text-[#8D7868]">Loading diagnostics...</div>}>
      <SyncDiagnosticsContent />
    </Suspense>
  );
}
