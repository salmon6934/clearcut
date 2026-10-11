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

  const allocatedSum = base.reduce((a, b) => a + b, BigInt(0));
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
      base[idx] = (base[idx] ?? BigInt(0)) + BigInt(1);
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

/**
 * Splits totalMinor by percentage basis points (bps) where 10,000 bp = 100.00%.
 * Basis points must sum to exactly 10,000.
 * Allocates integer minor units using largest-remainder method (allocate).
 */
export function splitPercent(
  totalMinor: number,
  participants: number[] | { memberId: string; bps: number }[],
  memberIds?: string[],
  payerId?: string
): Split[] {
  if (!Number.isInteger(totalMinor) || totalMinor < 0) {
    throw new EngineError('EXPENSE_INVALID_AMOUNT', `Invalid totalMinor: ${totalMinor}`);
  }
  if (!participants || participants.length === 0) {
    throw new EngineError('EXPENSE_INVALID_SPLIT', 'At least one participant required for percentage split');
  }

  let bpsList: number[] = [];
  let mIds: string[] = [];

  if (typeof participants[0] === 'number') {
    bpsList = participants as number[];
    mIds = memberIds && memberIds.length === bpsList.length
      ? memberIds
      : bpsList.map((_, i) => `member_${i}`);
  } else {
    const list = participants as { memberId: string; bps: number }[];
    bpsList = list.map((p) => p.bps);
    mIds = list.map((p) => p.memberId);
  }

  let totalBps = 0;
  for (const b of bpsList) {
    if (!Number.isInteger(b) || b < 0) {
      throw new EngineError('EXPENSE_INVALID_SPLIT', 'Basis points must be non-negative integers');
    }
    totalBps += b;
  }

  if (totalBps !== 10000) {
    throw new EngineError(
      'EXPENSE_INVALID_SPLIT',
      `Basis points must sum to exactly 10,000 (got ${totalBps})`
    );
  }

  const allocated = allocate(totalMinor, bpsList);
  const splitsMap = new Map<string, Split>();

  for (let i = 0; i < mIds.length; i++) {
    const mId = mIds[i]!;
    splitsMap.set(mId, {
      memberId: mId,
      paidMinor: 0,
      owedMinor: allocated[i]!,
      splitValue: bpsList[i],
    });
  }

  if (payerId) {
    const payerSplit = splitsMap.get(payerId);
    if (payerSplit) {
      payerSplit.paidMinor = totalMinor;
    } else {
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
 * Splits totalMinor proportionally by positive shares (weights).
 * Supports decimal weights up to 2 decimal places (converted to integer basis by * 100).
 * Allocates integer minor units using largest-remainder method (allocate).
 */
export function splitShares(
  totalMinor: number,
  participants: number[] | { memberId: string; weight: number }[],
  memberIds?: string[],
  payerId?: string
): Split[] {
  if (!Number.isInteger(totalMinor) || totalMinor < 0) {
    throw new EngineError('EXPENSE_INVALID_AMOUNT', `Invalid totalMinor: ${totalMinor}`);
  }
  if (!participants || participants.length === 0) {
    throw new EngineError('EXPENSE_INVALID_SPLIT', 'At least one participant required for shares split');
  }

  let rawWeights: number[] = [];
  let mIds: string[] = [];

  if (typeof participants[0] === 'number') {
    rawWeights = participants as number[];
    mIds = memberIds && memberIds.length === rawWeights.length
      ? memberIds
      : rawWeights.map((_, i) => `member_${i}`);
  } else {
    const list = participants as { memberId: string; weight: number }[];
    rawWeights = list.map((p) => p.weight);
    mIds = list.map((p) => p.memberId);
  }

  const integerWeights: number[] = [];
  let totalWeight = 0;

  for (const w of rawWeights) {
    if (typeof w !== 'number' || isNaN(w) || w <= 0) {
      throw new EngineError('EXPENSE_INVALID_SPLIT', 'Share weights must be positive numbers');
    }
    const scaled = Math.round(w * 100);
    if (scaled <= 0) {
      throw new EngineError('EXPENSE_INVALID_SPLIT', 'Share weights must be greater than zero');
    }
    integerWeights.push(scaled);
    totalWeight += scaled;
  }

  if (totalWeight <= 0) {
    throw new EngineError('EXPENSE_INVALID_SPLIT', 'Total shares must be greater than zero');
  }

  const allocated = allocate(totalMinor, integerWeights);
  const splitsMap = new Map<string, Split>();

  for (let i = 0; i < mIds.length; i++) {
    const mId = mIds[i]!;
    splitsMap.set(mId, {
      memberId: mId,
      paidMinor: 0,
      owedMinor: allocated[i]!,
      splitValue: rawWeights[i],
    });
  }

  if (payerId) {
    const payerSplit = splitsMap.get(payerId);
    if (payerSplit) {
      payerSplit.paidMinor = totalMinor;
    } else {
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
 * Splits totalMinor equally as a base, then adds/subtracts individual adjustments.
 * Pool = totalMinor - sum(adjustments).
 * Base equal share is distributed using largest-remainder method on the pool.
 * Each member's owed share = base share + adjustment.
 * Rejects if pool < 0 or if any member's resulting owed share is negative.
 */
export function splitAdjust(
  totalMinor: number,
  memberIdsOrParticipants: string[] | { memberId: string; adjustmentMinor: number }[],
  adjustmentsOrPayerId?: number[] | string,
  payerId?: string
): Split[] {
  if (!Number.isInteger(totalMinor) || totalMinor < 0) {
    throw new EngineError('EXPENSE_INVALID_AMOUNT', `Invalid totalMinor: ${totalMinor}`);
  }

  let mIds: string[] = [];
  let adjustments: number[] = [];
  let activePayerId = payerId;

  if (
    Array.isArray(memberIdsOrParticipants) &&
    memberIdsOrParticipants.length > 0 &&
    typeof memberIdsOrParticipants[0] === 'object'
  ) {
    const list = memberIdsOrParticipants as { memberId: string; adjustmentMinor: number }[];
    mIds = list.map((p) => p.memberId);
    adjustments = list.map((p) => p.adjustmentMinor);
    if (typeof adjustmentsOrPayerId === 'string') {
      activePayerId = adjustmentsOrPayerId;
    }
  } else {
    mIds = (memberIdsOrParticipants as string[]) || [];
    adjustments = (adjustmentsOrPayerId as number[]) || [];
  }

  if (mIds.length === 0) {
    throw new EngineError('EXPENSE_INVALID_SPLIT', 'At least one member required for adjustment split');
  }

  if (mIds.length !== adjustments.length) {
    throw new EngineError('EXPENSE_INVALID_SPLIT', 'Member IDs and adjustments length mismatch');
  }

  let sumAdjustments = 0;
  for (const adj of adjustments) {
    if (!Number.isInteger(adj)) {
      throw new EngineError('EXPENSE_INVALID_SPLIT', 'Adjustments must be integers in minor units');
    }
    sumAdjustments += adj;
  }

  const pool = totalMinor - sumAdjustments;
  if (pool < 0) {
    throw new EngineError(
      'EXPENSE_INVALID_SPLIT',
      `Total adjustments (${sumAdjustments}) exceed total amount (${totalMinor})`
    );
  }

  // Distribute pool equally among members
  const baseWeights = mIds.map(() => 1);
  const baseShares = allocate(pool, baseWeights);

  const splitsMap = new Map<string, Split>();
  for (let i = 0; i < mIds.length; i++) {
    const mId = mIds[i]!;
    const finalOwed = baseShares[i]! + adjustments[i]!;
    if (finalOwed < 0) {
      throw new EngineError(
        'EXPENSE_INVALID_SPLIT',
        `Adjusted share for ${mId} cannot be negative (got ${finalOwed})`
      );
    }

    splitsMap.set(mId, {
      memberId: mId,
      paidMinor: 0,
      owedMinor: finalOwed,
      splitValue: adjustments[i],
    });
  }

  if (activePayerId) {
    const payerSplit = splitsMap.get(activePayerId);
    if (payerSplit) {
      payerSplit.paidMinor = totalMinor;
    } else {
      splitsMap.set(activePayerId, {
        memberId: activePayerId,
        paidMinor: totalMinor,
        owedMinor: 0,
      });
    }
  }

  return Array.from(splitsMap.values()).sort((a, b) => a.memberId.localeCompare(b.memberId));
}
