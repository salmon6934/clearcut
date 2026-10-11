import { describe, it, expect } from 'vitest';
import {
  splitPercent,
  splitShares,
  splitAdjust,
} from '../../lib/engine/split';

describe('T-2.1.1: Advanced Split Engine (Percentage, Shares, Adjustment)', () => {
  describe('splitPercent', () => {
    it('Golden Vector 3: satisfies 33.33%, 33.33%, 33.34% on 10000 minor -> [3333, 3333, 3334] exactly', () => {
      // 33.33% = 3333 bp, 33.33% = 3333 bp, 33.34% = 3334 bp (sum = 10000 bp)
      const splits = splitPercent(10000, [3333, 3333, 3334]);
      expect(splits).toHaveLength(3);
      expect(splits[0]!.owedMinor).toBe(3333);
      expect(splits[1]!.owedMinor).toBe(3333);
      expect(splits[2]!.owedMinor).toBe(3334);
      expect(splits.reduce((sum, s) => sum + s.owedMinor, 0)).toBe(10000);
      expect(splits[0]!.splitValue).toBe(3333);
      expect(splits[2]!.splitValue).toBe(3334);
    });

    it('splits equally when 50.00% / 50.00% is passed', () => {
      const splits = splitPercent(
        5000,
        [
          { memberId: 'alice', bps: 5000 },
          { memberId: 'bob', bps: 5000 },
        ],
        undefined,
        'alice'
      );
      expect(splits).toHaveLength(2);
      const alice = splits.find((s) => s.memberId === 'alice')!;
      const bob = splits.find((s) => s.memberId === 'bob')!;
      expect(alice.owedMinor).toBe(2500);
      expect(alice.paidMinor).toBe(5000);
      expect(bob.owedMinor).toBe(2500);
      expect(bob.paidMinor).toBe(0);
    });

    it('rejects when basis points sum is not exactly 10,000 bp', () => {
      expect(() => splitPercent(10000, [3333, 3333, 3333])).toThrowError(
        /must sum to exactly 10,000/
      );
      expect(() => splitPercent(10000, [5000, 6000])).toThrowError(
        /must sum to exactly 10,000/
      );
    });

    it('rejects negative basis points or negative total', () => {
      expect(() => splitPercent(10000, [-1000, 11000])).toThrowError();
      expect(() => splitPercent(-500, [10000])).toThrowError();
    });
  });

  describe('splitShares', () => {
    it('Golden Vector 4: shares split [2, 1, 1] on 10000 minor yields [5000, 2500, 2500]', () => {
      const splits = splitShares(10000, [2, 1, 1]);
      expect(splits).toHaveLength(3);
      expect(splits[0]!.owedMinor).toBe(5000);
      expect(splits[1]!.owedMinor).toBe(2500);
      expect(splits[2]!.owedMinor).toBe(2500);
      expect(splits.reduce((sum, s) => sum + s.owedMinor, 0)).toBe(10000);
      expect(splits[0]!.splitValue).toBe(2);
      expect(splits[1]!.splitValue).toBe(1);
    });

    it('supports positive decimal weights up to 2 decimal places', () => {
      // 1.5 shares vs 2.5 shares on 8000 minor -> 3000 vs 5000
      const splits = splitShares(
        8000,
        [
          { memberId: 'm1', weight: 1.5 },
          { memberId: 'm2', weight: 2.5 },
        ]
      );
      expect(splits).toHaveLength(2);
      const m1 = splits.find((s) => s.memberId === 'm1')!;
      const m2 = splits.find((s) => s.memberId === 'm2')!;
      expect(m1.owedMinor).toBe(3000);
      expect(m2.owedMinor).toBe(5000);
      expect(m1.owedMinor + m2.owedMinor).toBe(8000);
    });

    it('distributes remainders deterministically when weights cause fractions', () => {
      // 10000 split [1, 1, 1] -> [3334, 3333, 3333]
      const splits = splitShares(10000, [1, 1, 1]);
      expect(splits[0]!.owedMinor).toBe(3334);
      expect(splits[1]!.owedMinor).toBe(3333);
      expect(splits[2]!.owedMinor).toBe(3333);
      expect(splits.reduce((sum, s) => sum + s.owedMinor, 0)).toBe(10000);
    });

    it('rejects non-positive weights', () => {
      expect(() => splitShares(10000, [0, 1])).toThrowError(/must be positive/);
      expect(() => splitShares(10000, [-1, 2])).toThrowError(/must be positive/);
    });
  });

  describe('splitAdjust', () => {
    it('applies equal base split with individual adjustments conserving total amount', () => {
      // 10000 total, 3 members: A (+1000), B (0), C (-1000)
      // Pool = 10000 - 0 = 10000. Equal split = [3334, 3333, 3333]
      // Result: A: 4334, B: 3333, C: 2333 -> sum = 10000
      const splits = splitAdjust(10000, ['m_a', 'm_b', 'm_c'], [1000, 0, -1000]);
      expect(splits).toHaveLength(3);
      const a = splits.find((s) => s.memberId === 'm_a')!;
      const b = splits.find((s) => s.memberId === 'm_b')!;
      const c = splits.find((s) => s.memberId === 'm_c')!;
      expect(a.owedMinor).toBe(4334);
      expect(b.owedMinor).toBe(3333);
      expect(c.owedMinor).toBe(2333);
      expect(a.owedMinor + b.owedMinor + c.owedMinor).toBe(10000);
    });

    it('handles net-positive adjustments by reducing base pool equally', () => {
      // Total 10000, A has adjustment +1000, B & C have 0
      // Pool = 10000 - 1000 = 9000 -> 3000 each
      // Result: A: 4000, B: 3000, C: 3000 -> sum = 10000
      const splits = splitAdjust(
        10000,
        [
          { memberId: 'm_a', adjustmentMinor: 1000 },
          { memberId: 'm_b', adjustmentMinor: 0 },
          { memberId: 'm_c', adjustmentMinor: 0 },
        ],
        'm_a'
      );
      expect(splits).toHaveLength(3);
      const a = splits.find((s) => s.memberId === 'm_a')!;
      const b = splits.find((s) => s.memberId === 'm_b')!;
      const c = splits.find((s) => s.memberId === 'm_c')!;
      expect(a.owedMinor).toBe(4000);
      expect(a.paidMinor).toBe(10000);
      expect(b.owedMinor).toBe(3000);
      expect(c.owedMinor).toBe(3000);
      expect(a.owedMinor + b.owedMinor + c.owedMinor).toBe(10000);
    });

    it('rejects if adjustments cause any resulting share to be negative', () => {
      // Total 10000, adjustments [0, 0, -6000] -> pool = 16000. Base = ~5333.
      // Member 3 gets 5333 + (-6000) = -667 < 0
      expect(() =>
        splitAdjust(10000, ['m_a', 'm_b', 'm_c'], [0, 0, -6000])
      ).toThrowError(/cannot be negative/);
    });

    it('rejects if total adjustments exceed total amount', () => {
      expect(() =>
        splitAdjust(5000, ['m_a', 'm_b'], [3000, 3000])
      ).toThrowError(/exceed total amount/);
    });
  });
});
