import { describe, it, expect } from 'vitest';
import { computeBalances, computePairwise } from '@/lib/engine/balances';
import { validateExpense } from '@/lib/engine/validate';
import { splitEqual } from '@/lib/engine/split';
import type { Expense, Settlement } from '@/lib/data/types';

describe('Balances and Invariants Engine (lib/engine/balances.ts)', () => {
  it('validates expense conservation invariant I2', () => {
    const validExpense: Expense = {
      id: 'e1',
      groupId: 'g1',
      title: 'Dinner',
      amountMinor: 3000,
      currency: 'INR',
      expenseDate: '2026-10-10',
      splitType: 'equal',
      splits: splitEqual(3000, ['u1', 'u2', 'u3'], 'u1'),
      createdBy: 'u1',
      version: 1,
    };

    expect(() => validateExpense(validExpense)).not.toThrow();

    const invalidExpense: Expense = {
      ...validExpense,
      amountMinor: 4000, // mismatch
    };
    expect(() => validateExpense(invalidExpense)).toThrow();
  });

  it('computes group balances correctly and enforces invariant I3', () => {
    const expenses: Expense[] = [
      {
        id: 'e1',
        groupId: 'g1',
        title: 'Taxi',
        amountMinor: 10000,
        currency: 'INR',
        expenseDate: '2026-10-10',
        splitType: 'equal',
        splits: splitEqual(10000, ['a', 'b', 'c'], 'a'),
        createdBy: 'a',
        version: 1,
      },
    ];

    const settlements: Settlement[] = [
      {
        id: 's1',
        groupId: 'g1',
        fromMemberId: 'b',
        toMemberId: 'a',
        amountMinor: 3333,
        settledOn: '2026-10-11',
      },
    ];

    const balances = computeBalances(expenses, settlements);
    // a paid 10000, owes 3334 -> net +6666. Received 3333 -> net decreases to +3333.
    // b paid 0, owes 3333 -> net -3333. Sent 3333 -> net increases to 0.
    // c paid 0, owes 3333 -> net -3333.
    expect(balances.get('a')).toBe(3333);
    expect(balances.get('b')).toBe(0);
    expect(balances.get('c')).toBe(-3333);

    const sum = Array.from(balances.values()).reduce((acc, v) => acc + v, 0);
    expect(sum).toBe(0);
  });

  it('computes pairwise breakdown properly', () => {
    const expenses: Expense[] = [
      {
        id: 'e1',
        groupId: 'g1',
        title: 'Dinner',
        amountMinor: 3000,
        currency: 'INR',
        expenseDate: '2026-10-10',
        splitType: 'equal',
        splits: splitEqual(3000, ['a', 'b', 'c'], 'a'),
        createdBy: 'a',
        version: 1,
      },
    ];

    const pairwise = computePairwise(expenses, []);
    expect(pairwise).toHaveLength(2);
    expect(pairwise.find((p) => p.fromMemberId === 'b' && p.toMemberId === 'a')?.amountMinor).toBe(1000);
    expect(pairwise.find((p) => p.fromMemberId === 'c' && p.toMemberId === 'a')?.amountMinor).toBe(1000);
  });
});
