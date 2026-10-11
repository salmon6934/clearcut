import { describe, it, expect } from 'vitest';
import { simplifyDebts } from '@/lib/engine/simplify';

describe('Debt Simplification Engine (lib/engine/simplify.ts)', () => {
  it('simplifies 4-person debt into at most 3 payments', () => {
    // A: +15000, B: -5000, C: -5000, D: -5000
    const balances = new Map<string, number>([
      ['A', 15000],
      ['B', -5000],
      ['C', -5000],
      ['D', -5000],
    ]);

    const payments = simplifyDebts(balances, 'INR');
    expect(payments).toHaveLength(3);
    for (const p of payments) {
      expect(p.toMemberId).toBe('A');
      expect(p.amountMinor).toBe(5000);
      expect(p.currency).toBe('INR');
    }
  });

  it('eliminates circular debts with zero payments', () => {
    // All members settled up
    const balances = new Map<string, number>([
      ['A', 0],
      ['B', 0],
      ['C', 0],
    ]);
    const payments = simplifyDebts(balances, 'INR');
    expect(payments).toHaveLength(0);
  });

  it('is deterministic across repeated invocations', () => {
    const balances = new Map<string, number>([
      ['Alice', 6000],
      ['Bob', 4000],
      ['Charlie', -7000],
      ['Dave', -3000],
    ]);

    const run1 = simplifyDebts(balances, 'INR');
    const run2 = simplifyDebts(balances, 'INR');
    expect(run1).toEqual(run2);
  });
});
