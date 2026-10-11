// tests/data/store.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MemoryStorage, LocalStorageAdapter } from '../../lib/data/storage-adapter';
import { LocalStore } from '../../lib/data/local-store';
import {
  selectGroup,
  selectGroupExpenses,
  selectGroupMembers,
  selectGroupLedger,
  selectDashboardTotals,
} from '../../lib/data/selectors';
import type { Group, Member, Expense, Settlement } from '../../lib/data/types';

describe('T-1.6.2: LocalStore Event-Emitter & Reactive Selectors', () => {
  function createTestStore(userId = 'test_user') {
    const rawStorage = new MemoryStorage();
    const adapter = new LocalStorageAdapter(userId, rawStorage);
    return new LocalStore(adapter);
  }

  it('updates state synchronously in < 10ms and notifies subscribers', () => {
    const store = createTestStore();
    const subscriber = vi.fn();
    const unsubscribe = store.subscribe(subscriber);

    const group: Group = {
      id: 'g-1',
      name: 'Weekend Goa Trip',
      type: 'trip',
      currency: 'INR',
      version: 1,
    };

    const tStart = performance.now();
    store.upsertGroup(group);
    const durationMs = performance.now() - tStart;

    expect(durationMs).toBeLessThan(10);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(selectGroup(store, 'g-1')).toEqual(group);
    expect(store.getRevision()).toBe(1);

    unsubscribe();
  });

  it('manages members, expenses, and settlements with soft delete', () => {
    const store = createTestStore();

    const m1: Member = {
      id: 'm-1',
      groupId: 'g-1',
      userId: 'u-1',
      displayName: 'Alice',
      role: 'owner',
    };
    const m2: Member = {
      id: 'm-2',
      groupId: 'g-1',
      userId: 'u-2',
      displayName: 'Bob',
      role: 'member',
    };
    store.upsertMembers([m1, m2]);
    expect(selectGroupMembers(store, 'g-1')).toHaveLength(2);

    const expense: Expense = {
      id: 'e-1',
      groupId: 'g-1',
      title: 'Dinner',
      amountMinor: 200000,
      currency: 'INR',
      expenseDate: '2026-10-10T20:00:00Z',
      splitType: 'equal',
      splits: [
        { memberId: 'm-1', paidMinor: 200000, owedMinor: 100000 },
        { memberId: 'm-2', paidMinor: 0, owedMinor: 100000 },
      ],
      createdBy: 'u-1',
      version: 1,
    };

    store.upsertExpense(expense);
    expect(selectGroupExpenses(store, 'g-1')).toHaveLength(1);

    // Soft delete expense
    store.softDeleteExpense('e-1');
    expect(selectGroupExpenses(store, 'g-1', false)).toHaveLength(0);
    expect(selectGroupExpenses(store, 'g-1', true)).toHaveLength(1);
  });

  it('memoizes selectGroupLedger based on store revision', () => {
    const store = createTestStore();

    const group: Group = {
      id: 'g-1',
      name: 'Roommates',
      type: 'home',
      currency: 'INR',
      version: 1,
    };
    store.upsertGroup(group);

    const m1: Member = { id: 'm-1', groupId: 'g-1', userId: 'u-1', displayName: 'A', role: 'owner' };
    const m2: Member = { id: 'm-2', groupId: 'g-1', userId: 'u-2', displayName: 'B', role: 'member' };
    store.upsertMembers([m1, m2]);

    const expense: Expense = {
      id: 'e-1',
      groupId: 'g-1',
      title: 'Wifi',
      amountMinor: 100000,
      currency: 'INR',
      expenseDate: '2026-10-10T10:00:00Z',
      splitType: 'equal',
      splits: [
        { memberId: 'm-1', paidMinor: 100000, owedMinor: 50000 },
        { memberId: 'm-2', paidMinor: 0, owedMinor: 50000 },
      ],
      createdBy: 'u-1',
      version: 1,
    };
    store.upsertExpense(expense);

    const ledger1 = selectGroupLedger(store, 'g-1');
    expect(ledger1.balances.get('m-1')).toBe(50000);
    expect(ledger1.balances.get('m-2')).toBe(-50000);
    expect(ledger1.suggestedPayments).toEqual([
      { fromMemberId: 'm-2', toMemberId: 'm-1', amountMinor: 50000, currency: 'INR' },
    ]);

    // Second call with same revision returns the identical cached reference
    const ledger2 = selectGroupLedger(store, 'g-1');
    expect(ledger2).toBe(ledger1);

    // When a settlement is recorded, revision increments and cache invalidates
    const settlement: Settlement = {
      id: 's-1',
      groupId: 'g-1',
      fromMemberId: 'm-2',
      toMemberId: 'm-1',
      amountMinor: 50000,
      settledOn: '2026-10-10T12:00:00Z',
    };
    store.upsertSettlement(settlement);

    const ledger3 = selectGroupLedger(store, 'g-1');
    expect(ledger3).not.toBe(ledger1);
    expect(ledger3.balances.get('m-1')).toBe(0);
    expect(ledger3.balances.get('m-2')).toBe(0);
    expect(ledger3.suggestedPayments).toHaveLength(0);
  });

  it('selectDashboardTotals aggregates net balances across multiple groups', () => {
    const store = createTestStore('user-alice');

    // Group 1: Alice is owed 30,000 INR
    store.upsertGroup({ id: 'g-1', name: 'Trip', type: 'trip', currency: 'INR', version: 1 });
    store.upsertMembers([
      { id: 'm-a1', groupId: 'g-1', userId: 'user-alice', displayName: 'Alice', role: 'owner' },
      { id: 'm-b1', groupId: 'g-1', userId: 'user-bob', displayName: 'Bob', role: 'member' },
    ]);
    store.upsertExpense({
      id: 'e-1',
      groupId: 'g-1',
      title: 'Cab',
      amountMinor: 60000,
      currency: 'INR',
      expenseDate: '2026-10-10',
      splitType: 'equal',
      splits: [
        { memberId: 'm-a1', paidMinor: 60000, owedMinor: 30000 },
        { memberId: 'm-b1', paidMinor: 0, owedMinor: 30000 },
      ],
      createdBy: 'user-alice',
      version: 1,
    });

    // Group 2: Alice owes 10,000 INR
    store.upsertGroup({ id: 'g-2', name: 'Flat', type: 'home', currency: 'INR', version: 1 });
    store.upsertMembers([
      { id: 'm-a2', groupId: 'g-2', userId: 'user-alice', displayName: 'Alice', role: 'member' },
      { id: 'm-c2', groupId: 'g-2', userId: 'user-charlie', displayName: 'Charlie', role: 'owner' },
    ]);
    store.upsertExpense({
      id: 'e-2',
      groupId: 'g-2',
      title: 'Electricity',
      amountMinor: 20000,
      currency: 'INR',
      expenseDate: '2026-10-10',
      splitType: 'equal',
      splits: [
        { memberId: 'm-c2', paidMinor: 20000, owedMinor: 10000 },
        { memberId: 'm-a2', paidMinor: 0, owedMinor: 10000 },
      ],
      createdBy: 'user-charlie',
      version: 1,
    });

    const totals = selectDashboardTotals(store, 'user-alice');
    // Net: +30000 in g1, -10000 in g2 => Net +20000 INR
    expect(totals.netPerCurrency['INR']).toBe(20000);
    expect(totals.totalOwedToYouByCurrency['INR']).toBe(30000);
    expect(totals.totalYouOweByCurrency['INR']).toBe(10000);
  });
});
