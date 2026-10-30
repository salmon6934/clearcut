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
import { getAuthState, useAuth } from '../auth';
import {
  useStoreSelector,
  selectAllGroups,
  selectGroup,
  selectGroupMembers,
  selectGroupExpenses,
  selectGroupSettlements,
  selectGroupLedger,
  selectDashboardTotals,
  selectFriendsBalances,
  clearSelectorCaches,
  type GroupLedgerResult,
  type DashboardTotals,
  type FriendSummary,
} from './selectors';
import type { Group, Member, Expense, Settlement } from './types';

let singletonAdapter: LocalStorageAdapter | null = null;
let singletonStore: LocalStore | null = null;
let singletonQueue: MutationQueue | null = null;
let singletonSync: SyncLifecycleManager | null = null;
let singletonSyncCleanup: (() => void) | null = null;
let singletonRepo: DomainRepository | null = null;
let currentStoreUserId: string | null = null;

export function resetRepository(): void {
  if (singletonSyncCleanup) {
    try {
      singletonSyncCleanup();
    } catch {}
    singletonSyncCleanup = null;
  }
  currentStoreUserId = null;
  singletonAdapter = null;
  singletonStore = null;
  singletonQueue = null;
  singletonSync = null;
  singletonRepo = null;
  clearSelectorCaches();
}

export function getRepositoryInstance(userId?: string): DomainRepository {
  const currentUserId = userId || getAuthState().user?.id || 'local_user';

  if (!singletonStore || currentStoreUserId !== currentUserId) {
    if (singletonSyncCleanup) {
      try {
        singletonSyncCleanup();
      } catch {}
      singletonSyncCleanup = null;
    }
    clearSelectorCaches();
    currentStoreUserId = currentUserId;
    singletonAdapter = new LocalStorageAdapter(currentUserId);
    singletonStore = new LocalStore(singletonAdapter);
    singletonQueue = new MutationQueue(singletonAdapter);
    singletonSync = new SyncLifecycleManager(
      singletonStore,
      singletonQueue,
      singletonAdapter,
      supabase
    );
    singletonSyncCleanup = singletonSync.init();
    singletonRepo = new DomainRepository(singletonStore, singletonQueue, singletonSync);

    // If switching to an authenticated user, immediately kick a full sync
    if (currentUserId && currentUserId !== 'local_user') {
      singletonSync.kick('user_login', true).catch(() => {});
    }
  }

  return singletonRepo!;
}

export function useRepository(userId?: string): DomainRepository {
  const authState = useAuth();
  const effectiveUserId = userId || authState.user?.id || 'local_user';
  return useMemo(() => getRepositoryInstance(effectiveUserId), [effectiveUserId]);
}

export function useAllGroups(repo: DomainRepository, includeArchived = false): Group[] {
  return useStoreSelector(repo.store, (s) => selectAllGroups(s, includeArchived));
}

export function useGroup(repo: DomainRepository, groupId: string): Group | undefined {
  return useStoreSelector(repo.store, (s) => selectGroup(s, groupId));
}

export function useGroupMembers(repo: DomainRepository, groupId: string): Member[] {
  return useStoreSelector(repo.store, (s) => selectGroupMembers(s, groupId, false));
}

export function useGroupExpenses(
  repo: DomainRepository,
  groupId: string,
  includeDeleted = false
): Expense[] {
  return useStoreSelector(repo.store, (s) => selectGroupExpenses(s, groupId, includeDeleted));
}

export function useGroupSettlements(
  repo: DomainRepository,
  groupId: string,
  includeDeleted = false
): Settlement[] {
  return useStoreSelector(repo.store, (s) => selectGroupSettlements(s, groupId, includeDeleted));
}

export function useGroupLedger(repo: DomainRepository, groupId: string): GroupLedgerResult {
  return useStoreSelector(repo.store, (s) => selectGroupLedger(s, groupId));
}

export function useDashboardTotals(repo: DomainRepository, userId?: string): DashboardTotals {
  const uid = userId || getAuthState().user?.id || 'local_user';
  return useStoreSelector(repo.store, (s) => selectDashboardTotals(s, uid));
}

export function useFriendsBalances(repo: DomainRepository, userId?: string): FriendSummary[] {
  const uid = userId || getAuthState().user?.id || 'local_user';
  return useStoreSelector(repo.store, (s) => selectFriendsBalances(s, uid));
}
