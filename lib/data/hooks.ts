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
import {
  useStoreSelector,
  selectAllGroups,
  selectGroup,
  selectGroupMembers,
  selectGroupExpenses,
  selectGroupLedger,
  selectDashboardTotals,
  type GroupLedgerResult,
  type DashboardTotals,
} from './selectors';
import type { Group, Member, Expense } from './types';

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

export function useAllGroups(repo: DomainRepository): Group[] {
  return useStoreSelector(repo.store, (s) => selectAllGroups(s, false));
}

export function useGroup(repo: DomainRepository, groupId: string): Group | undefined {
  return useStoreSelector(repo.store, (s) => selectGroup(s, groupId));
}

export function useGroupMembers(repo: DomainRepository, groupId: string): Member[] {
  return useStoreSelector(repo.store, (s) => selectGroupMembers(s, groupId, false));
}

export function useGroupExpenses(repo: DomainRepository, groupId: string): Expense[] {
  return useStoreSelector(repo.store, (s) => selectGroupExpenses(s, groupId, false));
}

export function useGroupLedger(repo: DomainRepository, groupId: string): GroupLedgerResult {
  return useStoreSelector(repo.store, (s) => selectGroupLedger(s, groupId));
}

export function useDashboardTotals(repo: DomainRepository, userId?: string): DashboardTotals {
  const uid = userId || getAuthState().user?.id || 'local_user';
  return useStoreSelector(repo.store, (s) => selectDashboardTotals(s, uid));
}
