// lib/data/repository.ts
// Transactional Client Domain Repository Layer with Write-Local-First Semantics

import type { LocalStore } from './local-store';
import type { MutationQueue } from './queue';
import type { SyncLifecycleManager } from '../sync/lifecycle';
import { validateExpense } from '../engine/validate';
import { computeBalances } from '../engine/balances';
import { EngineError } from '../engine/errors';
import { haptics } from '../native/haptics';
import { supabase } from '../supabase';
import type {
  Group,
  Member,
  Expense,
  Settlement,
  CreateGroupDraft,
  ExpenseDraft,
  SettlementDraft,
} from './types';

export class DomainRepository {
  constructor(
    public readonly store: LocalStore,
    public readonly queue: MutationQueue,
    public readonly syncManager?: SyncLifecycleManager
  ) {}

  /**
   * Synchronously creates a group and assigns the owner member locally,
   * then enqueues CREATE_GROUP for background replication.
   */
  createGroup(
    draft: CreateGroupDraft,
    currentUserId: string,
    displayName = 'You'
  ): { group: Group; member: Member } {
    const trimmedName = draft.name.trim();
    if (!trimmedName || trimmedName.length > 80) {
      throw new EngineError('VALIDATION_FAILED', 'Group name must be between 1 and 80 characters');
    }

    const currency = draft.currency.toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new EngineError('VALIDATION_FAILED', 'Invalid currency code format');
    }

    const now = new Date().toISOString();
    const groupId = crypto.randomUUID();
    const ownerMemberId = crypto.randomUUID();
    const inviteChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let inviteCode = '';
    for (let i = 0; i < 6; i++) {
      inviteCode += inviteChars.charAt(Math.floor(Math.random() * inviteChars.length));
    }

    const group: Group = {
      id: groupId,
      name: trimmedName,
      type: draft.type || 'trip',
      currency,
      inviteCode,
      createdBy: currentUserId,
      version: 1,
      createdAt: now,
      updatedAt: now,
      _sync: 'pending',
    };

    const member: Member = {
      id: ownerMemberId,
      groupId,
      userId: currentUserId,
      displayName: displayName.trim() || 'You',
      role: 'owner',
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
      _sync: 'pending',
    };

    // 1. Synchronous local state write
    this.store.upsertGroup(group);
    this.store.upsertMember(member);

    // 2. Enqueue mutation
    this.queue.enqueue('CREATE_GROUP', groupId, { group, ownerMemberId });

    // 3. Fire-and-forget native haptics & background sync
    haptics.tap().catch(() => {});
    this.syncManager?.kick('create_group').catch(() => {});

