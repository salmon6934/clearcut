import { describe, it, expect } from 'vitest';
import { LocalStorageAdapter, QuotaExceededStorageError } from '../../lib/data/storage-adapter';

describe('T-0.4: WebView Storage Persistence & Scheme Spike', () => {
  it('strictly isolates data between different user namespaces', () => {
    const adapterA = new LocalStorageAdapter('user_alice');
    const adapterB = new LocalStorageAdapter('user_bob');

    adapterA.setItem('theme', 'dark');
    adapterB.setItem('theme', 'light');

    expect(adapterA.getItem('theme')).toBe('dark');
    expect(adapterB.getItem('theme')).toBe('light');

    adapterA.clear();
    expect(adapterA.getItem('theme')).toBeNull();
    // Bob's data must remain untouched
    expect(adapterB.getItem('theme')).toBe('light');
  });

  it('handles QuotaExceededError cleanly by throwing QuotaExceededStorageError', () => {
    const mockFullStorage = {
      length: 0,
      clear() {},
      getItem() {
        return null;
      },
      key() {
        return null;
      },
      removeItem() {},
      setItem() {
        const err = new Error('Quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      },
    };

    const adapter = new LocalStorageAdapter('user_test', mockFullStorage as unknown as Storage);
    expect(() => adapter.setItem('huge_data', 'x'.repeat(100))).toThrow(
      QuotaExceededStorageError
    );
  });

  it('benchmarks throughput with 5 MB mock ledger data', () => {
    const result = LocalStorageAdapter.benchmark(5 * 1024 * 1024);
    expect(result.dataSizeBytes).toBeGreaterThanOrEqual(4.5 * 1024 * 1024);
    expect(result.itemsCount).toBeGreaterThan(1000);
    expect(result.writeDurationMs).toBeGreaterThan(0);
    expect(result.readDurationMs).toBeGreaterThan(0);
    // Write and read throughput should be positive numbers
    expect(result.writeThroughputMbSec).toBeGreaterThan(0);
    expect(result.readThroughputMbSec).toBeGreaterThan(0);
  });
});
