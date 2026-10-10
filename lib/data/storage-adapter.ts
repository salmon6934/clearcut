// lib/data/storage-adapter.ts
// Namespaced LocalStorage Adapter with Quota Protection, Error Recovery & Benchmarking

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  keys(): string[];
}

export class QuotaExceededStorageError extends Error {
  constructor(message = 'Storage quota exceeded') {
    super(message);
    this.name = 'QuotaExceededStorageError';
  }
}

export interface StorageBenchmarkResult {
  dataSizeBytes: number;
  writeDurationMs: number;
  readDurationMs: number;
  writeThroughputMbSec: number;
  readThroughputMbSec: number;
  itemsCount: number;
}

/**
 * LocalStorageAdapter with user-namespaced storage keys:
 * Format: sw:v1:{userId}:{key}
 * Or global namespace for device settings: sw:v1:_device:{key}
 */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly prefix: string;
  private readonly storage: Storage;

  constructor(userId?: string, storageEngine?: Storage) {
    const ns = userId ? userId.trim() : '_device';
    this.prefix = `sw:v1:${ns}:`;
    
    if (storageEngine) {
      this.storage = storageEngine;
    } else if (typeof window !== 'undefined' && window.localStorage) {
      this.storage = window.localStorage;
    } else {
      // In-memory fallback for non-browser / test environments
      this.storage = new MemoryStorage();
    }
  }

  private formatKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  getItem(key: string): string | null {
    try {
      return this.storage.getItem(this.formatKey(key));
    } catch (err) {
      console.error('[StorageAdapter] Read failure:', err);
      return null;
    }
  }

  setItem(key: string, value: string): void {
    const formattedKey = this.formatKey(key);
    try {
      this.storage.setItem(formattedKey, value);
    } catch (err: unknown) {
      // Catch DOMException QuotaExceededError
      const domError = err as { name?: string; code?: number };
      if (
        domError?.name === 'QuotaExceededError' ||
        domError?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        domError?.code === 22 ||
        domError?.code === 1014
      ) {
        throw new QuotaExceededStorageError(
          `LocalStorage quota exceeded while saving key "${formattedKey}" (${value.length} bytes)`
        );
      }
      throw err;
    }
  }

  removeItem(key: string): void {
    try {
      this.storage.removeItem(this.formatKey(key));
    } catch (err) {
      console.error('[StorageAdapter] Remove failure:', err);
    }
  }

  /**
   * Clears only keys belonging to this adapter's namespace,
   * preserving other user namespaces and device configuration.
   */
  clear(): void {
    const allKeys = this.keys();
    for (const key of allKeys) {
      this.removeItem(key);
    }
  }

  /**
   * Returns relative keys (stripped of prefix) for this namespace.
   */
  keys(): string[] {
    const matching: string[] = [];
    try {
      for (let i = 0; i < this.storage.length; i++) {
        const fullKey = this.storage.key(i);
        if (fullKey && fullKey.startsWith(this.prefix)) {
          matching.push(fullKey.slice(this.prefix.length));
        }
      }
    } catch (err) {
      console.error('[StorageAdapter] Key listing error:', err);
    }
    return matching;
  }

  /**
   * Benchmarks read/write throughput with mock ledger data.
   * Tests storage limits and performance against the target WebView.
   */
  static benchmark(
    targetSizeBytes = 5 * 1024 * 1024,
    adapter?: StorageAdapter
  ): StorageBenchmarkResult {
    const storage = adapter || new LocalStorageAdapter('benchmark_user');
    const key = '__benchmark_ledger_data__';

    // Generate ~5MB structured ledger dataset
    const baseEntry = {
      id: '00000000-0000-0000-0000-000000000000',
      title: 'Groceries & provisions for monthly trip with everyone',
      amount_minor: 125050,
      currency: 'INR',
      date: '2026-10-10T22:00:00.000Z',
      splits: [
        { memberId: 'm1', paid_minor: 125050, owed_minor: 31263 },
        { memberId: 'm2', paid_minor: 0, owed_minor: 31263 },
        { memberId: 'm3', paid_minor: 0, owed_minor: 31262 },
        { memberId: 'm4', paid_minor: 0, owed_minor: 31262 },
      ],
    };

    const entryJson = JSON.stringify(baseEntry);
    const count = Math.max(1, Math.floor(targetSizeBytes / entryJson.length));
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push({ ...baseEntry, id: `item-${i}` });
    }

    const payload = JSON.stringify(items);
    const actualBytes = new Blob([payload]).size;

    // 1. Measure write
    const tWriteStart = performance.now();
    storage.setItem(key, payload);
    const tWriteEnd = performance.now();
    const writeDurationMs = tWriteEnd - tWriteStart;

    // 2. Measure read
    const tReadStart = performance.now();
    const retrieved = storage.getItem(key);
    const parsed = retrieved ? JSON.parse(retrieved) : null;
    const tReadEnd = performance.now();
    const readDurationMs = tReadEnd - tReadStart;

    // Cleanup
    storage.removeItem(key);

    const mb = actualBytes / (1024 * 1024);
    const writeThroughputMbSec = (mb / (writeDurationMs || 1)) * 1000;
    const readThroughputMbSec = (mb / (readDurationMs || 1)) * 1000;

    return {
      dataSizeBytes: actualBytes,
      writeDurationMs,
      readDurationMs,
      writeThroughputMbSec,
      readThroughputMbSec,
      itemsCount: Array.isArray(parsed) ? parsed.length : 0,
    };
  }
}

/**
 * In-memory fallback Storage implementation conforming to Storage interface.
 */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] || null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}
