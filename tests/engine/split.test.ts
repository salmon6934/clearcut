import { describe, it, expect } from 'vitest';
import { allocate, splitEqual, splitExact, buildMultiPayerSplits } from '@/lib/engine/split';

describe('Split Engine (lib/engine/split.ts)', () => {
  it('allocates amounts accurately using largest-remainder method', () => {
    // 10000 minor split 3 ways -> [3334, 3333, 3333]
    const alloc3 = allocate(10000, [1, 1, 1]);
    expect(alloc3).toEqual([3334, 3333, 3333]);
    expect(alloc3.reduce((a, b) => a + b, 0)).toBe(10000);

    // 1 minor split 3 ways -> [1, 0, 0]
    const alloc1 = allocate(1, [1, 1, 1]);
    expect(alloc1).toEqual([1, 0, 0]);
    expect(alloc1.reduce((a, b) => a + b, 0)).toBe(1);

    // Weighted allocation: 10000 among weights [2, 1, 1]
    const weighted = allocate(10000, [2, 1, 1]);
    expect(weighted).toEqual([5000, 2500, 2500]);
    expect(weighted.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('generates equal splits with deterministic remainder distribution', () => {
    const splits = splitEqual(10000, ['user_c', 'user_a', 'user_b'], 'user_a');
    // Sorted IDs: ['user_a', 'user_b', 'user_c'] -> user_a gets 3334
    expect(splits).toHaveLength(3);
    const a = splits.find((s) => s.memberId === 'user_a');
    const b = splits.find((s) => s.memberId === 'user_b');
    const c = splits.find((s) => s.memberId === 'user_c');

    expect(a?.owedMinor).toBe(3334);
    expect(a?.paidMinor).toBe(10000);
    expect(b?.owedMinor).toBe(3333);
    expect(b?.paidMinor).toBe(0);
    expect(c?.owedMinor).toBe(3333);
    expect(c?.paidMinor).toBe(0);
  });

  it('supports non-participant payers', () => {
    const splits = splitEqual(100, ['m1', 'm2'], 'm_sponsor');
    expect(splits).toHaveLength(3);
    const sponsor = splits.find((s) => s.memberId === 'm_sponsor');
    expect(sponsor?.paidMinor).toBe(100);
    expect(sponsor?.owedMinor).toBe(0);
  });

  it('validates exact splits and multi-payer shares', () => {
    const exact = splitExact(
      5000,
      [
        { memberId: 'm1', owedMinor: 2000 },
        { memberId: 'm2', owedMinor: 3000 },
      ],
      [{ memberId: 'm1', paidMinor: 5000 }]
    );
    expect(exact).toHaveLength(2);

    expect(() =>
      splitExact(5000, [
        { memberId: 'm1', owedMinor: 2000 },
        { memberId: 'm2', owedMinor: 2000 },
      ])
    ).toThrow();

    const multi = buildMultiPayerSplits(
      10000,
      [
        { memberId: 'm1', paidMinor: 6000 },
        { memberId: 'm2', paidMinor: 4000 },
      ],
      [
        { memberId: 'm1', owedMinor: 5000 },
        { memberId: 'm2', owedMinor: 5000 },
      ]
    );
    expect(multi).toHaveLength(2);
  });
});
