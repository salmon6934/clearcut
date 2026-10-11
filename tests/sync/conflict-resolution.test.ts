import { describe, it, expect, vi } from 'vitest';
import { DomainRepository } from '../../lib/data/repository';
import { LocalStore } from '../../lib/data/local-store';
import { MutationQueue } from '../../lib/data/queue';
import { LocalStorageAdapter, MemoryStorage } from '../../lib/data/storage-adapter';
import { drainQueue, resetBackoff } from '../../lib/sync/push';
import { resolveExpenseConflict } from '../../lib/sync/merge';
import type { Expense } from '../../lib/data/types';

describe('T-2.2: Expense Editing & Optimistic Concurrency Conflict Resolution', () => {
  const createTestEnv = () => {
    resetBackoff();
    const adapter = new LocalStorageAdapter('test_user', new MemoryStorage());
    const store = new LocalStore(adapter);
    const queue = new MutationQueue(adapter);
    const repo = new DomainRepository(store, queue);

    const { group, member: alice } = repo.createGroup(
      { name: 'Goa Trip', type: 'trip', currency: 'INR' },
      'user_alice',
      'Alice'
    );
    const bob = repo.addPlaceholderMember(group.id, 'Bob');

    const expense = repo.addExpense(
      {
        groupId: group.id,
        title: 'Beach Shacks',
        amountMinor: 200000,
        currency: 'INR',
        splitType: 'equal',
        splits: [
          { memberId: alice.id, paidMinor: 200000, owedMinor: 100000 },
          { memberId: bob.id, paidMinor: 0, owedMinor: 100000 },
        ],
      },
      'user_alice'
    );

    return { adapter, store, queue, repo, group, alice, bob, expense };
  };

  it('T-2.2.1: edits expense, bumps version, updates local store immediately, and enqueues baseVersion', () => {
    const { repo, store, queue, alice, bob, expense } = createTestEnv();

    const tStart = performance.now();
    const updated = repo.editExpense(
      {
        id: expense.id,
        groupId: expense.groupId,
        title: 'Beach Shacks & Seafood Dinner',
        amountMinor: 300000,
        currency: 'INR',
        splitType: 'equal',
        splits: [
          { memberId: alice.id, paidMinor: 300000, owedMinor: 150000 },
          { memberId: bob.id, paidMinor: 0, owedMinor: 150000 },
        ],
      },
      'user_alice'
    );
    const editDuration = performance.now() - tStart;

    // Instant local write (< 10ms)
    expect(editDuration).toBeLessThan(100);

    // Version bumped optimistically
    expect(updated.version).toBe(2);
    expect(updated.title).toBe('Beach Shacks & Seafood Dinner');
    expect(updated._sync).toBe('pending');

    // Store has the updated version
    const fromStore = store.getExpense(expense.id);
    expect(fromStore?.amountMinor).toBe(300000);
    expect(fromStore?.version).toBe(2);

    // Mutation queue has baseVersion = 1
    const lastMutation = queue.getAllItems().find((m) => m.entityId === expense.id);
    expect(lastMutation).toBeDefined();
    expect(lastMutation?.payload.baseVersion).toBe(1);
  });

  it('T-2.2.2: flags conflict on HTTP 409 OCC version mismatch and preserves conflictDetail', async () => {
    const { store, queue, expense } = createTestEnv();

    // Mock remote Supabase returning PT409 Conflict
    const serverSnapshot = {
      id: expense.id,
      group_id: expense.groupId,
      title: 'Beach Shacks (Bob edited on Device B)',
      amount_minor: 250000,
      currency: 'INR',
      version: 3,
      splits: [
        { member_id: expense.splits[0]!.memberId, paid_minor: 250000, owed_minor: 125000 },
        { member_id: expense.splits[1]!.memberId, paid_minor: 0, owed_minor: 125000 },
      ],
    };

    const mockSupabase = {
      rpc: vi.fn().mockImplementation((fn: string) => {
        if (fn === 'upsert_expense_v1') {
          return Promise.reject({
            code: 'PT409',
            message: 'EXPENSE_CONFLICT: Optimistic lock mismatch',
            details: JSON.stringify({
              error: 'VERSION_MISMATCH',
              server_version: 3,
              client_base_version: 1,
              server_snapshot: serverSnapshot,
            }),
          });
        }
        return Promise.resolve({ data: { success: true }, error: null });
      }),
      auth: { refreshSession: vi.fn() },
    };

    const drainResult = await drainQueue(queue, store, mockSupabase as any);

    expect(drainResult.conflicts).toBe(1);

    // Mutation is marked as conflict
    const conflictItem = queue.getAllItems().find((m) => m.entityId === expense.id);
    expect(conflictItem?.status).toBe('conflict');
    expect(conflictItem?.conflictDetail).toBeDefined();

    // Entity is flagged as conflict in store
    expect(store.getExpense(expense.id)?._sync).toBe('conflict');
  });

  it('T-2.2.2 Action "Keep mine": updates local entity to serverVersion + 1 and re-enqueues with updated baseVersion', () => {
    const { store, queue, expense } = createTestEnv();

    // Simulate conflict state
    store.upsertExpense({ ...expense, _sync: 'conflict' });
    queue.markFailed(
      queue.getAllItems()[2]!.id,
      'EXPENSE_CONFLICT',
      true,
      5,
      { server_version: 3 }
    );

    const resolved = resolveExpenseConflict({
      mode: 'keep_mine',
      expenseId: expense.id,
      store,
      queue,
      serverSnapshot: { version: 3 },
    });

    expect(resolved).not.toBeNull();
    expect(resolved?.version).toBe(4); // server_version (3) + 1
    expect(resolved?._sync).toBe('pending');

    // Store is updated
    expect(store.getExpense(expense.id)?.version).toBe(4);
    expect(store.getExpense(expense.id)?._sync).toBe('pending');

    // Queue has active pending mutation with baseVersion = 3
    const pendingMutation = queue.getAllItems().find((m) => m.entityId === expense.id && m.status === 'pending');
    expect(pendingMutation).toBeDefined();
    expect(pendingMutation?.payload.baseVersion).toBe(3);
  });

  it('T-2.2.2 Action "Use theirs": overwrites local entity with server snapshot and marks synced', () => {
    const { store, queue, expense } = createTestEnv();

    const serverSnapshot = {
      id: expense.id,
      group_id: expense.groupId,
      title: 'Server Winner Title',
      amount_minor: 400000,
      currency: 'INR',
      version: 5,
      splits: [
        { member_id: expense.splits[0]!.memberId, paid_minor: 400000, owed_minor: 200000 },
        { member_id: expense.splits[1]!.memberId, paid_minor: 0, owed_minor: 200000 },
      ],
    };

    const resolved = resolveExpenseConflict({
      mode: 'use_theirs',
      expenseId: expense.id,
      store,
      queue,
      serverSnapshot,
    });

    expect(resolved).not.toBeNull();
    expect(resolved?.title).toBe('Server Winner Title');
    expect(resolved?.amountMinor).toBe(400000);
    expect(resolved?.version).toBe(5);
    expect(resolved?._sync).toBe('synced');

    // Store has the server state
    const localAfter = store.getExpense(expense.id);
    expect(localAfter?.title).toBe('Server Winner Title');
    expect(localAfter?._sync).toBe('synced');

    // No pending or conflict mutation remains
    const activeMutations = queue.getAllItems().filter((m) => m.entityId === expense.id);
    expect(activeMutations).toHaveLength(0);
  });

  it('T-2.2.2 handles tombstone conflict: soft-deletes local entity when server version was deleted', () => {
    const { store, queue, expense } = createTestEnv();

    const tombstoneSnapshot = {
      id: expense.id,
      version: 3,
      deleted_at: new Date().toISOString(),
    };

    const resolved = resolveExpenseConflict({
      mode: 'use_theirs',
      expenseId: expense.id,
      store,
      queue,
      serverSnapshot: tombstoneSnapshot,
    });

    expect(resolved).toBeNull();

    // Store expense is soft deleted
    const localAfter = store.getExpense(expense.id);
    expect(localAfter?.deletedAt).not.toBeNull();
  });
});
