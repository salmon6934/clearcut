// lib/sync/push.ts
// Push Drain Engine with Strict Error Classification, OCC Handling & Exponential Backoff

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MutationQueue, MutationRecord } from '../data/queue';
import type { LocalStore } from '../data/local-store';
import type { Expense, Settlement, Group, Member } from '../data/types';

export type ErrorClassification =
  | 'SUCCESS'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'PERMANENT'
  | 'TRANSIENT';

export interface DrainResult {
  processed: number;
  synced: number;
  conflicts: number;
  dead: number;
  halted: boolean;
  backoffMs?: number;
}

let isDrainingLock = false;
let consecutiveTransientFailures = 0;
let nextAllowedDrainTime = 0;

export function classifyError(error: any): {
  type: ErrorClassification;
  statusCode?: number;
  message: string;
  detail?: string;
} {
  if (!error) {
    return { type: 'SUCCESS', message: '' };
  }

  const message = error.message || String(error);
  const code = error.code || '';
  const status = error.status || (error as any).statusCode;
  const detail = error.details || error.detail;

  // 1. Conflict (PT409 / EXPENSE_CONFLICT / MEMBER_HAS_BALANCE)
  if (
    status === 409 ||
    code === 'PT409' ||
    message.includes('EXPENSE_CONFLICT') ||
    message.includes('MEMBER_NAME_TAKEN') ||
    message.includes('MEMBER_HAS_BALANCE') ||
    message.includes('SOLE_OWNER') ||
    message.includes('ALREADY_GROUP_MEMBER') ||
    message.includes('MEMBER_ALREADY_CLAIMED')
  ) {
    return { type: 'CONFLICT', statusCode: 409, message, detail };
  }

  // 2. Unauthorized (PT401 / AUTH_REQUIRED)
  if (status === 401 || code === 'PT401' || message.includes('AUTH_REQUIRED')) {
    return { type: 'UNAUTHORIZED', statusCode: 401, message, detail };
  }

  // 3. Permanent Client Error (PT400 / PT403 / PT404)
  if (
    status === 400 ||
    status === 403 ||
    status === 404 ||
    code === 'PT400' ||
    code === 'PT403' ||
    code === 'PT404' ||
    message.includes('VALIDATION_FAILED') ||
    message.includes('SETTLEMENT_INVALID') ||
    message.includes('FORBIDDEN')
  ) {
    return { type: 'PERMANENT', statusCode: status || 400, message, detail };
  }

  // 4. Transient / Network / Server Error (5xx, 429, Fetch failure)
  return { type: 'TRANSIENT', statusCode: status || 500, message, detail };
}

export function computeExponentialBackoffMs(failures: number): number {
  const baseMs = 2000;
  const maxMs = 60000;
  const delay = Math.min(baseMs * Math.pow(2, failures), maxMs);
  return delay;
}

export function resetBackoff(): void {
  consecutiveTransientFailures = 0;
  nextAllowedDrainTime = 0;
}

export async function drainQueue(
  queue: MutationQueue,
  store: LocalStore,
  supabase: SupabaseClient
): Promise<DrainResult> {
  const result: DrainResult = {
    processed: 0,
    synced: 0,
    conflicts: 0,
    dead: 0,
    halted: false,
  };

  const now = Date.now();
  if (now < nextAllowedDrainTime) {
    result.halted = true;
    result.backoffMs = nextAllowedDrainTime - now;
    return result;
  }

  if (isDrainingLock) {
    return result;
  }

  isDrainingLock = true;

  try {
    while (true) {
      const pendingItem = queue.peekNextPending();
      if (!pendingItem) {
        // Queue is fully drained!
        resetBackoff();
        break;
      }

      queue.markInflight(pendingItem.id);
      result.processed++;

      try {
        const rpcResult = await executeMutationRpc(pendingItem, supabase);

        // Success!
        consecutiveTransientFailures = 0;
        queue.markSynced(pendingItem.id);
        result.synced++;

        // Update local entity state
        updateLocalStoreEntityOnSync(pendingItem, rpcResult, store);
      } catch (err: any) {
        const classified = classifyError(err);

        if (classified.type === 'CONFLICT') {
          // 409 Conflict: Flag entity and continue drain for other entities
          let conflictDetailObj = classified.detail;
          if (typeof conflictDetailObj === 'string') {
            try {
              conflictDetailObj = JSON.parse(conflictDetailObj);
            } catch {
              // keep as string
            }
          }
          queue.markFailed(pendingItem.id, classified.message, true, 5, conflictDetailObj);
          markLocalEntitySyncState(pendingItem, store, 'conflict');
          result.conflicts++;
        } else if (classified.type === 'PERMANENT') {
          // 4xx Poison pill: Dead-letter without blocking the rest of the queue
          queue.markFailed(pendingItem.id, classified.message, false, 0); // 0 max retries => dead
          markLocalEntitySyncState(pendingItem, store, 'dead');
          result.dead++;
        } else if (classified.type === 'UNAUTHORIZED') {
          // 401: Try refreshing token once
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError) {
            // Unmark inflight, retry on next turn
            queue.markFailed(pendingItem.id, 'Token refreshed, retrying', false, 10);
            continue;
          } else {
            // Refresh failed: pause drain without discarding queue
            result.halted = true;
            break;
          }
        } else {
          // Transient network error or 5xx: Halt drain & apply exponential backoff
          consecutiveTransientFailures++;
          const backoff = computeExponentialBackoffMs(consecutiveTransientFailures);
          nextAllowedDrainTime = Date.now() + backoff;
          queue.markFailed(pendingItem.id, classified.message, false);

          result.halted = true;
          result.backoffMs = backoff;
          break;
        }
      }
    }
  } finally {
    isDrainingLock = false;
  }

  return result;
}

