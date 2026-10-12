// lib/data/selectors.ts
// Memoized Selectors and React useSyncExternalStore Hooks

import { useSyncExternalStore, useCallback } from 'react';
import type { LocalStore } from './local-store';
import type { Group, Member, Expense, Settlement, SuggestedPayment } from './types';
import { computeBalances, computePairwise, type PairwiseDebt } from '../engine/balances';
import { simplifyDebts } from '../engine/simplify';

export interface GroupLedgerResult {
  balances: Map<string, number>;
  suggestedPayments: SuggestedPayment[];
  pairwiseDebts: PairwiseDebt[];
}

export interface DashboardTotals {
  netPerCurrency: Record<string, number>;
  totalOwedToYouByCurrency: Record<string, number>;
  totalYouOweByCurrency: Record<string, number>;
}

export interface FriendGroupDetail {
  groupId: string;
  groupName: string;
  currency: string;
  netMinor: number;
  memberId: string;
}

export interface FriendSummary {
  id: string;
  displayName: string;
  userId?: string;
  netPerCurrency: Record<string, number>;
  groups: FriendGroupDetail[];
}

// Memoization caches keyed by `${id/args}:${revision}`
const allGroupsCache = new Map<string, Group[]>();
const membersCache = new Map<string, Member[]>();
const expensesCache = new Map<string, Expense[]>();
const settlementsCache = new Map<string, Settlement[]>();
const ledgerCache = new Map<string, GroupLedgerResult>();
const dashboardCache = new Map<string, DashboardTotals>();
const friendsCache = new Map<string, FriendSummary[]>();

export function selectGroup(store: LocalStore, groupId: string): Group | undefined {
  return store.getGroup(groupId);
}

export function selectAllGroups(store: LocalStore, includeArchived = false): Group[] {
  const cacheKey = `${includeArchived}:${store.getRevision()}`;
  const cached = allGroupsCache.get(cacheKey);
  if (cached) return cached;
  const result = store.getAllGroups(includeArchived);
  allGroupsCache.set(cacheKey, result);
  return result;
}

export function selectGroupMembers(
  store: LocalStore,
  groupId: string,
  includeLeft = false
): Member[] {
  const cacheKey = `${groupId}:${includeLeft}:${store.getRevision()}`;
  const cached = membersCache.get(cacheKey);
  if (cached) return cached;
  const result = store.getGroupMembers(groupId, includeLeft);
  membersCache.set(cacheKey, result);
  return result;
}

export function selectGroupExpenses(
  store: LocalStore,
  groupId: string,
  includeDeleted = false
): Expense[] {
  const cacheKey = `${groupId}:${includeDeleted}:${store.getRevision()}`;
  const cached = expensesCache.get(cacheKey);
  if (cached) return cached;
  const result = store.getGroupExpenses(groupId, includeDeleted);
  expensesCache.set(cacheKey, result);
  return result;
}

export function selectGroupSettlements(
  store: LocalStore,
  groupId: string,
  includeDeleted = false
): Settlement[] {
  const cacheKey = `${groupId}:${includeDeleted}:${store.getRevision()}`;
  const cached = settlementsCache.get(cacheKey);
  if (cached) return cached;
  const result = store.getGroupSettlements(groupId, includeDeleted);
  settlementsCache.set(cacheKey, result);
  return result;
}

/**
 * Computes group balances & simplified debt payments.
 * Memoized against store revision so re-renders do not recompute math unless state mutated.
 */
export function selectGroupLedger(store: LocalStore, groupId: string): GroupLedgerResult {
  const cacheKey = `${groupId}:${store.getRevision()}`;
  const cached = ledgerCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const group = store.getGroup(groupId);
  const currency = group?.currency || 'INR';

  const expenses = store.getGroupExpenses(groupId, false);
  const settlements = store.getGroupSettlements(groupId, false);
  const members = store.getGroupMembers(groupId, false);

  const initialMap = new Map<string, number>();
  for (const m of members) {
    initialMap.set(m.id, 0);
  }

  if (expenses.length === 0 && settlements.length === 0) {
    const emptyResult: GroupLedgerResult = {
      balances: initialMap,
      suggestedPayments: [],
      pairwiseDebts: [],
    };
    ledgerCache.set(cacheKey, emptyResult);
    return emptyResult;
  }

  try {
    const computed = computeBalances(expenses, settlements);
    for (const [mId, bal] of computed.entries()) {
      initialMap.set(mId, bal);
    }
    const suggestedPayments = simplifyDebts(initialMap, currency);
    const pairwiseDebts = computePairwise(expenses, settlements);
    const result: GroupLedgerResult = { balances: initialMap, suggestedPayments, pairwiseDebts };
    ledgerCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn(`[Selectors] Ledger calculation warning for group ${groupId}:`, err);
    const fallback: GroupLedgerResult = {
      balances: new Map<string, number>(),
      suggestedPayments: [],
      pairwiseDebts: [],
    };
    return fallback;
  }
}

