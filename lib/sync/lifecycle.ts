// lib/sync/lifecycle.ts
// Sync Orchestrator & Lifecycle Triggers (Network, App State, Kick)

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LocalStore } from '../data/local-store';
import type { MutationQueue } from '../data/queue';
import type { StorageAdapter } from '../data/storage-adapter';
import { drainQueue, resetBackoff } from './push';
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

import { showToast } from '../ui/toast';

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
  private lastSyncTimestamp = 0;
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
      showToast('Back online! Syncing with Supabase...', 'info', 2500);
      this.kick('online_event', true).then((res) => {
        if (res.status === 'idle') {
          showToast('Sync complete! Up to date.', 'success', 2500);
        }
      });
    };

    const handleOffline = () => {
      this.status = 'offline';
      this.notifyListeners();
      showToast('Network connection lost. Changes will be saved locally.', 'warning', 3500);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      if (!isDeviceOnline()) {
        this.status = 'offline';
      } else {
        // Automatically sync on startup
        this.kick('init_online', false).catch(() => {});
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
  async kick(reason?: string, fullRefresh = false): Promise<SyncStateSnapshot> {
    if (!isDeviceOnline() && reason !== 'manual_refresh') {
      this.status = 'offline';
      this.notifyListeners();
      return this.getState();
    }

    // Skip passive page-mount refreshes if we already synced within the last 30 seconds
    const isPassiveMount = reason?.endsWith('_mount');
    if (isPassiveMount && Date.now() - this.lastSyncTimestamp < 30_000) {
      return this.getState();
    }

    if (this.isSyncing) {
      return this.getState();
    }

    const isManual = reason === 'manual_refresh' || reason === 'user_clean_resync' || reason === 'online_event';
    if (isManual || fullRefresh) {
      resetBackoff();
    }

    this.isSyncing = true;
    this.status = 'syncing';
    this.lastError = null;
    this.notifyListeners();

    try {
      // 1. Push drain pending mutations
      const pushResult = await drainQueue(this.queue, this.store, this.supabase, isManual || fullRefresh);

      // 2. Pull remote changes (passive mounts use incremental diffs rather than full refresh)
      const shouldFullRefresh = isPassiveMount ? false : fullRefresh;
      await pullChanges(this.store, this.queue, this.adapter, this.supabase, 500, shouldFullRefresh);

      const now = new Date();
      this.lastSyncedAt = now.toISOString();
      this.lastSyncTimestamp = now.getTime();

      const pendingCount = this.queue.getPendingCount();
      if (pendingCount === 0) {
        this.status = 'idle';
        this.lastError = null;
        resetBackoff();
      } else if (pushResult.halted && pushResult.backoffMs) {
        if (!isDeviceOnline()) {
          this.status = 'offline';
          this.lastError = 'Offline - changes will sync when connected';
        } else {
          this.status = 'error';
          this.lastError = `Sync paused: retrying in ${Math.max(1, Math.round(pushResult.backoffMs / 1000))}s`;
        }
      } else {
        this.status = 'idle';
        this.lastError = null;
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

  /**
   * Wipes local offline cache and performs a full authoritative resync from Supabase.
   */
  async resetAndCleanSync(): Promise<SyncStateSnapshot> {
    this.store.clearAllData();
    this.queue.clear();
    resetBackoff();
    try {
      this.adapter.removeItem('sync:cursors');
    } catch (err) {
      console.warn('[SyncLifecycle] Failed to remove cursors during reset:', err);
    }
    return this.kick('user_clean_resync', true);
  }
}
