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

export async function pullChanges(
  store: LocalStore,
  queue: MutationQueue,
  adapter: StorageAdapter,
  supabase: SupabaseClient,
  limit = 500
): Promise<PullResult> {
  const result: PullResult = {
    groupsCount: 0,
    membersCount: 0,
    expensesCount: 0,
    settlementsCount: 0,
  };

  const cursors = getLocalCursors(adapter);
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase.rpc('pull_changes_v1', {
      p_since: {
        groups: cursors.groups || null,
        members: cursors.members || null,
        expenses: cursors.expenses || null,
        settlements: cursors.settlements || null,
      },
      p_limit: limit,
    });

    if (error) {
      throw error;
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
    }
    for (const e of expenses) {
      mergeRemoteExpense(e, store, queue);
      result.expensesCount++;
    }
    for (const s of settlements) {
      mergeRemoteSettlement(s, store, queue);
      result.settlementsCount++;
    }

    // Update cursor timestamps with 5s overlap
    cursors.groups = computeNextCursor(groups, cursors.groups);
    cursors.members = computeNextCursor(members, cursors.members);
    cursors.expenses = computeNextCursor(expenses, cursors.expenses);
    cursors.settlements = computeNextCursor(settlements, cursors.settlements);

    saveLocalCursors(adapter, cursors);

    // Continue loop if any table has more pages
    hasMore = Boolean(data.has_more);
  }

  return result;
}
