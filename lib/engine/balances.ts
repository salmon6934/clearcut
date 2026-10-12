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

    const creditors: { memberId: string; net: number }[] = [];
    const debtors: { memberId: string; net: number }[] = [];

    for (const s of exp.splits) {
      const net = s.paidMinor - s.owedMinor;
      if (net > 0) creditors.push({ memberId: s.memberId, net });
      else if (net < 0) debtors.push({ memberId: s.memberId, net: -net });
    }

    if (creditors.length === 0 || debtors.length === 0) continue;

    // Allocate debt proportionally across creditors using two-pointer cumulative sweep.
    // Guarantees exact integer conservation for both debtor and creditor marginals.
    let dIdx = 0;
    let cIdx = 0;
    let dRemaining = debtors[0]?.net ?? 0;
    let cRemaining = creditors[0]?.net ?? 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx]!;
      const creditor = creditors[cIdx]!;
      const transfer = Math.min(dRemaining, cRemaining);

      if (transfer > 0) {
        const key = `${debtor.memberId}->${creditor.memberId}`;
        edgeMap.set(key, (edgeMap.get(key) ?? 0) + transfer);
      }

      dRemaining -= transfer;
      cRemaining -= transfer;

      if (dRemaining === 0) {
        dIdx++;
        dRemaining = debtors[dIdx]?.net ?? 0;
      }
      if (cRemaining === 0) {
        cIdx++;
        cRemaining = creditors[cIdx]?.net ?? 0;
      }
    }
  }

  // Factor in settlements: fromMemberId paid toMemberId, reducing debt from->to
  for (const s of settlements) {
    if (s.deletedAt) continue;
    const key = `${s.fromMemberId}->${s.toMemberId}`;
    edgeMap.set(key, (edgeMap.get(key) ?? 0) - s.amountMinor);
  }

  // Net opposing directions between every pair
  const result: PairwiseDebt[] = [];
  const processedPairs = new Set<string>();

  for (const key of edgeMap.keys()) {
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
