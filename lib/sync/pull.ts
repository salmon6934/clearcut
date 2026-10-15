// lib/sync/pull.ts
// Pull & Idempotent Merge Engine with Overlap Window Cursor Tracking

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LocalStore } from '../data/local-store';
import type { MutationQueue } from '../data/queue';
import type { StorageAdapter } from '../data/storage-adapter';
import {
  mergeRemoteGroup,
  mergeRemoteMember,
  mergeRemoteExpense,
  mergeRemoteSettlement,
} from './merge';

export interface SyncCursors {
  groups?: string;
  members?: string;
  expenses?: string;
  settlements?: string;
}

export interface PullResult {
  groupsCount: number;
  membersCount: number;
  expensesCount: number;
  settlementsCount: number;
  serverTime?: string;
}

const CURSORS_STORAGE_KEY = 'sync:cursors';
const OVERLAP_WINDOW_MS = 5000; // 5-second overlap window to handle concurrent commits

export function getLocalCursors(adapter: StorageAdapter): SyncCursors {
  try {
    const raw = adapter.getItem(CURSORS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error('[PullEngine] Failed to read cursors:', err);
    return {};
  }
}

export function saveLocalCursors(adapter: StorageAdapter, cursors: SyncCursors): void {
  try {
    adapter.setItem(CURSORS_STORAGE_KEY, JSON.stringify(cursors));
  } catch (err) {
    console.error('[PullEngine] Failed to save cursors:', err);
  }
}

/**
 * Calculates new cursor with 5-second overlap window.
 */
function computeNextCursor(rows: any[], currentCursor?: string): string | undefined {
  if (!rows || rows.length === 0) return currentCursor;

  let maxTs = 0;
  for (const row of rows) {
    if (row.updated_at) {
      const ts = new Date(row.updated_at).getTime();
      if (ts > maxTs) {
        maxTs = ts;
      }
    }
  }

  if (maxTs === 0) return currentCursor;

  // Subtract 5-second overlap window to safely capture concurrent commits
  const overlapTs = Math.max(0, maxTs - OVERLAP_WINDOW_MS);
  const nextIso = new Date(overlapTs).toISOString();

  // Monotonic advancement only
  if (currentCursor && new Date(currentCursor).getTime() > overlapTs) {
    return currentCursor;
  }

  return nextIso;
}

/**
 * Fallback to query Supabase tables directly via RLS if the pull_changes_v1 RPC encounters an error.
 */
async function pullViaDirectTables(
  supabase: SupabaseClient
): Promise<any> {
  try {
    // 1. Fetch accessible groups
    const { data: groups, error: gErr } = await supabase
      .from('groups')
      .select('*')
      .is('deleted_at', null);

    if (gErr || !groups) {
      console.warn('[PullEngine] Direct query groups failed:', gErr);
      return null;
    }

    const groupIds = groups.map((g: any) => g.id);
    if (groupIds.length === 0) {
      return {
        groups: [],
        members: [],
        expenses: [],
        settlements: [],
        active_group_ids: [],
        has_more: false,
        server_time: new Date().toISOString(),
      };
    }

    // 2. Fetch members for these groups
    const { data: members, error: mErr } = await supabase
      .from('group_members')
      .select('*')
      .in('group_id', groupIds)
      .is('left_at', null);

    if (mErr) {
      console.warn('[PullEngine] Direct query members failed:', mErr);
    }

    // 3. Fetch active expenses with splits
    const { data: expenses, error: eErr } = await supabase
      .from('expenses')
      .select('*, splits:expense_splits(*)')
      .in('group_id', groupIds)
      .is('deleted_at', null);

    if (eErr) {
      console.warn('[PullEngine] Direct query expenses failed:', eErr);
    }

    // 4. Fetch active settlements
    const { data: settlements, error: sErr } = await supabase
      .from('settlements')
      .select('*')
      .in('group_id', groupIds)
      .is('deleted_at', null);

    if (sErr) {
      console.warn('[PullEngine] Direct query settlements failed:', sErr);
    }

    return {
      groups: groups || [],
      members: members || [],
      expenses: expenses || [],
      settlements: settlements || [],
      active_group_ids: groupIds,
      has_more: false,
      server_time: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[PullEngine] pullViaDirectTables exception:', err);
    return null;
  }
}

export async function pullChanges(
  store: LocalStore,
  queue: MutationQueue,
  adapter: StorageAdapter,
  supabase: SupabaseClient,
  limit = 500,
  fullRefresh = false
): Promise<PullResult> {
  const result: PullResult = {
    groupsCount: 0,
    membersCount: 0,
    expensesCount: 0,
    settlementsCount: 0,
  };

  // If store has 0 groups (e.g. after a cache reset or initial clean load), always force full refresh cursors
  const isStoreEmpty = store.getAllGroups(true).length === 0;
  const isFullRefresh = fullRefresh || isStoreEmpty;
  const cursors = isFullRefresh ? {} : getLocalCursors(adapter);
  let hasMore = true;

  const allRemoteExpenseIds = new Set<string>();
  const allRemoteSettlementIds = new Set<string>();
  const allRemoteMemberIds = new Set<string>();
  const allActiveGroupIds = new Set<string>();
  let hasActiveGroupIds = false;

  while (hasMore) {
    let data: any = null;
    const { data: rpcData, error: rpcError } = await supabase.rpc('pull_changes_v1', {
      p_since: {
        groups: cursors.groups || null,
        members: cursors.members || null,
        expenses: cursors.expenses || null,
        settlements: cursors.settlements || null,
      },
      p_limit: limit,
    });

    if (rpcError) {
      console.warn('[PullEngine] pull_changes_v1 RPC failed, attempting table query fallback:', rpcError);
      data = await pullViaDirectTables(supabase);
      if (!data) {
        throw rpcError;
      }
      hasMore = false;
    } else {
      data = rpcData;
    }

    if (!data) break;

    result.serverTime = data.server_time;

    const groups = Array.isArray(data.groups) ? data.groups : [];
    const members = Array.isArray(data.members) ? data.members : [];
    const expenses = Array.isArray(data.expenses) ? data.expenses : [];
    const settlements = Array.isArray(data.settlements) ? data.settlements : [];

    // Merge entities idempotently
    for (const g of groups) {
      mergeRemoteGroup(g, store, queue);
      result.groupsCount++;
    }
    for (const m of members) {
      mergeRemoteMember(m, store, queue);
      result.membersCount++;
      allRemoteMemberIds.add(m.id);
    }
    for (const e of expenses) {
      mergeRemoteExpense(e, store, queue);
      result.expensesCount++;
      allRemoteExpenseIds.add(e.id);
    }
    for (const s of settlements) {
      mergeRemoteSettlement(s, store, queue);
      result.settlementsCount++;
      allRemoteSettlementIds.add(s.id);
    }

    // Accumulate active group IDs for pruning
    if (Array.isArray(data.active_group_ids)) {
      hasActiveGroupIds = true;
      for (const id of data.active_group_ids) {
        allActiveGroupIds.add(id);
      }
    }

    // Update cursor timestamps with 5s overlap
    cursors.groups = computeNextCursor(groups, cursors.groups);
    cursors.members = computeNextCursor(members, cursors.members);
    cursors.expenses = computeNextCursor(expenses, cursors.expenses);
    cursors.settlements = computeNextCursor(settlements, cursors.settlements);

    saveLocalCursors(adapter, cursors);

    // Continue loop if any table has more pages
    hasMore = hasMore && Boolean(data.has_more);
  }

  // Prune locally cached groups that were deleted from Supabase (only after all pages retrieved)
  if (hasActiveGroupIds) {
    for (const localGroup of store.getAllGroups()) {
      if (!allActiveGroupIds.has(localGroup.id) && localGroup._sync !== 'pending') {
        store.hardDeleteGroup(localGroup.id);
      }
    }
  }

  // On full refresh, remove locally cached entities deleted from Supabase tables (after all pages retrieved)
  if (fullRefresh) {
    const pendingEntityIds = new Set(
      queue
        .getAllItems()
        .filter((m) => m.status === 'pending' || m.status === 'inflight')
        .map((m) => m.entityId)
    );

    for (const exp of store.getAllExpenses()) {
      if (!allRemoteExpenseIds.has(exp.id) && !pendingEntityIds.has(exp.id) && exp._sync !== 'pending') {
        store.hardDeleteExpense(exp.id);
      }
    }

    for (const set of store.getAllSettlements()) {
      if (!allRemoteSettlementIds.has(set.id) && !pendingEntityIds.has(set.id) && set._sync !== 'pending') {
        store.hardDeleteSettlement(set.id);
      }
    }

    for (const mem of store.getAllMembers()) {
      if (!allRemoteMemberIds.has(mem.id) && !pendingEntityIds.has(mem.id) && mem._sync !== 'pending') {
        store.hardDeleteMember(mem.id);
      }
    }
  }

  return result;
}
