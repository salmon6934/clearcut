import { EngineError } from './errors';
import type { SuggestedPayment } from '../data/types';

interface BalanceEntry {
  memberId: string;
  amount: number; // positive for creditor, positive magnitude for debtor
}

/**
 * Deterministic greedy debt simplification algorithm.
 * Produces at most N - 1 payments clearing all net balances to 0.
 * Deterministic tie-breaking: sorts by amount descending, then memberId ascending.
 */
export function simplifyDebts(
  balances: Map<string, number>,
  currency: string
): SuggestedPayment[] {
  const creditors: BalanceEntry[] = [];
  const debtors: BalanceEntry[] = [];

  for (const [memberId, net] of balances.entries()) {
    if (net > 0) {
      creditors.push({ memberId, amount: net });
    } else if (net < 0) {
      debtors.push({ memberId, amount: -net });
    }
  }

  // Deterministic sort: amount descending, tie-break by memberId ascending
  const sortFn = (a: BalanceEntry, b: BalanceEntry) => {
    if (a.amount !== b.amount) return b.amount - a.amount;
    return a.memberId.localeCompare(b.memberId);
  };

  creditors.sort(sortFn);
  debtors.sort(sortFn);

  const payments: SuggestedPayment[] = [];
  let cIdx = 0;
  let dIdx = 0;

  while (cIdx < creditors.length && dIdx < debtors.length) {
    const creditor = creditors[cIdx]!;
    const debtor = debtors[dIdx]!;

    const transferAmount = Math.min(debtor.amount, creditor.amount);

    if (transferAmount > 0) {
      payments.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amountMinor: transferAmount,
        currency,
      });

      debtor.amount -= transferAmount;
      creditor.amount -= transferAmount;
    }

    if (debtor.amount === 0) {
      dIdx++;
    }
    if (creditor.amount === 0) {
      cIdx++;
    }
  }

  // Verify debt conservation: payments must satisfy <= N - 1
  const nonZeroCount = creditors.length + debtors.length;
  if (nonZeroCount > 0 && payments.length > Math.max(1, nonZeroCount - 1)) {
    throw new EngineError(
      'VALIDATION_FAILED',
      `Simplification produced ${payments.length} transactions, expected <= ${nonZeroCount - 1}`
    );
  }

  return payments;
}
