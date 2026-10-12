'use client';

// app/settings/sync/page.tsx
// Sync Diagnostics & Conflict Resolution Screen in Neo-Brutalist Style

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
    <div className="min-h-screen bg-[#f5f5f0] text-black p-4 max-w-xl mx-auto font-sans">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pt-2">
        <Link
          href="/"
          className="w-10 h-10 rounded-lg border-2 border-black bg-white flex items-center justify-center font-black text-black hover:bg-[#ffd600] shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition"
        >
          ←
        </Link>
        <h1 className="text-sm font-mono font-black uppercase tracking-wider">
          SYNC DIAGNOSTICS
        </h1>
        <div className="w-10"></div>
      </div>

      {message && (
        <div className="mb-4 p-3 rounded-lg text-xs font-mono font-black bg-[#ffd600] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]">
          {message}
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-12 px-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_0px_#000]">
          <div className="w-10 h-10 rounded-lg border-2 border-black bg-[#ccff00] text-black flex items-center justify-center mx-auto mb-3 font-mono font-black text-lg shadow-[2px_2px_0px_0px_#000]">
            ✓
          </div>
          <h2 className="text-sm font-mono font-black uppercase mb-1">ALL SYNCED!</h2>
          <p className="text-xs font-mono text-black/60">
            No conflicts or dead-letter mutations in your local queue.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-xs font-mono font-black text-black uppercase tracking-wider">
            PENDING RESOLUTION ({items.length})
          </div>

          {items.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_0px_#000] space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span
                    className={`inline-block px-2 py-0.5 text-[10px] font-mono font-black uppercase rounded border border-black ${
                      item.status === 'conflict'
                        ? 'bg-[#ffd600] text-black'
                        : 'bg-[#ff8a80] text-black'
                    }`}
                  >
                    {item.status.toUpperCase()}
                  </span>
                  <span className="ml-2 text-xs font-mono font-bold text-black/70">
                    {item.type}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-black/60">
                  {new Date(item.updatedAt).toLocaleTimeString()}
                </span>
              </div>

              {item.lastError && (
                <div className="text-xs text-black font-mono bg-[#f0f0ea] p-2.5 rounded border border-black break-all">
                  {item.lastError}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                {item.status === 'conflict' && item.type === 'UPSERT_EXPENSE' ? (
                  <button
                    onClick={() => handleOpenConflict(item)}
                    className="flex-1 px-3 py-2 text-xs font-mono font-black uppercase rounded-lg border-2 border-black bg-[#ffd600] text-black shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition"
                  >
                    RESOLVE CONFLICT
                  </button>
                ) : (
                  <button
                    onClick={() => handleRetryItem(item)}
                    disabled={isRetrying}
                    className="flex-1 px-3 py-2 text-xs font-mono font-black uppercase rounded-lg border-2 border-black bg-[#ccff00] text-black shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition disabled:opacity-50"
                  >
                    {isRetrying ? 'RETRYING...' : 'RETRY PUSH'}
                  </button>
                )}

                <button
                  onClick={() => handleDiscardItem(item.id)}
                  disabled={isRetrying}
                  className="px-3 py-2 text-xs font-mono font-black uppercase rounded-lg border-2 border-black bg-white text-black hover:bg-[#ff8a80] shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition"
                >
                  DISCARD
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
    <Suspense fallback={<div className="p-4 text-xs font-mono font-black uppercase text-black">Loading diagnostics...</div>}>
      <SyncDiagnosticsContent />
    </Suspense>
  );
}