/**
 * Maps and executes the corresponding Supabase RPC for a mutation record.
 */
async function executeMutationRpc(
  mutation: MutationRecord,
  supabase: SupabaseClient
): Promise<any> {
  const { type, payload, id: clientMutationId } = mutation;

  switch (type) {
    case 'CREATE_GROUP': {
      const group = payload.group as Group;
      const ownerMemberId = payload.ownerMemberId;
      const { data, error } = await supabase.rpc('create_group_v1', {
        p_group: {
          id: group.id,
          name: group.name,
          type: group.type,
          currency: group.currency,
        },
        p_owner_member_id: ownerMemberId,
        p_mutation_id: clientMutationId,
      });
      if (error) throw error;
      return data;
    }

    case 'ADD_PLACEHOLDER': {
      const member = payload.member as Member;
      const { data, error } = await supabase.rpc('add_placeholder_v1', {
        p_member: {
          id: member.id,
          group_id: member.groupId,
          display_name: member.displayName,
        },
        p_mutation_id: clientMutationId,
      });
      if (error) throw error;
      return data;
    }

    case 'JOIN_GROUP': {
      const { inviteCode, memberId } = payload;
      const { data, error } = await supabase.rpc('join_group_v1', {
        p_invite_code: inviteCode,
        p_member_id: memberId,
        p_mutation_id: clientMutationId,
      });
      if (error) throw error;
      return data;
    }

    case 'UPSERT_EXPENSE': {
      const expense = payload.expense as Expense;
      const baseVersion = payload.baseVersion ?? expense.version ?? 1;

      const splitsPayload = (expense.splits || []).map((s) => ({
        member_id: s.memberId,
        paid_minor: s.paidMinor,
        owed_minor: s.owedMinor,
      }));

      const { data, error } = await supabase.rpc('upsert_expense_v1', {
        p_expense: {
          id: expense.id,
          group_id: expense.groupId,
          title: expense.title,
          notes: expense.notes || null,
          amount_minor: expense.amountMinor,
          currency: expense.currency,
          category: expense.category || null,
          expense_date: expense.expenseDate ? expense.expenseDate.split('T')[0] : null,
          split_type: expense.splitType,
          created_by: expense.createdBy,
          splits: splitsPayload,
        },
        p_base_version: baseVersion,
        p_mutation_id: clientMutationId,
      });
      if (error) throw error;
      return data;
    }

    case 'DELETE_EXPENSE': {
      const { expenseId, groupId, baseVersion } = payload;
      const { data, error } = await supabase.rpc('delete_expense_v1', {
        p_expense_id: expenseId,
        p_group_id: groupId,
        p_base_version: baseVersion,
        p_mutation_id: clientMutationId,
      });
      if (error) throw error;
      return data;
    }

    case 'UPSERT_SETTLEMENT': {
      const settlement = payload.settlement as Settlement;
      const { data, error } = await supabase.rpc('upsert_settlement_v1', {
        p_settlement: {
          id: settlement.id,
          group_id: settlement.groupId,
          from_member_id: settlement.fromMemberId,
          to_member_id: settlement.toMemberId,
          amount_minor: settlement.amountMinor,
          method: settlement.method || null,
          note: settlement.note || null,
          settled_on: settlement.settledOn ? settlement.settledOn.split('T')[0] : null,
        },
        p_mutation_id: clientMutationId,
      });
      if (error) throw error;
      return data;
    }

    case 'DELETE_SETTLEMENT': {
      const { settlementId, groupId } = payload;
      const { data, error } = await supabase.rpc('delete_settlement_v1', {
        p_settlement_id: settlementId,
        p_group_id: groupId,
        p_mutation_id: clientMutationId,
      });
      if (error) throw error;
      return data;
    }

    case 'LEAVE_GROUP': {
      const { groupId, memberId } = payload;
      const { data, error } = await supabase.rpc('leave_group_v1', {
        p_group_id: groupId,
        p_member_id: memberId,
      });
      if (error) throw error;
      return data;
    }

    case 'REMOVE_MEMBER': {
      const { groupId, memberId } = payload;
      const { data, error } = await supabase.rpc('remove_member_v1', {
        p_group_id: groupId,
        p_member_id: memberId,
      });
      if (error) throw error;
      return data;
    }

    case 'UPDATE_MEMBER_ROLE': {
      const { groupId, memberId, role } = payload;
      const { data, error } = await supabase.rpc('update_member_role_v1', {
        p_group_id: groupId,
        p_member_id: memberId,
        p_role: role,
      });
      if (error) throw error;
      return data;
    }

    case 'TRANSFER_OWNERSHIP': {
      const { groupId, newOwnerMemberId } = payload;
      const { data, error } = await supabase.rpc('transfer_group_ownership_v1', {
        p_group_id: groupId,
        p_new_owner_member_id: newOwnerMemberId,
      });
      if (error) throw error;
      return data;
    }

    case 'CLAIM_PLACEHOLDER': {
      const { claimToken } = payload;
      const { data, error } = await supabase.rpc('claim_placeholder_v1', {
        p_claim_token: claimToken,
      });
      if (error) throw error;
      return data;
    }

    default:
      throw new Error(`Unsupported mutation type: ${type}`);
  }
}

