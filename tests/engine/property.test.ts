import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { allocate, splitEqual } from '@/lib/engine/split';
import { computeBalances } from '@/lib/engine/balances';
import { simplifyDebts } from '@/lib/engine/simplify';
import { validateExpense } from '@/lib/engine/validate';
import { MAX_AMOUNT_MINOR } from '@/lib/engine/money';
import type { Expense } from '@/lib/data/types';

describe('Fast-Check Property & Benchmark Suite (tests/engine/property.test.ts)', () => {
  it('enforces Invariants I1, I2, I3 and debt simplification across 10,000 iterations', () => {
    fc.assert(
      fc.property(
        // Amount between 1 and 10^7 for fast generation
        fc.integer({ min: 1, max: 10_000_000 }),
        // Participants between 1 and 20 members
        fc.integer({ min: 1, max: 20 }),
        (amountMinor, memberCount) => {
          const memberIds = Array.from({ length: memberCount }, (_, i) => `member_${i}`);
          const payerId = memberIds[0]!;

          // 1. Equal split allocation
          const splits = splitEqual(amountMinor, memberIds, payerId);

          const expense: Expense = {
            id: 'exp_test',
            groupId: 'grp_test',
            title: 'Property Test Expense',
            amountMinor,
            currency: 'INR',
            expenseDate: '2026-10-10',
            splitType: 'equal',
            splits,
            createdBy: payerId,
            version: 1,
          };

          // 2. Validate I2
          validateExpense(expense);

          // 3. Validate I1: All splits must be integer
          for (const s of splits) {
            expect(Number.isInteger(s.paidMinor)).toBe(true);
            expect(Number.isInteger(s.owedMinor)).toBe(true);
          }

          // 4. Validate I3: compute balances sums to strictly 0
          const balances = computeBalances([expense], []);
          let sumNet = 0;
          for (const net of balances.values()) {
            expect(Number.isInteger(net)).toBe(true);
            sumNet += net;
          }
          expect(sumNet).toBe(0);

          // 5. Debt simplification: payment count <= N - 1
          const nonZeroBalances = Array.from(balances.values()).filter((n) => n !== 0).length;
          const payments = simplifyDebts(balances, 'INR');

          if (nonZeroBalances > 0) {
            expect(payments.length).toBeLessThanOrEqual(Math.max(1, nonZeroBalances - 1));
          } else {
            expect(payments.length).toBe(0);
          }

          // Verify payments zero out balances
          const netCheck = new Map<string, number>(balances);
          for (const p of payments) {
            netCheck.set(p.fromMemberId, (netCheck.get(p.fromMemberId) ?? 0) + p.amountMinor);
            netCheck.set(p.toMemberId, (netCheck.get(p.toMemberId) ?? 0) - p.amountMinor);
          }
          for (const net of netCheck.values()) {
            expect(net).toBe(0);
          }
        }
      ),
      { numRuns: 10_000 }
    );
  });

  it('benchmark: 1,000 expenses x 12 members executes computeBalances + simplifyDebts in < 50ms (NFR-02)', () => {
    const memberIds = Array.from({ length: 12 }, (_, i) => `user_${i}`);
    const expenses: Expense[] = [];

    for (let i = 0; i < 1000; i++) {
      const payerId = memberIds[i % 12]!;
      const amountMinor = 1000 + (i % 500) * 100;
      expenses.push({
        id: `e_${i}`,
        groupId: 'g_bench',
        title: `Expense ${i}`,
        amountMinor,
        currency: 'INR',
        expenseDate: '2026-10-10',
        splitType: 'equal',
        splits: splitEqual(amountMinor, memberIds, payerId),
        createdBy: payerId,
        version: 1,
      });
    }

    const start = performance.now();
    const balances = computeBalances(expenses, []);
    const payments = simplifyDebts(balances, 'INR');
    const elapsed = performance.now() - start;

    expect(payments.length).toBeLessThanOrEqual(11);
    expect(elapsed).toBeLessThan(50);
  });
});
