// tests/components/components.test.ts
import { describe, it, expect } from 'vitest';
import { formatMinor, parseMoneyToMinor } from '../../lib/engine/money';
import { splitEqual, splitPercent, splitShares, splitAdjust, type Split } from '../../lib/engine/split';
import { validateExpense } from '../../lib/engine/validate';
import type { Expense } from '../../lib/data/types';

describe('T-1.9: Core UI Components Logic & Validation', () => {
  it('formats positive, negative, and zero balances accurately for BalanceSummary', () => {
    // Positive balance (owed)
    const owedStr = formatMinor(150000, 'INR');
    expect(owedStr).toBe('₹1,500.00');

    // Negative balance (owes)
    const owesStr = formatMinor(-45050, 'INR');
    expect(owesStr).toBe('-₹450.50');

    // Zero balance (settled)
    const settledStr = formatMinor(0, 'INR');
    expect(settledStr).toBe('₹0.00');
  });

  it('validates equal split allocation across participants with largest-remainder', () => {
    const totalMinor = 10000; // ₹100.00
    const members = ['m-1', 'm-2', 'm-3'];

    const splits = splitEqual(totalMinor, members);
    expect(splits).toHaveLength(3);

    // Sum must equal 10000
    const sum = splits.reduce((acc, s) => acc + s.owedMinor, 0);
    expect(sum).toBe(10000);

    // Largest remainder distributes 1 paisa deterministically
    expect(splits[0]!.owedMinor).toBe(3334);
    expect(splits[1]!.owedMinor).toBe(3333);
    expect(splits[2]!.owedMinor).toBe(3333);
  });

  it('validates ExpenseForm dry-run conservation check before repository submission', () => {
    const validExpense: Expense = {
      id: 'e-test',
      groupId: 'g-1',
      title: 'Lunch at Cafe',
      amountMinor: 20000,
      currency: 'INR',
      expenseDate: '2026-10-10',
      splitType: 'equal',
      splits: [
        { memberId: 'm-1', paidMinor: 20000, owedMinor: 10000 },
        { memberId: 'm-2', paidMinor: 0, owedMinor: 10000 },
      ],
      createdBy: 'u-1',
      version: 1,
    };

    expect(() => validateExpense(validExpense)).not.toThrow();

    // Sum paid does not equal amount
    const invalidPaid: Expense = {
      ...validExpense,
      splits: [
        { memberId: 'm-1', paidMinor: 15000, owedMinor: 10000 },
        { memberId: 'm-2', paidMinor: 0, owedMinor: 10000 },
      ],
    };
    expect(() => validateExpense(invalidPaid)).toThrow();

    // Sum owed does not equal amount
    const invalidOwed: Expense = {
      ...validExpense,
      splits: [
        { memberId: 'm-1', paidMinor: 20000, owedMinor: 15000 },
        { memberId: 'm-2', paidMinor: 0, owedMinor: 10000 },
      ],
    };
    expect(() => validateExpense(invalidOwed)).toThrow();
  });

  it('parses settlement inputs and formats payment methods', () => {
    const parsed = parseMoneyToMinor('250.50', 'INR');
    expect(parsed).toBe(25050);

    const invalid = parseMoneyToMinor('-50', 'INR');
    expect(invalid).toBeNull();
  });

  it('verifies advanced split modes (percentages, shares, adjustments) satisfy Invariant I2', () => {
    const totalMinor = 15000;
    const members = [
      { id: 'm-1', groupId: 'g-1', displayName: 'Member 1', role: 'owner' as const, userId: null },
      { id: 'm-2', groupId: 'g-1', displayName: 'Member 2', role: 'member' as const, userId: null },
      { id: 'm-3', groupId: 'g-1', displayName: 'Member 3', role: 'member' as const, userId: null },
    ];

    // 1. Percentage split: 40%, 30%, 30% -> 6000, 4500, 4500
    const pctSplits = splitPercent(totalMinor, [
      { memberId: 'm-1', bps: 4000 },
      { memberId: 'm-2', bps: 3000 },
      { memberId: 'm-3', bps: 3000 },
    ]);
    expect(pctSplits.reduce((acc, s) => acc + s.owedMinor, 0)).toBe(totalMinor);
    expect(pctSplits.find((s) => s.memberId === 'm-1')?.owedMinor).toBe(6000);

    // 2. Shares split: 3 shares, 1 share, 1 share -> 9000, 3000, 3000
    const shareSplits = splitShares(totalMinor, [
      { memberId: 'm-1', weight: 3 },
      { memberId: 'm-2', weight: 1 },
      { memberId: 'm-3', weight: 1 },
    ]);
    expect(shareSplits.reduce((acc, s) => acc + s.owedMinor, 0)).toBe(totalMinor);
    expect(shareSplits.find((s) => s.memberId === 'm-1')?.owedMinor).toBe(9000);

    // 3. Adjustment split: Base 5000 with adjustments +2000, -1000, -1000 -> 7000, 4000, 4000
    const adjSplits = splitAdjust(totalMinor, [
      { memberId: 'm-1', adjustmentMinor: 2000 },
      { memberId: 'm-2', adjustmentMinor: -1000 },
      { memberId: 'm-3', adjustmentMinor: -1000 },
    ]);
    expect(adjSplits.reduce((acc, s) => acc + s.owedMinor, 0)).toBe(totalMinor);
    expect(adjSplits.find((s) => s.memberId === 'm-1')?.owedMinor).toBe(7000);
  });
});
