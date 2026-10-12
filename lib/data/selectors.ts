// lib/data/selectors.ts
// Memoized Selectors and React useSyncExternalStore Hooks

import { useSyncExternalStore } from 'react';
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

// Memoization caches keyed by `${id}:${revision}`
const ledgerCache = new Map<string, GroupLedgerResult>();
const dashboardCache = new Map<string, DashboardTotals>();

export function selectGroup(store: LocalStore, groupId: string): Group | undefined {
  return store.getGroup(groupId);
}

export function selectAllGroups(store: LocalStore, includeArchived = false): Group[] {
  return store.getAllGroups(includeArchived);
}

export function selectGroupMembers(
  store: LocalStore,
  groupId: string,
  includeLeft = false
): Member[] {
  return store.getGroupMembers(groupId, includeLeft);
}

export function selectGroupExpenses(
  store: LocalStore,
  groupId: string,
  includeDeleted = false
): Expense[] {
  return store.getGroupExpenses(groupId, includeDeleted);
}

export function selectGroupSettlements(
  store: LocalStore,
  groupId: string,
  includeDeleted = false
): Settlement[] {
  return store.getGroupSettlements(groupId, includeDeleted);
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
 * React hook using useSyncExternalStore for reactive local-first store subscription.
 */
export function useStoreSelector<T>(
  store: LocalStore,
  selector: (store: LocalStore) => T
): T {
  return useSyncExternalStore(
    (onStoreChange) => store.subscribe(onStoreChange),
    () => selector(store),
    () => selector(store)
  );
}
