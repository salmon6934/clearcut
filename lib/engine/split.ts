import { EngineError } from './errors';

export interface Split {
  memberId: string;
  paidMinor: number;
  owedMinor: number;
  splitValue?: number;
}

/**
 * Largest-remainder allocation method.
 * Guarantees sum(allocated) === totalMinor exactly.
 * Deterministic tie-breaking preserves input order.
 */
export function allocate(totalMinor: number, weights: number[]): number[] {
  if (!Number.isInteger(totalMinor) || totalMinor < 0) {
    throw new EngineError('EXPENSE_INVALID_AMOUNT', `Invalid totalMinor: ${totalMinor}`);
  }
  if (!weights || weights.length === 0) {
    throw new EngineError('EXPENSE_INVALID_SPLIT', 'At least one participant required');
  }

  const W = weights.reduce((a, b) => a + b, 0);
  if (!Number.isInteger(W) || W <= 0) {
    throw new EngineError('EXPENSE_INVALID_SPLIT', 'Total weights must be positive integer');
  }

  const T = BigInt(totalMinor);
  const BW = BigInt(W);

  // Initial floor distribution and remainders
  const base = weights.map((w) => (T * BigInt(w)) / BW);
  const rem = weights.map((w) => (T * BigInt(w)) % BW);

  const allocatedSum = base.reduce((a, b) => a + b, 0n);
  const left = Number(T - allocatedSum);

  // Deterministic tie-breaking: higher remainder first, then original index ascending
  const order = weights
    .map((_, i) => i)
    .filter((i) => weights[i]! > 0)
    .sort((a, b) => {
      const remA = rem[a]!;
      const remB = rem[b]!;
      if (remA === remB) return a - b;
      return remA > remB ? -1 : 1;
    });

  for (let k = 0; k < left; k++) {
    const idx = order[k];
    if (idx !== undefined) {
      base[idx] = (base[idx] ?? 0n) + 1n;
    }
  }

  return base.map(Number);
}

/**
 * Splits totalMinor equally among sorted memberIds.
 * Deterministic remainder distribution: earlier sorted member IDs receive remainders.
 */
export function splitEqual(
  totalMinor: number,
  memberIds: string[],
  payerId?: string
): Split[] {
  if (!memberIds || memberIds.length === 0) {
    throw new EngineError('EXPENSE_INVALID_SPLIT', 'At least one member required for equal split');
  }

  // Sort ascending for deterministic remainder distribution
  const sortedIds = [...memberIds].sort();
  const weights = sortedIds.map(() => 1);
  const owedShares = allocate(totalMinor, weights);

  const splitsMap = new Map<string, Split>();
  for (let i = 0; i < sortedIds.length; i++) {
    const mId = sortedIds[i]!;
    splitsMap.set(mId, {
      memberId: mId,
      paidMinor: 0,
      owedMinor: owedShares[i]!,
    });
  }

  // If a single payer is provided, set their paidMinor
  if (payerId) {
    const payerSplit = splitsMap.get(payerId);
    if (payerSplit) {
      payerSplit.paidMinor = totalMinor;
    } else {
      // Payer is not in the participant list
      splitsMap.set(payerId, {
        memberId: payerId,
        paidMinor: totalMinor,
        owedMinor: 0,
      });
    }
  }

  return Array.from(splitsMap.values()).sort((a, b) => a.memberId.localeCompare(b.memberId));
}

/**
 * Validates and constructs exact splits where owed amounts are directly specified.
 */
export function splitExact(
  totalMinor: number,
  shares: { memberId: string; owedMinor: number }[],
  payers?: { memberId: string; paidMinor: number }[]
): Split[] {
  if (!shares || shares.length === 0) {
    throw new EngineError('EXPENSE_INVALID_SPLIT', 'At least one participant required');
  }

  let totalOwed = 0;
  const splitMap = new Map<string, Split>();

  for (const s of shares) {
    if (!Number.isInteger(s.owedMinor) || s.owedMinor < 0) {
      throw new EngineError('EXPENSE_INVALID_SPLIT', 'Owed amounts must be non-negative integers');
    }
    totalOwed += s.owedMinor;
    splitMap.set(s.memberId, {
      memberId: s.memberId,
      paidMinor: 0,
      owedMinor: s.owedMinor,
    });
  }

  if (totalOwed !== totalMinor) {
    throw new EngineError(
      'EXPENSE_INVALID_SPLIT',
      `Sum of owed amounts (${totalOwed}) does not equal total (${totalMinor})`
    );
  }

  if (payers && payers.length > 0) {
    let totalPaid = 0;
    for (const p of payers) {
      if (!Number.isInteger(p.paidMinor) || p.paidMinor < 0) {
        throw new EngineError('EXPENSE_INVALID_SPLIT', 'Paid amounts must be non-negative integers');
      }
      totalPaid += p.paidMinor;
      const existing = splitMap.get(p.memberId);
      if (existing) {
        existing.paidMinor = p.paidMinor;
      } else {
        splitMap.set(p.memberId, {
          memberId: p.memberId,
          paidMinor: p.paidMinor,
          owedMinor: 0,
        });
      }
    }
    if (totalPaid !== totalMinor) {
      throw new EngineError(
        'EXPENSE_INVALID_SPLIT',
        `Sum of paid amounts (${totalPaid}) does not equal total (${totalMinor})`
      );
    }
  }

  return Array.from(splitMap.values()).sort((a, b) => a.memberId.localeCompare(b.memberId));
}

/**
 * Merges multi-payer distributions and owed splits into canonical split list.
 */
export function buildMultiPayerSplits(
  totalMinor: number,
  payers: { memberId: string; paidMinor: number }[],
  owedShares: { memberId: string; owedMinor: number; splitValue?: number }[]
): Split[] {
  const map = new Map<string, Split>();

  let sumPaid = 0;
  for (const p of payers) {
    if (!Number.isInteger(p.paidMinor) || p.paidMinor < 0) {
      throw new EngineError('EXPENSE_INVALID_SPLIT', 'Paid amounts must be non-negative integers');
    }
    sumPaid += p.paidMinor;
    map.set(p.memberId, {
      memberId: p.memberId,
      paidMinor: p.paidMinor,
      owedMinor: 0,
    });
  }

  if (sumPaid !== totalMinor) {
    throw new EngineError(
      'EXPENSE_INVALID_SPLIT',
      `Sum of paid amounts (${sumPaid}) does not equal total (${totalMinor})`
    );
  }

  let sumOwed = 0;
  for (const o of owedShares) {
    if (!Number.isInteger(o.owedMinor) || o.owedMinor < 0) {
      throw new EngineError('EXPENSE_INVALID_SPLIT', 'Owed amounts must be non-negative integers');
    }
    sumOwed += o.owedMinor;
    const existing = map.get(o.memberId);
    if (existing) {
      existing.owedMinor = o.owedMinor;
      if (o.splitValue !== undefined) existing.splitValue = o.splitValue;
    } else {
      map.set(o.memberId, {
        memberId: o.memberId,
        paidMinor: 0,
        owedMinor: o.owedMinor,
        splitValue: o.splitValue,
      });
    }
  }

  if (sumOwed !== totalMinor) {
    throw new EngineError(
      'EXPENSE_INVALID_SPLIT',
      `Sum of owed amounts (${sumOwed}) does not equal total (${totalMinor})`
    );
  }

  return Array.from(map.values()).sort((a, b) => a.memberId.localeCompare(b.memberId));
}
