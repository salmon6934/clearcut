import { EngineError } from './errors';
import type { Expense, Settlement } from '../data/types';

/**
 * Computes net balances per member across all non-deleted expenses and settlements.
 * Enforces Invariant I3: sum(net_balances) === 0.
 * Sign convention:
 *   Positive (+) = Creditor (is owed money)
 *   Negative (-) = Debtor (owes money)
 *   Zero (0)     = Settled up
 */
export function computeBalances(
  expenses: Expense[],
  settlements: Settlement[]
): Map<string, number> {
  const balances = new Map<string, number>();

  const add = (memberId: string, amount: number) => {
    const cur = balances.get(memberId) ?? 0;
    balances.set(memberId, cur + amount);
  };

  // 1. Process active expenses
  for (const exp of expenses) {
    if (exp.deletedAt) continue;

    for (const split of exp.splits) {
      const netSplit = split.paidMinor - split.owedMinor;
      add(split.memberId, netSplit);
    }
  }

  // 2. Process active settlements
  // A sent to B -> A's balance increases (+ amount), B's balance decreases (- amount)
  for (const st of settlements) {
    if (st.deletedAt) continue;

    add(st.fromMemberId, st.amountMinor);
    add(st.toMemberId, -st.amountMinor);
  }

  // 3. Verify Invariant I3: sum(net) === 0
  let totalNet = 0;
  for (const net of balances.values()) {
    totalNet += net;
  }

  if (totalNet !== 0) {
    throw new EngineError(
      'VALIDATION_FAILED',
      `Invariant I3 violated: sum of balances is ${totalNet}, must be 0`
    );
  }

  return balances;
}

export interface PairwiseDebt {
  fromMemberId: string; // debtor
  toMemberId: string;   // creditor
  amountMinor: number;
}

/**
 * Pairwise debt breakdown: direct relationships between members.
 */
export function computePairwise(
  expenses: Expense[],
  settlements: Settlement[]
): PairwiseDebt[] {
  // Directed edges: key "from->to" => amount
  const edgeMap = new Map<string, number>();

  for (const exp of expenses) {
    if (exp.deletedAt) continue;

    // For single expense: debtors owe creditors proportionally
    const creditors: { memberId: string; net: number }[] = [];
    const debtors: { memberId: string; net: number }[] = [];

    for (const s of exp.splits) {
      const net = s.paidMinor - s.owedMinor;
      if (net > 0) creditors.push({ memberId: s.memberId, net });
      else if (net < 0) debtors.push({ memberId: s.memberId, net: -net });
    }

    const totalCredit = creditors.reduce((a, b) => a + b.net, 0);
    if (totalCredit <= 0) continue;

    for (const d of debtors) {
      let allocatedForDebtor = 0;
      for (let i = 0; i < creditors.length; i++) {
        const c = creditors[i]!;
        // allocate proportional share
        const isLast = i === creditors.length - 1;
        const share = isLast
          ? d.net - allocatedForDebtor
          : Math.floor((d.net * c.net) / totalCredit);
        allocatedForDebtor += share;

        if (share > 0) {
          const key = `${d.memberId}->${c.memberId}`;
          edgeMap.set(key, (edgeMap.get(key) ?? 0) + share);
        }
      }
    }
  }

  // Factor in settlements
  for (const s of settlements) {
    if (s.deletedAt) continue;
    // from paid to
    const forwardKey = `${s.fromMemberId}->${s.toMemberId}`;
    const reverseKey = `${s.toMemberId}->${s.fromMemberId}`;

    const forwardDebt = edgeMap.get(forwardKey) ?? 0;
    if (forwardDebt >= s.amountMinor) {
      edgeMap.set(forwardKey, forwardDebt - s.amountMinor);
    } else {
      edgeMap.set(forwardKey, 0);
      const remainingPaid = s.amountMinor - forwardDebt;
      edgeMap.set(reverseKey, (edgeMap.get(reverseKey) ?? 0) - remainingPaid);
    }
  }

  // Net opposing directions between every pair
  const result: PairwiseDebt[] = [];
  const processedPairs = new Set<string>();

  for (const [key, amount] of edgeMap.entries()) {
    const [from, to] = key.split('->');
    if (!from || !to) continue;
    const pairId = [from, to].sort().join(':');
    if (processedPairs.has(pairId)) continue;
    processedPairs.add(pairId);

    const fwd = edgeMap.get(`${from}->${to}`) ?? 0;
    const rev = edgeMap.get(`${to}->${from}`) ?? 0;
    const net = fwd - rev;

    if (net > 0) {
      result.push({ fromMemberId: from, toMemberId: to, amountMinor: net });
    } else if (net < 0) {
      result.push({ fromMemberId: to, toMemberId: from, amountMinor: -net });
    }
  }

  return result.sort((a, b) => b.amountMinor - a.amountMinor);
}
