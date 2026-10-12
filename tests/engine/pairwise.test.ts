import { describe, it, expect } from 'vitest';
import { computePairwise, computeBalances } from '../../lib/engine/balances';
import type { Expense, Settlement } from '../../lib/data/types';

describe('T-2.4.1: Pairwise Balances Engine & Reconciliation', () => {
  const createMockExpense = (
    id: string,
    amountMinor: number,
    splits: { memberId: string; paidMinor: number; owedMinor: number }[]
  ): Expense => ({
    id,
    groupId: 'group_1',
    title: `Expense ${id}`,
    amountMinor,
    currency: 'INR',
    expenseDate: '2026-10-12',
    splitType: 'equal',
    splits,
    createdBy: 'user_1',
    version: 1,
  });

  const createMockSettlement = (
    id: string,
    fromMemberId: string,
    toMemberId: string,
    amountMinor: number
  ): Settlement => ({
    id,
    groupId: 'group_1',
    fromMemberId,
    toMemberId,
    amountMinor,
    method: 'upi',
    settledOn: '2026-10-12',
    createdBy: 'user_1',
  });

  it('computes simple single debtor and single creditor pairwise debt', () => {
    // Alice paid 1000, Bob owes 1000
    const expenses = [
      createMockExpense('exp_1', 100000, [
        { memberId: 'alice', paidMinor: 100000, owedMinor: 0 },
        { memberId: 'bob', paidMinor: 0, owedMinor: 100000 },
      ]),
    ];

    const debts = computePairwise(expenses, []);
    expect(debts).toHaveLength(1);
    expect(debts[0]).toEqual({
      fromMemberId: 'bob',
      toMemberId: 'alice',
      amountMinor: 100000,
    });

    // Check reconciliation
    const balances = computeBalances(expenses, []);
    expect(balances.get('alice')).toBe(100000);
    expect(balances.get('bob')).toBe(-100000);
  });

  it('allocates multiple debtors across multiple creditors with exact integer conservation', () => {
    // Alice paid 600, Bob paid 400 (Total 1000). Charlie owes 500, Dave owes 500.
    const expenses = [
      createMockExpense('exp_1', 100000, [
        { memberId: 'alice', paidMinor: 60000, owedMinor: 0 },
        { memberId: 'bob', paidMinor: 40000, owedMinor: 0 },
        { memberId: 'charlie', paidMinor: 0, owedMinor: 50000 },
        { memberId: 'dave', paidMinor: 0, owedMinor: 50000 },
      ]),
    ];

    const debts = computePairwise(expenses, []);
    const balances = computeBalances(expenses, []);

    // Reconcile each member's net pairwise debt against computeBalances
    const members = ['alice', 'bob', 'charlie', 'dave'];
    for (const m of members) {
      const incoming = debts
        .filter((d) => d.toMemberId === m)
        .reduce((sum, d) => sum + d.amountMinor, 0);
      const outgoing = debts
        .filter((d) => d.fromMemberId === m)
        .reduce((sum, d) => sum + d.amountMinor, 0);
      const reconciledNet = incoming - outgoing;
      expect(reconciledNet).toBe(balances.get(m) ?? 0);
    }
  });

  it('cancels opposing directions between the same pair across multiple expenses', () => {
    // Expense 1: Alice paid 1000 for Bob (Bob owes Alice 1000)
    // Expense 2: Bob paid 400 for Alice (Alice owes Bob 400)
    const expenses = [
      createMockExpense('exp_1', 100000, [
        { memberId: 'alice', paidMinor: 100000, owedMinor: 0 },
        { memberId: 'bob', paidMinor: 0, owedMinor: 100000 },
      ]),
      createMockExpense('exp_2', 40000, [
        { memberId: 'alice', paidMinor: 0, owedMinor: 40000 },
        { memberId: 'bob', paidMinor: 40000, owedMinor: 0 },
      ]),
    ];

    const debts = computePairwise(expenses, []);
    expect(debts).toHaveLength(1);
    expect(debts[0]).toEqual({
      fromMemberId: 'bob',
      toMemberId: 'alice',
      amountMinor: 60000, // 1000 - 400 = 600 net
    });
  });

  it('incorporates settlements: reduces debt and reverses direction upon overpayment', () => {
    // Bob owes Alice 1000
    const expenses = [
      createMockExpense('exp_1', 100000, [
        { memberId: 'alice', paidMinor: 100000, owedMinor: 0 },
        { memberId: 'bob', paidMinor: 0, owedMinor: 100000 },
      ]),
    ];

    // Case 1: Partial settlement (Bob pays Alice 600)
    let settlements = [createMockSettlement('st_1', 'bob', 'alice', 60000)];
    let debts = computePairwise(expenses, settlements);
    expect(debts).toHaveLength(1);
    expect(debts[0]).toEqual({
      fromMemberId: 'bob',
      toMemberId: 'alice',
      amountMinor: 40000,
    });

    // Case 2: Full settlement (Bob pays remaining 400)
    settlements = [
      createMockSettlement('st_1', 'bob', 'alice', 60000),
      createMockSettlement('st_2', 'bob', 'alice', 40000),
    ];
    debts = computePairwise(expenses, settlements);
    expect(debts).toHaveLength(0);

    // Case 3: Overpayment (Bob pays Alice 1500 total, now Alice owes Bob 500)
    settlements = [createMockSettlement('st_1', 'bob', 'alice', 150000)];
    debts = computePairwise(expenses, settlements);
    expect(debts).toHaveLength(1);
    expect(debts[0]).toEqual({
      fromMemberId: 'alice',
      toMemberId: 'bob',
      amountMinor: 50000,
    });
  });

  it('reconciles pairwise sums exactly with net balances across complex multi-way transactions', () => {
    const expenses = [
      // Dinner: Alice paid 3000, split among Alice(1000), Bob(1000), Charlie(1000)
      createMockExpense('exp_1', 300000, [
        { memberId: 'alice', paidMinor: 300000, owedMinor: 100000 },
        { memberId: 'bob', paidMinor: 0, owedMinor: 100000 },
        { memberId: 'charlie', paidMinor: 0, owedMinor: 100000 },
      ]),
      // Taxi: Bob paid 1500, split among Alice(500), Bob(500), Charlie(500)
      createMockExpense('exp_2', 150000, [
        { memberId: 'alice', paidMinor: 0, owedMinor: 50000 },
        { memberId: 'bob', paidMinor: 150000, owedMinor: 50000 },
        { memberId: 'charlie', paidMinor: 0, owedMinor: 50000 },
      ]),
      // Groceries: Charlie paid 900, split among Alice(300), Bob(300), Charlie(300)
      createMockExpense('exp_3', 90000, [
        { memberId: 'alice', paidMinor: 0, owedMinor: 30000 },
        { memberId: 'bob', paidMinor: 0, owedMinor: 30000 },
        { memberId: 'charlie', paidMinor: 90000, owedMinor: 30000 },
      ]),
    ];

    const settlements = [
      // Charlie settles 400 with Alice
      createMockSettlement('st_1', 'charlie', 'alice', 40000),
    ];

    const balances = computeBalances(expenses, settlements);
    const debts = computePairwise(expenses, settlements);

    const members = ['alice', 'bob', 'charlie'];
    for (const m of members) {
      const incoming = debts
        .filter((d) => d.toMemberId === m)
        .reduce((sum, d) => sum + d.amountMinor, 0);
      const outgoing = debts
        .filter((d) => d.fromMemberId === m)
        .reduce((sum, d) => sum + d.amountMinor, 0);
      const reconciledNet = incoming - outgoing;
      expect(reconciledNet).toBe(balances.get(m));
    }
  });
});
