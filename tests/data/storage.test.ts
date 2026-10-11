// tests/data/storage.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  LocalStorageAdapter,
  QuotaExceededStorageError,
  MemoryStorage,
  onStorageWarning,
} from '../../lib/data/storage-adapter';
import {
  runMigrations,
  getSchemaVersion,
  CURRENT_SCHEMA_VERSION,
  type MigrationStep,
} from '../../lib/data/migrations';

describe('T-1.6.1: Namespaced Storage Adapter & Schema Migration Engine', () => {
  it('strictly isolates data between different user namespaces and device namespace', () => {
    const rawStorage = new MemoryStorage();
    const adapterA = new LocalStorageAdapter('user_alice', rawStorage);
    const adapterB = new LocalStorageAdapter('user_bob', rawStorage);
    const adapterDevice = new LocalStorageAdapter(undefined, rawStorage);

    adapterA.setItem('theme', 'dark');
    adapterB.setItem('theme', 'light');
    adapterDevice.setItem('haptics_enabled', 'true');

    expect(adapterA.getItem('theme')).toBe('dark');
    expect(adapterB.getItem('theme')).toBe('light');
    expect(adapterDevice.getItem('haptics_enabled')).toBe('true');

    // Wipe Alice's data
    adapterA.clear();
    expect(adapterA.getItem('theme')).toBeNull();
    // Bob and Device data must remain intact
    expect(adapterB.getItem('theme')).toBe('light');
    expect(adapterDevice.getItem('haptics_enabled')).toBe('true');
  });

  it('clearUserNamespace static helper wipes only targeted user keys', () => {
    const rawStorage = new MemoryStorage();
    const adapter = new LocalStorageAdapter('user_carol', rawStorage);
    adapter.setItem('draft_expense', 'coffee');
    expect(adapter.getItem('draft_expense')).toBe('coffee');

    LocalStorageAdapter.clearUserNamespace('user_carol', rawStorage);
    expect(adapter.getItem('draft_expense')).toBeNull();
  });

  it('handles QuotaExceededError cleanly, triggers warning event, and avoids corruption', () => {
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

    const warningListener = vi.fn();
    const unsubscribe = onStorageWarning(warningListener);

    const adapter = new LocalStorageAdapter('user_test', mockFullStorage as unknown as Storage);
    expect(() => adapter.setItem('huge_data', 'x'.repeat(100))).toThrow(
      QuotaExceededStorageError
    );

    expect(warningListener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'quota_exceeded',
        key: 'sw:v1:user_test:huge_data',
      })
    );

    unsubscribe();
  });

  it('runs core schema migrations to CURRENT_SCHEMA_VERSION', () => {
    const storage = new MemoryStorage();
    const adapter = new LocalStorageAdapter('user_mig', storage);

    expect(getSchemaVersion(adapter)).toBe(0);

    const version = runMigrations(adapter);
    expect(version).toBe(CURRENT_SCHEMA_VERSION);
    expect(getSchemaVersion(adapter)).toBe(CURRENT_SCHEMA_VERSION);

    // Initial collections exist
    expect(JSON.parse(adapter.getItem('groups')!)).toEqual({});
    expect(JSON.parse(adapter.getItem('members')!)).toEqual({});
    expect(JSON.parse(adapter.getItem('expenses')!)).toEqual({});
    expect(JSON.parse(adapter.getItem('settlements')!)).toEqual({});
    expect(JSON.parse(adapter.getItem('mutation_queue')!)).toEqual([]);

    // Idempotent: running again does not reset existing data
    adapter.setItem('groups', JSON.stringify({ g1: { id: 'g1', name: 'Trip' } }));
    runMigrations(adapter);
    expect(JSON.parse(adapter.getItem('groups')!)).toEqual({ g1: { id: 'g1', name: 'Trip' } });
  });

  it('executes custom forward migrations sequentially and skips already applied steps', () => {
    const storage = new MemoryStorage();
    const adapter = new LocalStorageAdapter('user_custom', storage);

    const order: number[] = [];
    const customSteps: MigrationStep[] = [
      {
        version: 1,
        description: 'v1 step',
        up: () => {
          order.push(1);
        },
      },
      {
        version: 2,
        description: 'v2 step',
        up: (ad) => {
          order.push(2);
          ad.setItem('v2_flag', 'done');
        },
      },
      {
        version: 3,
        description: 'v3 step',
        up: () => {
          order.push(3);
        },
      },
    ];

    // Migrate to v2
    runMigrations(adapter, customSteps, 2);
    expect(getSchemaVersion(adapter)).toBe(2);
    expect(order).toEqual([1, 2]);
    expect(adapter.getItem('v2_flag')).toBe('done');

    // Subsequent migration to v3 should only run step 3
    order.length = 0;
    runMigrations(adapter, customSteps, 3);
    expect(getSchemaVersion(adapter)).toBe(3);
    expect(order).toEqual([3]);
  });
});
