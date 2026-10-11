// tests/data/repository.test.ts
import { describe, it, expect, vi } from 'vitest';
import { DomainRepository } from '../../lib/data/repository';
import { LocalStore } from '../../lib/data/local-store';
import { MutationQueue } from '../../lib/data/queue';
import { LocalStorageAdapter, MemoryStorage } from '../../lib/data/storage-adapter';
import type { ExpenseDraft, SettlementDraft } from '../../lib/data/types';

describe('T-1.8.1: Repository Command Layer', () => {
  function setup() {
    const rawStorage = new MemoryStorage();
    const adapter = new LocalStorageAdapter('repo_user', rawStorage);
    const store = new LocalStore(adapter);
    const queue = new MutationQueue(adapter);
    const mockSyncManager = {
      kick: vi.fn().mockResolvedValue({}),
    };
    const repo = new DomainRepository(store, queue, mockSyncManager as any);
    return { repo, store, queue, mockSyncManager };
  }

  it('creates a group synchronously in < 10ms with owner member and enqueues CREATE_GROUP', () => {
    const { repo, store, queue, mockSyncManager } = setup();

    const t0 = performance.now();
    const { group, member } = repo.createGroup(
      { name: 'Roadtrip 2026', type: 'trip', currency: 'INR' },
      'user-harsh',
      'Harsh'
    );
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(10);
    expect(group.name).toBe('Roadtrip 2026');
    expect(group._sync).toBe('pending');
    expect(member.displayName).toBe('Harsh');
    expect(member.role).toBe('owner');

    // In local store immediately
    expect(store.getGroup(group.id)).toEqual(group);
    expect(store.getMember(member.id)).toEqual(member);

    // In mutation queue
    expect(queue.getPendingCount()).toBe(1);
    expect(queue.peekNextPending()?.type).toBe('CREATE_GROUP');

    // Triggered sync kick in background
    expect(mockSyncManager.kick).toHaveBeenCalledWith('create_group');
  });

  it('adds an expense synchronously, validates Invariant I2, and enqueues UPSERT_EXPENSE', () => {
    const { repo, store, queue, mockSyncManager } = setup();

    const draft: ExpenseDraft = {
      groupId: 'g-1',
      title: 'Groceries',
      amountMinor: 100000,
      currency: 'INR',
      splitType: 'equal',
      splits: [
        { memberId: 'm-1', paidMinor: 100000, owedMinor: 50000 },
        { memberId: 'm-2', paidMinor: 0, owedMinor: 50000 },
      ],
    };

    const expense = repo.addExpense(draft, 'user-harsh');
    expect(expense.title).toBe('Groceries');
    expect(expense._sync).toBe('pending');
    expect(expense.version).toBe(1);

    expect(store.getExpense(expense.id)).toEqual(expense);
    expect(queue.getPendingCount()).toBe(1);
    expect(queue.peekNextPending()?.type).toBe('UPSERT_EXPENSE');
    expect(mockSyncManager.kick).toHaveBeenCalledWith('add_expense');
  });

  it('throws validation error if expense violates Invariant I2 without writing to store', () => {
    const { repo, store, queue } = setup();

    const badDraft: ExpenseDraft = {
      groupId: 'g-1',
      title: 'Broken math',
      amountMinor: 100000,
      currency: 'INR',
      splitType: 'equal',
      splits: [
        { memberId: 'm-1', paidMinor: 100000, owedMinor: 40000 }, // sum owed = 40,000 != 100,000!
      ],
    };

    expect(() => repo.addExpense(badDraft, 'user-harsh')).toThrow();
    expect(store.getGroupExpenses('g-1')).toHaveLength(0);
    expect(queue.getPendingCount()).toBe(0);
  });

  it('edits an existing expense with optimistic version bump and enqueues update', () => {
    const { repo, store, queue } = setup();

    const exp = repo.addExpense(
      {
        groupId: 'g-1',
        title: 'Original Title',
        amountMinor: 2000,
        currency: 'INR',
        splitType: 'equal',
        splits: [{ memberId: 'm-1', paidMinor: 2000, owedMinor: 2000 }],
      },
      'user-harsh'
    );

    const edited = repo.editExpense(
      {
        id: exp.id,
        groupId: 'g-1',
        title: 'Updated Title',
        amountMinor: 2000,
        currency: 'INR',
        splitType: 'equal',
        splits: [{ memberId: 'm-1', paidMinor: 2000, owedMinor: 2000 }],
      },
      'user-harsh'
    );

    expect(edited.version).toBe(2);
    expect(edited.title).toBe('Updated Title');
    expect(store.getExpense(exp.id)?.title).toBe('Updated Title');
  });

  it('soft deletes an expense and enqueues DELETE_EXPENSE', () => {
    const { repo, store, queue, mockSyncManager } = setup();

    const exp = repo.addExpense(
      {
        groupId: 'g-1',
        title: 'Delete Me',
        amountMinor: 2000,
        currency: 'INR',
        splitType: 'equal',
        splits: [{ memberId: 'm-1', paidMinor: 2000, owedMinor: 2000 }],
      },
      'user-harsh'
    );

    repo.deleteExpense(exp.id);
    expect(store.getGroupExpenses('g-1', false)).toHaveLength(0);
    expect(store.getExpense(exp.id)?.deletedAt).toBeDefined();
    expect(mockSyncManager.kick).toHaveBeenCalledWith('delete_expense');
  });

  it('adds and deletes settlement transactions with validation', () => {
    const { repo, store, queue } = setup();

    const draft: SettlementDraft = {
      groupId: 'g-1',
      fromMemberId: 'm-1',
      toMemberId: 'm-2',
      amountMinor: 50000,
      method: 'upi',
      note: 'GPay payment',
    };

    const settlement = repo.addSettlement(draft, 'user-harsh');
    expect(settlement.amountMinor).toBe(50000);
    expect(settlement.method).toBe('upi');
    expect(store.getSettlement(settlement.id)).toEqual(settlement);

    // Cannot settle with self
    expect(() =>
      repo.addSettlement({ ...draft, toMemberId: 'm-1' }, 'user-harsh')
    ).toThrow();

    repo.deleteSettlement(settlement.id);
    expect(store.getGroupSettlements('g-1', false)).toHaveLength(0);
  });

  it('adds placeholder member and enforces unique names within group', () => {
    const { repo, store, queue } = setup();

    const m1 = repo.addPlaceholderMember('g-1', 'Charlie');
    expect(m1.displayName).toBe('Charlie');
    expect(m1.userId).toBeNull();
    expect(store.getMember(m1.id)).toEqual(m1);

    // Duplicate name within same group throws error
    expect(() => repo.addPlaceholderMember('g-1', 'charlie')).toThrow();
  });
});
