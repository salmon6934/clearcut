import { describe, it, expect } from 'vitest';
import { DomainRepository } from '../../lib/data/repository';
import { LocalStore } from '../../lib/data/local-store';
import { MutationQueue } from '../../lib/data/queue';
import { LocalStorageAdapter, MemoryStorage } from '../../lib/data/storage-adapter';
import { selectGroupLedger } from '../../lib/data/selectors';

describe('T-2.3: Deletion, Restore & Settlement Undo (Soft-Delete & Invariant Conservation)', () => {
  const createEnv = () => {
    const adapter = new LocalStorageAdapter('test_user', new MemoryStorage());
    const store = new LocalStore(adapter);
    const queue = new MutationQueue(adapter);
    const repo = new DomainRepository(store, queue);

    const { group, member: alice } = repo.createGroup(
      { name: 'Roadtrip', type: 'trip', currency: 'INR' },
      'user_alice',
      'Alice'
    );
    const bob = repo.addPlaceholderMember(group.id, 'Bob');

    return { adapter, store, queue, repo, group, alice, bob };
  };

  it('T-2.3.1: soft-deletes an expense, hides it from active list, enqueues DELETE_EXPENSE, and updates balances', () => {
    const { repo, store, queue, group, alice, bob } = createEnv();

    const expense = repo.addExpense(
      {
        groupId: group.id,
        title: 'Gas / Fuel',
        amountMinor: 400000,
        currency: 'INR',
        splitType: 'equal',
        splits: [
          { memberId: alice.id, paidMinor: 400000, owedMinor: 200000 },
          { memberId: bob.id, paidMinor: 0, owedMinor: 200000 },
        ],
      },
      'user_alice'
    );

    // Initial balances: Alice +2000, Bob -2000
    let ledger = selectGroupLedger(store, group.id);
    expect(ledger.balances.get(alice.id)).toBe(200000);
    expect(ledger.balances.get(bob.id)).toBe(-200000);

    // Soft delete expense
    repo.deleteExpense(expense.id);

    // Active expenses list does not contain it
    const active = store.getGroupExpenses(group.id, false);
    expect(active.some((e) => e.id === expense.id)).toBe(false);

    // Deleted expenses list contains it
    const all = store.getGroupExpenses(group.id, true);
    const deletedExp = all.find((e) => e.id === expense.id);
    expect(deletedExp).toBeDefined();
    expect(deletedExp?.deletedAt).not.toBeNull();

    // Balances instantly recalculated to 0
    ledger = selectGroupLedger(store, group.id);
    expect(ledger.balances.get(alice.id)).toBe(0);
    expect(ledger.balances.get(bob.id)).toBe(0);

    // Offline delete compaction: cancels pending upsert from queue without network traffic
    expect(queue.getAllItems().filter((m) => m.entityId === expense.id)).toHaveLength(0);

    // Now test deleting an already-synced expense: enqueues DELETE_EXPENSE
    const syncedExpense = repo.addExpense(
      {
        groupId: group.id,
        title: 'Snacks',
        amountMinor: 20000,
        currency: 'INR',
        splitType: 'equal',
        splits: [
          { memberId: alice.id, paidMinor: 20000, owedMinor: 10000 },
          { memberId: bob.id, paidMinor: 0, owedMinor: 10000 },
        ],
      },
      'user_alice'
    );
    const upsertMut = queue.getAllItems().find((m) => m.entityId === syncedExpense.id);
    if (upsertMut) queue.markSynced(upsertMut.id);

    // Delete synced expense
    repo.deleteExpense(syncedExpense.id);

    // Mutation queue now has DELETE_EXPENSE for remote sync
    const deleteMutation = queue.getAllItems().find((m) => m.type === 'DELETE_EXPENSE');
    expect(deleteMutation).toBeDefined();
    expect(deleteMutation?.entityId).toBe(syncedExpense.id);
  });

  it('T-2.3.1: restores a soft-deleted expense, cancels pending delete in queue, and reinstates balances', () => {
    const { repo, store, queue, group, alice, bob } = createEnv();

    const expense = repo.addExpense(
      {
        groupId: group.id,
        title: 'Highway Toll',
        amountMinor: 100000,
        currency: 'INR',
        splitType: 'equal',
        splits: [
          { memberId: alice.id, paidMinor: 100000, owedMinor: 50000 },
          { memberId: bob.id, paidMinor: 0, owedMinor: 50000 },
        ],
      },
      'user_alice'
    );

    // Delete
    repo.deleteExpense(expense.id);
    expect(store.getGroupExpenses(group.id, false)).toHaveLength(0);

    // Restore (simulates 5-second undo toast tap)
    const restored = repo.restoreExpense(expense.id);
    expect(restored).not.toBeNull();
    expect(restored?.deletedAt).toBeNull();
    expect(restored?.version).toBe(expense.version + 1);

    // Active expenses list now includes it
    const active = store.getGroupExpenses(group.id, false);
    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe(expense.id);

    // Pending DELETE_EXPENSE was cancelled out of active queue
    const activeDeletes = queue.getAllItems().filter((m) => m.type === 'DELETE_EXPENSE');
    expect(activeDeletes).toHaveLength(0);

    // Balances reinstated
    const ledger = selectGroupLedger(store, group.id);
    expect(ledger.balances.get(alice.id)).toBe(50000);
    expect(ledger.balances.get(bob.id)).toBe(-50000);
  });

  it('T-2.3.2: records settlement and undoes it via deleteSettlement, reversing balances immediately', () => {
    const { repo, store, queue, group, alice, bob } = createEnv();

    // Alice paid 2000 for dinner, Bob owes 1000
    repo.addExpense(
      {
        groupId: group.id,
        title: 'Dinner',
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

    // Bob settles by paying Alice 1000
    const settlement = repo.addSettlement(
      {
        groupId: group.id,
        fromMemberId: bob.id,
        toMemberId: alice.id,
        amountMinor: 100000,
        method: 'upi',
      },
      'user_alice'
    );

    // Balances are settled (0)
    let ledger = selectGroupLedger(store, group.id);
    expect(ledger.balances.get(alice.id)).toBe(0);
    expect(ledger.balances.get(bob.id)).toBe(0);
    expect(ledger.suggestedPayments).toHaveLength(0);

    // Undo / delete settlement
    repo.deleteSettlement(settlement.id);

    // Settlement is soft-deleted
    const activeSettlements = store.getGroupSettlements(group.id, false);
    expect(activeSettlements).toHaveLength(0);

    const allSettlements = store.getGroupSettlements(group.id, true);
    expect(allSettlements[0]!.deletedAt).not.toBeNull();

    // Balances immediately reverse back to Bob owing Alice 1000
    ledger = selectGroupLedger(store, group.id);
    expect(ledger.balances.get(alice.id)).toBe(100000);
    expect(ledger.balances.get(bob.id)).toBe(-100000);
    expect(ledger.suggestedPayments).toHaveLength(1);

    // Offline delete: compaction cleanly cancels both offline mutations without network overhead
    expect(queue.getAllItems().filter((m) => m.entityId === settlement.id)).toHaveLength(0);

    // Now test deleting an already-synced settlement: enqueues DELETE_SETTLEMENT
    const syncedSettlement = repo.addSettlement(
      {
        groupId: group.id,
        fromMemberId: bob.id,
        toMemberId: alice.id,
        amountMinor: 50000,
        method: 'cash',
      },
      'user_alice'
    );
    // Mark its upsert mutation as already synced
    const upsertMut = queue.getAllItems().find((m) => m.entityId === syncedSettlement.id);
    if (upsertMut) queue.markSynced(upsertMut.id);

    // Delete synced settlement
    repo.deleteSettlement(syncedSettlement.id);

    // Now DELETE_SETTLEMENT is queued for remote replication
    const deleteMutation = queue.getAllItems().find((m) => m.type === 'DELETE_SETTLEMENT');
    expect(deleteMutation).toBeDefined();
    expect(deleteMutation?.entityId).toBe(syncedSettlement.id);
  });
});