    return { group, member };
  }

  /**
   * Archives a group, marking it read-only and hiding it from default dashboard list.
   */
  archiveGroup(groupId: string): Group | null {
    const existing = this.store.getGroup(groupId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: Group = {
      ...existing,
      archivedAt: now,
      version: existing.version + 1,
      updatedAt: now,
      _sync: 'pending',
    };

    this.store.upsertGroup(updated);
    haptics.warning().catch(() => {});
    return updated;
  }

  /**
   * Unarchives a previously archived group, restoring write operations.
   */
  unarchiveGroup(groupId: string): Group | null {
    const existing = this.store.getGroup(groupId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: Group = {
      ...existing,
      archivedAt: null,
      version: existing.version + 1,
      updatedAt: now,
      _sync: 'pending',
    };

    this.store.upsertGroup(updated);
    haptics.success().catch(() => {});
    return updated;
  }

  /**
   * Synchronously validates and saves a new expense,
   * then enqueues UPSERT_EXPENSE for background replication.
   */
  addExpense(draft: ExpenseDraft, currentUserId: string): Expense {
    const now = new Date().toISOString();
    const id = draft.id || crypto.randomUUID();

    const expense: Expense = {
      id,
      groupId: draft.groupId,
      title: draft.title.trim(),
      notes: draft.notes || null,
      amountMinor: draft.amountMinor,
      currency: draft.currency.toUpperCase(),
      category: draft.category || null,
      expenseDate: draft.expenseDate || now.split('T')[0] || now,
      splitType: draft.splitType,
      splits: draft.splits,
      receiptPath: draft.receiptPath || null,
      createdBy: currentUserId,
      version: 1,
      createdAt: now,
      updatedAt: now,
      _sync: 'pending',
    };

    // Mathematical & Invariant validation (throws if invalid)
    validateExpense(expense);

    // 1. Synchronous local store write
    this.store.upsertExpense(expense);

    // 2. Enqueue mutation
    this.queue.enqueue('UPSERT_EXPENSE', id, { expense, baseVersion: 1 });

    // 3. Fire-and-forget native feedback & background sync
    haptics.tap().catch(() => {});
    this.syncManager?.kick('add_expense').catch(() => {});

    return expense;
  }

  /**
   * Synchronously edits an existing expense with optimistic version bump.
   */
  editExpense(draft: ExpenseDraft, currentUserId: string): Expense {
    if (!draft.id) {
      throw new EngineError('VALIDATION_FAILED', 'Expense ID is required to edit');
    }

    const existing = this.store.getExpense(draft.id);
    if (!existing) {
      throw new EngineError('EXPENSE_NOT_FOUND', `Expense ${draft.id} not found`);
    }

    const now = new Date().toISOString();
    const newVersion = existing.version + 1;

    const updated: Expense = {
      ...existing,
      title: draft.title.trim(),
      notes: draft.notes || null,
      amountMinor: draft.amountMinor,
      currency: draft.currency.toUpperCase(),
      category: draft.category || null,
      expenseDate: draft.expenseDate || existing.expenseDate,
      splitType: draft.splitType,
      splits: draft.splits,
      receiptPath: draft.receiptPath !== undefined ? draft.receiptPath : existing.receiptPath,
      version: newVersion,
      updatedAt: now,
      _sync: 'pending',
    };

    validateExpense(updated);

    this.store.upsertExpense(updated);
    this.queue.enqueue('UPSERT_EXPENSE', draft.id, {
      expense: updated,
      baseVersion: existing.version,
    });

    haptics.tap().catch(() => {});
    this.syncManager?.kick('edit_expense').catch(() => {});

    return updated;
  }

  /**
   * Soft deletes an expense locally and enqueues DELETE_EXPENSE.
   */
  deleteExpense(expenseId: string): void {
    const existing = this.store.getExpense(expenseId);
    if (!existing) return;

    this.store.softDeleteExpense(expenseId);
    this.queue.enqueue('DELETE_EXPENSE', expenseId, {
      expenseId,
      groupId: existing.groupId,
      baseVersion: existing.version,
    });

    haptics.tap().catch(() => {});
    this.syncManager?.kick('delete_expense').catch(() => {});
  }

  /**
   * Restores a soft-deleted expense locally, cancels any pending DELETE_EXPENSE,
   * bumps version, and enqueues UPSERT_EXPENSE to clear deleted_at on remote.
   */
  restoreExpense(expenseId: string): Expense | null {
    const existing = this.store.getExpense(expenseId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const restored: Expense = {
      ...existing,
      deletedAt: null,
      version: existing.version + 1,
      updatedAt: now,
      _sync: 'pending',
    };

    this.store.upsertExpense(restored);

    // Cancel pending DELETE_EXPENSE in queue if it hasn't been pushed yet
    const pendingDelete = this.queue
      .getAllItems()
      .find((m) => m.entityId === expenseId && m.type === 'DELETE_EXPENSE');
    if (pendingDelete) {
      this.queue.markSynced(pendingDelete.id);
    }

    this.queue.enqueue('UPSERT_EXPENSE', expenseId, {
      expense: restored,
      baseVersion: existing.version,
    });

    haptics.tap().catch(() => {});
    this.syncManager?.kick('restore_expense').catch(() => {});

    return restored;
  }

  /**
   * Synchronously records a settlement transaction locally and enqueues UPSERT_SETTLEMENT.
   */
  addSettlement(draft: SettlementDraft, currentUserId: string): Settlement {
    if (draft.fromMemberId === draft.toMemberId) {
      throw new EngineError('VALIDATION_FAILED', 'Payer and payee must be different members');
    }
    if (!Number.isInteger(draft.amountMinor) || draft.amountMinor <= 0) {
      throw new EngineError('VALIDATION_FAILED', 'Settlement amount must be positive integer');
    }

    const now = new Date().toISOString();
    const id = draft.id || crypto.randomUUID();

    const settlement: Settlement = {
      id,
      groupId: draft.groupId,
      fromMemberId: draft.fromMemberId,
      toMemberId: draft.toMemberId,
      amountMinor: draft.amountMinor,
      method: draft.method || 'cash',
      note: draft.note || null,
      settledOn: draft.settledOn || now.split('T')[0] || now,
      createdBy: currentUserId,
      createdAt: now,
      updatedAt: now,
      _sync: 'pending',
    };

    this.store.upsertSettlement(settlement);
    this.queue.enqueue('UPSERT_SETTLEMENT', id, { settlement });

    haptics.tap().catch(() => {});
    this.syncManager?.kick('add_settlement').catch(() => {});

    return settlement;
  }

  /**
   * Soft deletes a settlement locally and enqueues DELETE_SETTLEMENT.
   */
  deleteSettlement(settlementId: string): void {
    const existing = this.store.getSettlement(settlementId);
    if (!existing) return;

    this.store.softDeleteSettlement(settlementId);
    this.queue.enqueue('DELETE_SETTLEMENT', settlementId, {
      settlementId,
      groupId: existing.groupId,
    });

    haptics.tap().catch(() => {});
    this.syncManager?.kick('delete_settlement').catch(() => {});
  }

  /**
   * Adds a placeholder member to a group without requiring a Supabase auth account.
   */
  addPlaceholderMember(groupId: string, displayName: string): Member {
    const name = displayName.trim();
    if (!name || name.length > 60) {
      throw new EngineError('VALIDATION_FAILED', 'Display name must be between 1 and 60 characters');
    }

    // Check unique name locally among active members
    const existingMembers = this.store.getGroupMembers(groupId, false);
    const duplicate = existingMembers.some(
      (m) => m.displayName.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      throw new EngineError('MEMBER_NAME_TAKEN', `A member named "${name}" already exists in this group`);
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const member: Member = {
      id,
      groupId,
      userId: null, // Placeholder member has no linked user account
      displayName: name,
      role: 'member',
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
      _sync: 'pending',
    };

    this.store.upsertMember(member);
    this.queue.enqueue('ADD_PLACEHOLDER', id, { member });

    haptics.tap().catch(() => {});
    this.syncManager?.kick('add_placeholder').catch(() => {});

    return member;
  }

  /**
   * Joins a group by invite code.
   */
  joinGroup(inviteCode: string, currentUserId: string): string {
    const memberId = crypto.randomUUID();
    this.queue.enqueue('JOIN_GROUP', inviteCode, { inviteCode, memberId });

    haptics.tap().catch(() => {});
    this.syncManager?.kick('join_group').catch(() => {});

    return memberId;
  }

  /**
   * Removes a member from a group (US-20). Requires member net balance to be 0.
   */
  removeMember(groupId: string, memberId: string): Member {
    const member = this.store.getMember(memberId);
    if (!member || member.groupId !== groupId || member.leftAt) {
      throw new EngineError('MEMBER_NOT_FOUND', 'Member not found or already left');
    }

    // Check zero-balance invariant locally
    const expenses = this.store.getGroupExpenses(groupId, false);
    const settlements = this.store.getGroupSettlements(groupId, false);
    const balances = computeBalances(expenses, settlements);
    const net = balances.get(memberId) ?? 0;

    if (net !== 0) {
      throw new EngineError(
        'MEMBER_HAS_BALANCE',
        `Cannot remove member: member has outstanding balance of ${net}`
      );
    }

    // Check sole owner constraint
    if (member.role === 'owner') {
      const activeMembers = this.store.getGroupMembers(groupId, false);
      const otherOwners = activeMembers.filter((m) => m.role === 'owner' && m.id !== memberId);
      if (otherOwners.length === 0 && activeMembers.length > 1) {
        throw new EngineError(
          'SOLE_OWNER',
          'Cannot remove sole group owner without transferring ownership first'
        );
      }
    }

    const now = new Date().toISOString();
    const updatedMember: Member = {
      ...member,
      leftAt: now,
      updatedAt: now,
      _sync: 'pending',
    };

    this.store.upsertMember(updatedMember);
    this.queue.enqueue('REMOVE_MEMBER', memberId, { groupId, memberId });

    haptics.tap().catch(() => {});
    this.syncManager?.kick('remove_member').catch(() => {});

    return updatedMember;
  }

  /**
   * Updates a member's role (admin or member) in a group.
   */
  updateMemberRole(groupId: string, memberId: string, role: 'admin' | 'member'): Member {
    const member = this.store.getMember(memberId);
    if (!member || member.groupId !== groupId || member.leftAt) {
      throw new EngineError('MEMBER_NOT_FOUND', 'Member not found or has left');
    }

    const now = new Date().toISOString();
    const updated: Member = {
      ...member,
      role,
      updatedAt: now,
      _sync: 'pending',
    };

    this.store.upsertMember(updated);
    this.queue.enqueue('UPDATE_MEMBER_ROLE', memberId, { groupId, memberId, role });

    haptics.tap().catch(() => {});
    this.syncManager?.kick('update_member_role').catch(() => {});

    return updated;
  }

  /**
   * Transfers ownership of a group to another member.
   */
  transferOwnership(
    groupId: string,
    currentOwnerMemberId: string,
    newOwnerMemberId: string
  ): { previousOwner: Member; newOwner: Member } {
    const prevOwner = this.store.getMember(currentOwnerMemberId);
    const newOwner = this.store.getMember(newOwnerMemberId);

    if (!prevOwner || !newOwner || prevOwner.groupId !== groupId || newOwner.groupId !== groupId) {
      throw new EngineError('MEMBER_NOT_FOUND', 'Owner or target member not found in group');
    }

    const now = new Date().toISOString();
    const updatedPrev: Member = {
      ...prevOwner,
      role: 'admin',
      updatedAt: now,
      _sync: 'pending',
    };

    const updatedNew: Member = {
      ...newOwner,
      role: 'owner',
      updatedAt: now,
      _sync: 'pending',
    };

    this.store.upsertMember(updatedPrev);
    this.store.upsertMember(updatedNew);

    this.queue.enqueue('TRANSFER_OWNERSHIP', groupId, {
      groupId,
      currentOwnerMemberId,
      newOwnerMemberId,
    });

    haptics.success().catch(() => {});
    this.syncManager?.kick('transfer_ownership').catch(() => {});

    return { previousOwner: updatedPrev, newOwner: updatedNew };
  }

  /**
   * Leaves a group (US-20). Requires member net balance to be 0 and non-sole owner.
   */
  leaveGroup(groupId: string, memberId: string): void {
    const member = this.store.getMember(memberId);
    if (!member || member.groupId !== groupId || member.leftAt) {
      throw new EngineError('MEMBER_NOT_FOUND', 'Member not found or already left');
    }

    const expenses = this.store.getGroupExpenses(groupId, false);
    const settlements = this.store.getGroupSettlements(groupId, false);
    const balances = computeBalances(expenses, settlements);
    const net = balances.get(memberId) ?? 0;

    if (net !== 0) {
      throw new EngineError(
        'MEMBER_HAS_BALANCE',
        `Must settle balance of ${net} before leaving group`
      );
    }

    if (member.role === 'owner') {
      const activeMembers = this.store.getGroupMembers(groupId, false);
      const otherOwners = activeMembers.filter((m) => m.role === 'owner' && m.id !== memberId);
      if (otherOwners.length === 0 && activeMembers.length > 1) {
        throw new EngineError(
          'SOLE_OWNER',
          'Must transfer ownership before leaving group'
        );
      }
    }

    const now = new Date().toISOString();
    const updatedMember: Member = {
      ...member,
      leftAt: now,
      updatedAt: now,
      _sync: 'pending',
    };

    this.store.upsertMember(updatedMember);
    this.queue.enqueue('LEAVE_GROUP', groupId, { groupId, memberId });

    haptics.tap().catch(() => {});
    this.syncManager?.kick('leave_group').catch(() => {});
  }

  /**
   * Generates or fetches an active claim token for a placeholder member (US-04).
   */
  async generatePlaceholderClaim(groupId: string, memberId: string): Promise<string> {
    try {
      const { data, error } = await supabase.rpc('generate_placeholder_claim_v1', {
        p_group_id: groupId,
        p_member_id: memberId,
      });
      if (error) throw error;
      return data?.claim_token || '';
    } catch {
      // Fallback in offline or test mode: generate temporary client token
      return `claim_${memberId.slice(0, 8)}`;
    }
  }

  /**
   * Claims a placeholder member profile using a claim token (US-04).
   */
  claimPlaceholder(claimToken: string): void {
    const cleanToken = claimToken.trim();
    if (!cleanToken) {
      throw new EngineError('VALIDATION_FAILED', 'Claim token is required');
    }

    this.queue.enqueue('CLAIM_PLACEHOLDER', cleanToken, { claimToken: cleanToken });
    haptics.success().catch(() => {});
    this.syncManager?.kick('claim_placeholder').catch(() => {});
  }
}
