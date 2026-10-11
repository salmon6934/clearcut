// lib/data/hooks.ts
// React Hooks for LocalStore, Selectors, and Domain Repository

'use client';

import { useMemo } from 'react';
import { LocalStore } from './local-store';
import { MutationQueue } from './queue';
import { LocalStorageAdapter } from './storage-adapter';
import { DomainRepository } from './repository';
import { SyncLifecycleManager } from '../sync/lifecycle';
import { supabase } from '../supabase';
import { getAuthState } from '../auth';

let singletonAdapter: LocalStorageAdapter | null = null;
let singletonStore: LocalStore | null = null;
let singletonQueue: MutationQueue | null = null;
let singletonSync: SyncLifecycleManager | null = null;
let singletonRepo: DomainRepository | null = null;

export function getRepositoryInstance(userId?: string): DomainRepository {
  const currentUserId = userId || getAuthState().user?.id || 'local_user';

  if (!singletonStore) {
    singletonAdapter = new LocalStorageAdapter(currentUserId);
    singletonStore = new LocalStore(singletonAdapter);
    singletonQueue = new MutationQueue(singletonAdapter);
    singletonSync = new SyncLifecycleManager(
      singletonStore,
      singletonQueue,
      singletonAdapter,
      supabase
    );
    singletonSync.init();
    singletonRepo = new DomainRepository(singletonStore, singletonQueue, singletonSync);
  }

  return singletonRepo!;
}

export function useRepository(userId?: string): DomainRepository {
  return useMemo(() => getRepositoryInstance(userId), [userId]);
}
