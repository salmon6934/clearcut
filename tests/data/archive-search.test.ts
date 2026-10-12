import { describe, it, expect } from 'vitest';
import { DomainRepository } from '../../lib/data/repository';
import { LocalStore } from '../../lib/data/local-store';
import { MutationQueue } from '../../lib/data/queue';
import { LocalStorageAdapter, MemoryStorage } from '../../lib/data/storage-adapter';
import { FILTER_CATEGORIES } from '../../components/ExpenseFilters';

describe('T-2.4.2: Group Archival & Expense Search/Filtering', () => {
  const createEnv = () => {
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

    return { adapter, store, queue, repo, group, alice, bob };
  };

  it('archives group, bumps version, hides from default dashboard list, and restores on unarchive', () => {
    const { repo, store, group } = createEnv();

    // Initially active
    expect(group.archivedAt).toBeUndefined();
    expect(store.getAllGroups(false)).toHaveLength(1);
    expect(store.getAllGroups(true)).toHaveLength(1);

    // Archive group
    const archived = repo.archiveGroup(group.id);
    expect(archived).not.toBeNull();
    expect(archived?.archivedAt).toBeDefined();
    expect(archived?.version).toBe(group.version + 1);

    // Default query (includeArchived = false) excludes archived group
    expect(store.getAllGroups(false)).toHaveLength(0);

    // Query with includeArchived = true includes it
    const all = store.getAllGroups(true);
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(group.id);
    expect(all[0]!.archivedAt).not.toBeNull();

    // Unarchive group
    const unarchived = repo.unarchiveGroup(group.id);
    expect(unarchived).not.toBeNull();
    expect(unarchived?.archivedAt).toBeNull();
    expect(unarchived?.version).toBe(archived!.version + 1);

    // Now active again in default list
    expect(store.getAllGroups(false)).toHaveLength(1);
  });

  it('filters expenses by text search (title and notes)', () => {
    const { repo, group, alice, bob } = createEnv();

    repo.addExpense(
      {
        groupId: group.id,
        title: 'Seafood Shack Dinner',
        notes: 'Prawns and crab with garlic butter',
        amountMinor: 250000,
        currency: 'INR',
        category: 'food',
        splitType: 'equal',
        splits: [
          { memberId: alice.id, paidMinor: 250000, owedMinor: 125000 },
          { memberId: bob.id, paidMinor: 0, owedMinor: 125000 },
        ],
      },
      'user_alice'
    );

    repo.addExpense(
      {
        groupId: group.id,
        title: 'Airport Taxi',
        notes: 'Prepaid cab from Dabolim airport',
        amountMinor: 120000,
        currency: 'INR',
        category: 'transport',
        splitType: 'equal',
        splits: [
          { memberId: alice.id, paidMinor: 120000, owedMinor: 60000 },
          { memberId: bob.id, paidMinor: 0, owedMinor: 60000 },
        ],
      },
      'user_alice'
    );

    const expenses = repo.store.getGroupExpenses(group.id, false);
    expect(expenses).toHaveLength(2);

    // Search by title "Seafood"
    const byTitle = expenses.filter((e) => e.title.toLowerCase().includes('seafood'));
    expect(byTitle).toHaveLength(1);
    expect(byTitle[0]!.title).toBe('Seafood Shack Dinner');

    // Search by notes "airport"
    const byNotes = expenses.filter((e) =>
      e.notes ? e.notes.toLowerCase().includes('airport') : false
    );
    expect(byNotes).toHaveLength(1);
    expect(byNotes[0]!.title).toBe('Airport Taxi');

    // Search non-existent query
    const noMatch = expenses.filter(
      (e) =>
        e.title.toLowerCase().includes('museum') ||
        (e.notes && e.notes.toLowerCase().includes('museum'))
    );
    expect(noMatch).toHaveLength(0);
  });

  it('filters expenses by category matching chips', () => {
    const { repo, group, alice, bob } = createEnv();

    repo.addExpense(
      {
        groupId: group.id,
        title: 'Cocktails at Beach Club',
        amountMinor: 150000,
        currency: 'INR',
        category: 'drinks',
        splitType: 'equal',
        splits: [
          { memberId: alice.id, paidMinor: 150000, owedMinor: 75000 },
          { memberId: bob.id, paidMinor: 0, owedMinor: 75000 },
        ],
      },
      'user_alice'
    );

    repo.addExpense(
      {
        groupId: group.id,
        title: 'Scooter Rental',
        amountMinor: 80000,
        currency: 'INR',
        category: 'transport',
        splitType: 'equal',
        splits: [
          { memberId: alice.id, paidMinor: 80000, owedMinor: 40000 },
          { memberId: bob.id, paidMinor: 0, owedMinor: 40000 },
        ],
      },
      'user_alice'
    );

    const expenses = repo.store.getGroupExpenses(group.id, false);

    // Food category chip includes 'drinks'
    const foodCat = FILTER_CATEGORIES.find((c) => c.id === 'food')!;
    const foodMatches = expenses.filter((e) =>
      (foodCat.matches || []).includes((e.category || 'general').toLowerCase())
    );
    expect(foodMatches).toHaveLength(1);
    expect(foodMatches[0]!.title).toBe('Cocktails at Beach Club');

    // Transport category chip
    const transportCat = FILTER_CATEGORIES.find((c) => c.id === 'transport')!;
    const transportMatches = expenses.filter((e) =>
      (transportCat.matches || []).includes((e.category || 'general').toLowerCase())
    );
    expect(transportMatches).toHaveLength(1);
    expect(transportMatches[0]!.title).toBe('Scooter Rental');
  });
});
