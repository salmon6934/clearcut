// lib/sync/merge.ts
// Idempotent Remote Entity Merge Engine with Concurrency & Tombstone Rules

import type { LocalStore } from '../data/local-store';
import type { MutationQueue } from '../data/queue';
import type { Group, Member, Expense, Settlement } from '../data/types';

export function mergeRemoteGroup(
  remote: any,
  store: LocalStore,
  queue: MutationQueue
): void {
  const local = store.getGroup(remote.id);

  // Check if there is an active local mutation for this group
  const hasPendingMutation = queue
    .getAllItems()
    .some((m) => m.entityId === remote.id && (m.status === 'pending' || m.status === 'inflight'));

  if (hasPendingMutation) {
    // Preserve local unpushed state
    return;
  }

  const mergedGroup: Group = {
    id: remote.id,
    name: remote.name,
    type: remote.type || 'trip',
    currency: remote.currency || 'INR',
    inviteCode: remote.invite_code,
    createdBy: remote.created_by,
    version: remote.version || 1,
    archivedAt: remote.archived_at,
    deletedAt: remote.deleted_at,
    createdAt: remote.created_at,
    updatedAt: remote.updated_at,
    _sync: 'synced',
  };

  store.upsertGroup(mergedGroup);
}

export function mergeRemoteMember(
  remote: any,
  store: LocalStore,
  queue: MutationQueue
): void {
  const hasPendingMutation = queue
    .getAllItems()
    .some((m) => m.entityId === remote.id && (m.status === 'pending' || m.status === 'inflight'));

  if (hasPendingMutation) {
    return;
  }

  const mergedMember: Member = {
    id: remote.id,
    groupId: remote.group_id,
    userId: remote.user_id,
    displayName: remote.display_name,
    role: remote.role || 'member',
    joinedAt: remote.joined_at,
    leftAt: remote.left_at,
    createdAt: remote.created_at,
    updatedAt: remote.updated_at,
    _sync: 'synced',
  };

  store.upsertMember(mergedMember);
}

export function mergeRemoteExpense(
  remote: any,
  store: LocalStore,
  queue: MutationQueue
): void {
  const local = store.getExpense(remote.id);

  const hasPendingMutation = queue
    .getAllItems()
    .some((m) => m.entityId === remote.id && (m.status === 'pending' || m.status === 'inflight'));

  if (hasPendingMutation) {
    // Local unpushed edit exists. If remote version is strictly greater than local base version,
    // mark local entity as conflict!
    if (local && (remote.version || 1) > local.version) {
      store.upsertExpense({ ...local, _sync: 'conflict' });
    }
    return;
  }

  // No unpushed local mutation: Supabase is authoritative and overrides local store.

  const splits = Array.isArray(remote.splits)
    ? remote.splits.map((s: any) => ({
        memberId: s.member_id,
        paidMinor: Number(s.paid_minor || 0),
        owedMinor: Number(s.owed_minor || 0),
      }))
    : [];

  const mergedExpense: Expense = {
    id: remote.id,
    groupId: remote.group_id,
    title: remote.title,
    notes: remote.notes,
    amountMinor: Number(remote.amount_minor),
    currency: remote.currency,
    category: remote.category,
    expenseDate: remote.expense_date,
    splitType: remote.split_type || 'equal',
    splits,
    receiptPath: remote.receipt_path || null,
    createdBy: remote.created_by,
    version: remote.version || 1,
    deletedAt: remote.deleted_at,
    createdAt: remote.created_at,
    updatedAt: remote.updated_at,
    _sync: 'synced',
  };

  store.upsertExpense(mergedExpense);
}

export function mergeRemoteSettlement(
  remote: any,
  store: LocalStore,
  queue: MutationQueue
): void {
  const local = store.getSettlement(remote.id);

  const hasPendingMutation = queue
    .getAllItems()
    .some((m) => m.entityId === remote.id && (m.status === 'pending' || m.status === 'inflight'));

  if (hasPendingMutation) {
    return;
  }

  const mergedSettlement: Settlement = {
    id: remote.id,
    groupId: remote.group_id,
    fromMemberId: remote.from_member_id,
    toMemberId: remote.to_member_id,
    amountMinor: Number(remote.amount_minor),
    method: remote.method,
    note: remote.note,
    settledOn: remote.settled_on,
    createdBy: remote.created_by,
    deletedAt: remote.deleted_at,
    createdAt: remote.created_at,
    updatedAt: remote.updated_at,
    _sync: 'synced',
  };

  store.upsertSettlement(mergedSettlement);
}

export interface ResolveConflictOptions {
  mode: 'keep_mine' | 'use_theirs';
  expenseId: string;
  store: LocalStore;
  queue: MutationQueue;
  serverSnapshot?: any;
}

/**
 * Resolves an optimistic concurrency conflict (HTTP 409) on an expense.
 * - 'keep_mine': updates local entity version to serverVersion + 1,
 *   clears the conflict mutation, and re-enqueues UPSERT_EXPENSE with baseVersion = serverVersion.
 * - 'use_theirs': clears the conflict mutation, overwrites local store with server snapshot
 *   (or soft-deletes if tombstone), and sets _sync to 'synced'.
 */
export function resolveExpenseConflict(options: ResolveConflictOptions): Expense | null {
  const { mode, expenseId, store, queue, serverSnapshot } = options;
  const localExpense = store.getExpense(expenseId);
  const conflictMutation = queue
    .getAllItems()
    .find((m) => m.entityId === expenseId && m.status === 'conflict');

  if (mode === 'keep_mine') {
    if (!localExpense) return null;
    const serverVersion =
      serverSnapshot?.version ||
      conflictMutation?.conflictDetail?.server_version ||
      conflictMutation?.conflictDetail?.version ||
      localExpense.version;
    const bumpedVersion = serverVersion + 1;

    const resolvedExpense: Expense = {
      ...localExpense,
      version: bumpedVersion,
      _sync: 'pending',
    };

    store.upsertExpense(resolvedExpense);

    if (conflictMutation) {
      queue.clearDeadLetter(conflictMutation.id);
    }

    queue.enqueue('UPSERT_EXPENSE', expenseId, {
      expense: resolvedExpense,
      baseVersion: serverVersion,
    });

    return resolvedExpense;
  } else {
    // 'use_theirs': Discard any local pending or conflict mutation for this entity
    const entityMutations = queue.getAllItems().filter((m) => m.entityId === expenseId);
    for (const m of entityMutations) {
      queue.markSynced(m.id);
    }

    const snapshot =
      serverSnapshot ||
      conflictMutation?.conflictDetail?.server_snapshot ||
      conflictMutation?.conflictDetail;

    if (snapshot?.deleted_at || snapshot?.deletedAt) {
      store.softDeleteExpense(expenseId);
      return null;
    }

    if (snapshot) {
      mergeRemoteExpense(snapshot, store, queue);
      const serverUpdated = store.getExpense(expenseId);
      if (serverUpdated) {
        store.upsertExpense({ ...serverUpdated, _sync: 'synced' });
        return serverUpdated;
      }
    } else if (localExpense) {
      store.upsertExpense({ ...localExpense, _sync: 'synced' });
      return localExpense;
    }

    return null;
  }
}