/**
 * Computes net balances for the current user across all active groups.
 * Memoized against store revision and userId.
 */
export function selectDashboardTotals(
  store: LocalStore,
  currentUserId: string
): DashboardTotals {
  const cacheKey = `${currentUserId}:${store.getRevision()}`;
  const cached = dashboardCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const totals: DashboardTotals = {
    netPerCurrency: {},
    totalOwedToYouByCurrency: {},
    totalYouOweByCurrency: {},
  };

  const groups = store.getAllGroups(false);

  for (const group of groups) {
    const members = store.getGroupMembers(group.id, false);
    const userMember = members.find((m) => m.userId === currentUserId);
    if (!userMember) continue;

    const ledger = selectGroupLedger(store, group.id);
    const balance = ledger.balances.get(userMember.id) ?? 0;
    const cur = group.currency;

    totals.netPerCurrency[cur] = (totals.netPerCurrency[cur] ?? 0) + balance;

    if (balance > 0) {
      totals.totalOwedToYouByCurrency[cur] =
        (totals.totalOwedToYouByCurrency[cur] ?? 0) + balance;
    } else if (balance < 0) {
      totals.totalYouOweByCurrency[cur] =
        (totals.totalYouOweByCurrency[cur] ?? 0) + Math.abs(balance);
    }
  }

  dashboardCache.set(cacheKey, totals);
  return totals;
}

/**
 * Computes individual friend balances aggregated across all shared groups for the current user.
 * Memoized against store revision and userId.
 */
export function selectFriendsBalances(
  store: LocalStore,
  currentUserId: string
): FriendSummary[] {
  const cacheKey = `${currentUserId}:${store.getRevision()}`;
  const cached = friendsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const friendsMap = new Map<string, FriendSummary>();
  const groups = store.getAllGroups(false);

  for (const group of groups) {
    const members = store.getGroupMembers(group.id, false);
    const userMember =
      members.find((m) => m.userId === currentUserId) ||
      (currentUserId === 'local_user' ? members.find((m) => m.role === 'owner') : undefined);
    if (!userMember) continue;

    const ledger = selectGroupLedger(store, group.id);
    const pairwiseDebts = ledger.pairwiseDebts;

    for (const member of members) {
      if (member.id === userMember.id) continue;

      let netMinor = 0;
      for (const debt of pairwiseDebts) {
        if (debt.fromMemberId === member.id && debt.toMemberId === userMember.id) {
          netMinor += debt.amountMinor;
        } else if (debt.fromMemberId === userMember.id && debt.toMemberId === member.id) {
          netMinor -= debt.amountMinor;
        }
      }

      const friendKey = member.userId || member.displayName.trim().toLowerCase();

      let friend = friendsMap.get(friendKey);
      if (!friend) {
        friend = {
          id: friendKey,
          displayName: member.displayName,
          userId: member.userId || undefined,
          netPerCurrency: {},
          groups: [],
        };
        friendsMap.set(friendKey, friend);
      }

      const cur = group.currency;
      friend.netPerCurrency[cur] = (friend.netPerCurrency[cur] ?? 0) + netMinor;
      friend.groups.push({
        groupId: group.id,
        groupName: group.name,
        currency: group.currency,
        netMinor,
        memberId: member.id,
      });
    }
  }

  const result = Array.from(friendsMap.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );

  friendsCache.set(cacheKey, result);
  return result;
}

/**
 * React hook using useSyncExternalStore for reactive local-first store subscription.
 */
export function useStoreSelector<T>(
  store: LocalStore,
  selector: (store: LocalStore) => T
): T {
  const subscribe = useCallback(
    (onStoreChange: () => void) => store.subscribe(onStoreChange),
    [store]
  );
  const getSnapshot = () => selector(store);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
