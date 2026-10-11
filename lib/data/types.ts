import type { Split } from '../engine/split';

export type SyncState = 'synced' | 'pending' | 'conflict' | 'dead';

export type GroupType = 'trip' | 'home' | 'couple' | 'other';
export type MemberRole = 'owner' | 'admin' | 'member';
export type SplitType = 'equal' | 'exact' | 'percentage' | 'shares';
export type SettlementMethod = 'cash' | 'upi' | 'venmo' | 'paypal' | 'bank' | 'other';

export interface Profile {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  defaultCurrency: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Group {
  id: string;
  name: string;
  type: GroupType;
  currency: string;
  inviteCode?: string;
  createdBy?: string;
  version: number;
  archivedAt?: string | null;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  _sync?: SyncState;
}

export interface Member {
  id: string;
  groupId: string;
  userId: string | null; // null indicates placeholder member
  displayName: string;
  role: MemberRole;
  joinedAt?: string;
  leftAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  _sync?: SyncState;
}

export interface Expense {
  id: string;
  groupId: string;
  title: string;
  notes?: string | null;
  amountMinor: number;
  currency: string;
  category?: string | null;
  expenseDate: string;
  splitType: SplitType;
  splits: Split[];
  createdBy: string;
  version: number;
  clientMutationId?: string;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  _sync?: SyncState;
}

export interface Settlement {
  id: string;
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  method?: SettlementMethod | null;
  note?: string | null;
  settledOn: string;
  createdBy?: string;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  _sync?: SyncState;
}

export interface ActivityItem {
  id: string;
  groupId: string;
  actorMemberId: string;
  type:
    | 'group_created'
    | 'member_added'
    | 'member_left'
    | 'member_removed'
    | 'expense_added'
    | 'expense_edited'
    | 'expense_deleted'
    | 'expense_restored'
    | 'settlement_added'
    | 'settlement_deleted';
  entityId?: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface SuggestedPayment {
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  currency: string;
}

export interface CreateGroupDraft {
  name: string;
  type?: GroupType;
  currency: string;
}

export interface ExpenseDraft {
  id?: string;
  groupId: string;
  title: string;
  notes?: string | null;
  amountMinor: number;
  currency: string;
  category?: string | null;
  expenseDate?: string;
  splitType: SplitType;
  splits: Split[];
}

export interface SettlementDraft {
  id?: string;
  groupId: string;
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  method?: SettlementMethod | null;
  note?: string | null;
  settledOn?: string;
}

