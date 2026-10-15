// tests/sync/lifecycle.test.ts
import { describe, it, expect, vi } from 'vitest';
import { SyncLifecycleManager } from '../../lib/sync/lifecycle';
import { MutationQueue } from '../../lib/data/queue';
import { LocalStore } from '../../lib/data/local-store';
import { LocalStorageAdapter, MemoryStorage } from '../../lib/data/storage-adapter';

describe('T-1.7.3: Sync Orchestrator & Lifecycle Triggers', () => {
  function setup() {
    const rawStorage = new MemoryStorage();
    const adapter = new LocalStorageAdapter('test_life_user', rawStorage);
    const store = new LocalStore(adapter);
    const queue = new MutationQueue(adapter);

    const mockSupabase = {
      rpc: vi.fn().mockImplementation((fn: string) => {
        if (fn === 'pull_changes_v1') {
          return Promise.resolve({
            data: { groups: [], members: [], expenses: [], settlements: [], has_more: false },
            error: null,
          });
        }
        return Promise.resolve({ data: {}, error: null });
      }),
      auth: { refreshSession: vi.fn() },
    };

    const manager = new SyncLifecycleManager(store, queue, adapter, mockSupabase as any);
    return { manager, store, queue, mockSupabase };
  }

  it('subscribes to status updates and accurately reports idle and pending states', () => {
    const { manager, queue } = setup();

    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'idle',
        pendingCount: 0,
        conflictCount: 0,
      })
    );

    // Enqueue an item -> pending count updates
    queue.enqueue('UPSERT_EXPENSE', 'exp-1', {});
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingCount: 1,
      })
    );

    unsubscribe();
  });

  it('executes push drain followed by pull merge when kick() is called', async () => {
    const { manager, queue, mockSupabase } = setup();

    queue.enqueue('UPSERT_EXPENSE', 'exp-1', {
      expense: {
        id: 'exp-1',
        groupId: 'g-1',
        title: 'Dinner',
        amountMinor: 5000,
        currency: 'INR',
        expenseDate: '2026-10-10',
        splitType: 'equal',
        splits: [],
        createdBy: 'u-1',
        version: 1,
      },
    });

    const snapshot = await manager.kick('manual_kick');

    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'upsert_expense_v1',
      expect.anything()
    );
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'pull_changes_v1',
      expect.anything()
    );
    expect(snapshot.status).toBe('idle');
    expect(snapshot.lastSyncedAt).not.toBeNull();
  });

  it('flags conflict state if items in dead letter queue have conflict status', () => {
    const { manager, queue } = setup();

    const m = queue.enqueue('UPSERT_EXPENSE', 'exp-conf', {});
    queue.markInflight(m.id);
    queue.markFailed(m.id, 'Version mismatch', true);

    const snapshot = manager.getState();
    expect(snapshot.status).toBe('conflict');
    expect(snapshot.conflictCount).toBe(1);
  });

  it('resetAndCleanSync clears store, queue, removes sync cursors, and triggers a full resync', async () => {
    const rawStorage = new MemoryStorage();
    const adapter = new LocalStorageAdapter('test_life_user', rawStorage);
    const store = new LocalStore(adapter);
    const queue = new MutationQueue(adapter);

    const mockSupabase = {
      rpc: vi.fn().mockImplementation((fn: string) => {
        if (fn === 'pull_changes_v1') {
          return Promise.resolve({
            data: { groups: [], members: [], expenses: [], settlements: [], has_more: false },
            error: null,
          });
        }
        return Promise.resolve({ data: {}, error: null });
      }),
      auth: { refreshSession: vi.fn() },
    };

    const manager = new SyncLifecycleManager(store, queue, adapter, mockSupabase as any);

    // Populate store, queue, and cursor
    store.upsertGroup({ id: 'grp-1', name: 'Trip', type: 'trip', currency: 'INR', createdBy: 'u-1', createdAt: '2026-01-01', updatedAt: '2026-01-01', version: 1, _sync: 'synced' });
    queue.enqueue('UPSERT_EXPENSE', 'exp-1', {});
    adapter.setItem('sync:cursors', JSON.stringify({ groups: '2026-01-01T00:00:00Z' }));

    expect(store.getAllGroups(true).length).toBe(1);
    expect(queue.getPendingCount()).toBe(1);
    expect(adapter.getItem('sync:cursors')).toBeTruthy();

    // Call resetAndCleanSync
    await manager.resetAndCleanSync();

    expect(store.getAllGroups(true).length).toBe(0);
    expect(queue.getPendingCount()).toBe(0);
    expect(JSON.parse(adapter.getItem('sync:cursors') || '{}')).toEqual({});
    // Verify pull was called
    expect(mockSupabase.rpc).toHaveBeenCalledWith('pull_changes_v1', expect.anything());
  });
});
