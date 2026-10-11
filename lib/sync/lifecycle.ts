// lib/sync/lifecycle.ts
// Sync Orchestrator & Lifecycle Triggers (Network, App State, Kick)

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LocalStore } from '../data/local-store';
import type { MutationQueue } from '../data/queue';
import type { StorageAdapter } from '../data/storage-adapter';
import { drainQueue } from './push';
import { pullChanges } from './pull';
import { isNativePlatform } from '../native/platform';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error' | 'conflict';

export interface SyncStateSnapshot {
  status: SyncStatus;
  pendingCount: number;
  conflictCount: number;
  deadCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export type SyncStatusListener = (state: SyncStateSnapshot) => void;

export function isDeviceOnline(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
}

export class SyncLifecycleManager {
  private status: SyncStatus = 'idle';
  private lastSyncedAt: string | null = null;
  private lastError: string | null = null;
  private isSyncing = false;
  private listeners = new Set<SyncStatusListener>();
  private appStateCleanup: (() => void) | null = null;

  constructor(
    private readonly store: LocalStore,
    private readonly queue: MutationQueue,
    private readonly adapter: StorageAdapter,
    private readonly supabase: SupabaseClient
  ) {
    this.queue.subscribe(() => {
      this.notifyListeners();
    });
  }

  /**
   * Initializes network and lifecycle listeners.
   */
  init(): () => void {
    const handleOnline = () => {
      this.kick('online_event');
    };

    const handleOffline = () => {
      this.status = 'offline';
      this.notifyListeners();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      if (!isDeviceOnline()) {
        this.status = 'offline';
      }
    }

    if (isNativePlatform()) {
      import('@capacitor/app').then(({ App }) => {
        const handlePromise = App.addListener('appStateChange', (state) => {
          if (state.isActive) {
            this.kick('app_resume');
          }
        });
        this.appStateCleanup = () => {
          handlePromise.then((h) => h.remove());
        };
      }).catch((err) => {
        console.warn('[SyncLifecycle] Capacitor App listener error:', err);
      });
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
      if (this.appStateCleanup) {
        this.appStateCleanup();
      }
    };
  }

  getState(): SyncStateSnapshot {
    const deadItems = this.queue.getDeadLetterItems();
    const conflictCount = deadItems.filter((i) => i.status === 'conflict').length;
    const deadCount = deadItems.filter((i) => i.status === 'dead').length;
    const pendingCount = this.queue.getPendingCount();

    let computedStatus = this.status;
    if (!isDeviceOnline()) {
      computedStatus = 'offline';
    } else if (this.isSyncing) {
      computedStatus = 'syncing';
    } else if (conflictCount > 0) {
      computedStatus = 'conflict';
    } else if (deadCount > 0) {
      computedStatus = 'error';
    }

    return {
      status: computedStatus,
      pendingCount,
      conflictCount,
      deadCount,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
    };
  }

  subscribe(listener: SyncStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('[SyncLifecycle] Listener notification error:', err);
      }
    }
  }

  /**
   * Kicks the push drain and pull sync cycle.
   */
  async kick(reason?: string): Promise<SyncStateSnapshot> {
    if (!isDeviceOnline()) {
      this.status = 'offline';
      this.notifyListeners();
      return this.getState();
    }

    if (this.isSyncing) {
      return this.getState();
    }

    this.isSyncing = true;
    this.status = 'syncing';
    this.lastError = null;
    this.notifyListeners();

    try {
      // 1. Push drain pending mutations
      const pushResult = await drainQueue(this.queue, this.store, this.supabase);

      // 2. Pull remote changes
      await pullChanges(this.store, this.queue, this.adapter, this.supabase);

      this.lastSyncedAt = new Date().toISOString();
      if (pushResult.halted && pushResult.backoffMs) {
        this.status = 'error';
        this.lastError = `Sync paused: network backoff (${Math.round(pushResult.backoffMs / 1000)}s)`;
      } else {
        this.status = 'idle';
      }
    } catch (err: any) {
      console.warn('[SyncLifecycle] Sync cycle error:', err);
      this.lastError = err.message || 'Sync failed';
      this.status = 'error';
    } finally {
      this.isSyncing = false;
      this.notifyListeners();
    }

    return this.getState();
  }
}
