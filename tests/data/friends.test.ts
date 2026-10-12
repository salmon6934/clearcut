// tests/data/friends.test.ts
import { describe, it, expect } from 'vitest';
import { LocalStore } from '../../lib/data/local-store';
import { LocalStorageAdapter, MemoryStorage } from '../../lib/data/storage-adapter';
import { selectFriendsBalances } from '../../lib/data/selectors';

describe('Friends Ledger Selector (selectFriendsBalances)', () => {
  it('aggregates balances across shared groups for each friend', () => {
    const rawStorage = new MemoryStorage();
    const adapter = new LocalStorageAdapter('u-me', rawStorage);
    const store = new LocalStore(adapter);

    // Group 1: Goa Trip
    store.upsertGroup({
      id: 'g-1',
      name: 'Goa Trip',
      type: 'trip',
      currency: 'INR',
      createdBy: 'u-me',
      version: 1,
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z',
    });

    store.upsertMembers([
      { id: 'm-me-1', groupId: 'g-1', userId: 'u-me', displayName: 'Me', role: 'owner' },
      { id: 'm-alice-1', groupId: 'g-1', userId: 'u-alice', displayName: 'Alice', role: 'member' },
      { id: 'm-bob-1', groupId: 'g-1', userId: 'u-bob', displayName: 'Bob', role: 'member' },
    ]);

    // I paid 3000 split equally between Me, Alice, Bob (each owes 1000)
    store.upsertExpense({
      id: 'exp-1',
      groupId: 'g-1',
      title: 'Villa Stay',
      amountMinor: 3000,
      currency: 'INR',
      splitType: 'equal',
      expenseDate: '2026-10-01',
      splits: [
        { memberId: 'm-me-1', paidMinor: 3000, owedMinor: 1000 },
        { memberId: 'm-alice-1', paidMinor: 0, owedMinor: 1000 },
        { memberId: 'm-bob-1', paidMinor: 0, owedMinor: 1000 },
      ],
      createdBy: 'u-me',
      version: 1,
    });

    // Group 2: Flat 402
    store.upsertGroup({
      id: 'g-2',
      name: 'Flat 402',
      type: 'home',
      currency: 'INR',
      createdBy: 'u-alice',
      version: 1,
      createdAt: '2026-10-02T10:00:00Z',
      updatedAt: '2026-10-02T10:00:00Z',
    });

    store.upsertMembers([
      { id: 'm-me-2', groupId: 'g-2', userId: 'u-me', displayName: 'Me', role: 'member' },
      { id: 'm-alice-2', groupId: 'g-2', userId: 'u-alice', displayName: 'Alice', role: 'owner' },
    ]);

    // Alice paid 600 split equally between Alice and Me (I owe Alice 300)
    store.upsertExpense({
      id: 'exp-2',
      groupId: 'g-2',
      title: 'WiFi Bill',
      amountMinor: 600,
      currency: 'INR',
      splitType: 'equal',
      expenseDate: '2026-10-02',
      splits: [
        { memberId: 'm-alice-2', paidMinor: 600, owedMinor: 300 },
        { memberId: 'm-me-2', paidMinor: 0, owedMinor: 300 },
      ],
      createdBy: 'u-alice',
      version: 1,
    });

    const friends = selectFriendsBalances(store, 'u-me');

    expect(friends.length).toBe(2);

    // Alice: Goa Trip (+1000) + Flat 402 (-300) = Net +700 (Alice owes me 700)
    const alice = friends.find((f) => f.displayName === 'Alice');
    expect(alice).toBeDefined();
    expect(alice?.netPerCurrency['INR']).toBe(700);
    expect(alice?.groups.length).toBe(2);

    // Bob: Goa Trip (+1000) = Net +1000 (Bob owes me 1000)
    const bob = friends.find((f) => f.displayName === 'Bob');
    expect(bob).toBeDefined();
    expect(bob?.netPerCurrency['INR']).toBe(1000);
    expect(bob?.groups.length).toBe(1);
  });
});