/**
 * Updates the local store entity when the RPC confirms success.
 */
function updateLocalStoreEntityOnSync(
  mutation: MutationRecord,
  rpcResponse: any,
  store: LocalStore
): void {
  const { type, entityId } = mutation;

  switch (type) {
    case 'CREATE_GROUP': {
      const group = store.getGroup(entityId);
      if (group) {
        store.upsertGroup({ ...group, _sync: 'synced' });
      }
      break;
    }

    case 'ADD_PLACEHOLDER': {
      const member = store.getMember(entityId);
      if (member) {
        store.upsertMember({ ...member, _sync: 'synced' });
      }
      break;
    }

    case 'REMOVE_MEMBER': {
      const member = store.getMember(entityId);
      if (member) {
        store.upsertMember({ ...member, leftAt: new Date().toISOString(), _sync: 'synced' });
      }
      break;
    }

    case 'UPDATE_MEMBER_ROLE': {
      const member = store.getMember(entityId);
      if (member) {
        store.upsertMember({ ...member, role: mutation.payload.role, _sync: 'synced' });
      }
      break;
    }

    case 'TRANSFER_OWNERSHIP': {
      const newOwner = store.getMember(mutation.payload.newOwnerMemberId);
      if (newOwner) {
        store.upsertMember({ ...newOwner, role: 'owner', _sync: 'synced' });
      }
      break;
    }

    case 'CLAIM_PLACEHOLDER': {
      const memberId = rpcResponse?.member_id || entityId;
      const member = store.getMember(memberId);
      if (member && rpcResponse?.member?.user_id) {
        store.upsertMember({
          ...member,
          userId: rpcResponse.member.user_id,
          _sync: 'synced',
        });
      }
      break;
    }

    case 'UPSERT_EXPENSE': {
      const expense = store.getExpense(entityId);
      if (expense) {
        const serverVersion = rpcResponse?.expense?.version || expense.version + 1;
        store.upsertExpense({
          ...expense,
          version: serverVersion,
          _sync: 'synced',
        });
      }
      break;
    }

    case 'DELETE_EXPENSE': {
      store.softDeleteExpense(entityId);
      break;
    }

    case 'UPSERT_SETTLEMENT': {
      const settlement = store.getSettlement(entityId);
      if (settlement) {
        store.upsertSettlement({ ...settlement, _sync: 'synced' });
      }
      break;
    }

    case 'DELETE_SETTLEMENT': {
      store.softDeleteSettlement(entityId);
      break;
    }
  }
}

function markLocalEntitySyncState(
  mutation: MutationRecord,
  store: LocalStore,
  state: 'conflict' | 'dead'
): void {
  const { type, entityId } = mutation;

  if (type === 'UPSERT_EXPENSE') {
    const expense = store.getExpense(entityId);
    if (expense) {
      store.upsertExpense({ ...expense, _sync: state });
    }
  } else if (type === 'UPSERT_SETTLEMENT') {
    const settlement = store.getSettlement(entityId);
    if (settlement) {
      store.upsertSettlement({ ...settlement, _sync: state });
    }
  } else if (type === 'CREATE_GROUP') {
    const group = store.getGroup(entityId);
    if (group) {
      store.upsertGroup({ ...group, _sync: state });
    }
  }
}
