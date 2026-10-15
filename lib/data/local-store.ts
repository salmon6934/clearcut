// lib/data/local-store.ts
// Synchronous Local-First Store with Pub/Sub & StorageAdapter Persistence

import type { StorageAdapter } from './storage-adapter';
import { runMigrations } from './migrations';
import type { Group, Member, Expense, Settlement } from './types';

export type StoreListener = () => void;

export class LocalStore {
  private groups = new Map<string, Group>();
  private members = new Map<string, Member>();
  private expenses = new Map<string, Expense>();
  private settlements = new Map<string, Settlement>();
  private listeners = new Set<StoreListener>();

  private revision = 0;
  private readonly adapter: StorageAdapter;

  constructor(adapter: StorageAdapter) {
    this.adapter = adapter;
    runMigrations(this.adapter);
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const rawGroups = this.adapter.getItem('groups');
      if (rawGroups) {
        const parsed = JSON.parse(rawGroups) as Record<string, Group>;
        this.groups = new Map(Object.entries(parsed));
      }

      const rawMembers = this.adapter.getItem('members');
      if (rawMembers) {
        const parsed = JSON.parse(rawMembers) as Record<string, Member>;
        this.members = new Map(Object.entries(parsed));
      }

      const rawExpenses = this.adapter.getItem('expenses');
      if (rawExpenses) {
        const parsed = JSON.parse(rawExpenses) as Record<string, Expense>;
        this.expenses = new Map(Object.entries(parsed));
      }

      const rawSettlements = this.adapter.getItem('settlements');
      if (rawSettlements) {
        const parsed = JSON.parse(rawSettlements) as Record<string, Settlement>;
        this.settlements = new Map(Object.entries(parsed));
      }
    } catch (err) {
      console.error('[LocalStore] Error loading state from storage:', err);
    }
  }

  private persist(key: 'groups' | 'members' | 'expenses' | 'settlements'): void {
    try {
      let data: Record<string, unknown> = {};
      switch (key) {
        case 'groups':
          data = Object.fromEntries(this.groups);
          break;
        case 'members':
          data = Object.fromEntries(this.members);
          break;
        case 'expenses':
          data = Object.fromEntries(this.expenses);
          break;
        case 'settlements':
          data = Object.fromEntries(this.settlements);
          break;
      }
      this.adapter.setItem(key, JSON.stringify(data));
    } catch (err) {
      console.error(`[LocalStore] Error persisting ${key}:`, err);
      throw err;
    }
  }

  private emitChange(): void {
    this.revision++;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('[LocalStore] Listener notification error:', err);
      }
    }
  }

  /**
   * Subscribes to store changes. Compatible with React's useSyncExternalStore.
   */
  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getRevision(): number {
    return this.revision;
  }

  // --- Groups ---

  getGroup(id: string): Group | undefined {
    return this.groups.get(id);
  }

  getAllGroups(includeArchived = false): Group[] {
    const list: Group[] = [];
    for (const g of this.groups.values()) {
      if (g.deletedAt) continue;
      if (!includeArchived && g.archivedAt) continue;
      list.push(g);
    }
    return list;
  }

  upsertGroup(group: Group): void {
    this.groups.set(group.id, group);
    this.persist('groups');
    this.emitChange();
  }

  upsertGroups(groups: Group[]): void {
    for (const g of groups) {
      this.groups.set(g.id, g);
    }
    this.persist('groups');
    this.emitChange();
  }

  deleteGroup(id: string): void {
    const existing = this.groups.get(id);
    if (existing) {
      this.groups.set(id, { ...existing, deletedAt: new Date().toISOString() });
      this.persist('groups');
      this.emitChange();
    }
  }

  /**
   * Completely removes a group and all its related members, expenses, and settlements.
   */
  hardDeleteGroup(id: string): void {
    this.groups.delete(id);
    for (const [mId, m] of this.members.entries()) {
      if (m.groupId === id) this.members.delete(mId);
    }
    for (const [eId, e] of this.expenses.entries()) {
      if (e.groupId === id) this.expenses.delete(eId);
    }
    for (const [sId, s] of this.settlements.entries()) {
      if (s.groupId === id) this.settlements.delete(sId);
    }
    this.persist('groups');
    this.persist('members');
    this.persist('expenses');
    this.persist('settlements');
    this.emitChange();
  }

  hardDeleteMember(id: string): void {
    if (this.members.delete(id)) {
      this.persist('members');
      this.emitChange();
    }
  }

  hardDeleteExpense(id: string): void {
    if (this.expenses.delete(id)) {
      this.persist('expenses');
      this.emitChange();
    }
  }

  hardDeleteSettlement(id: string): void {
    if (this.settlements.delete(id)) {
      this.persist('settlements');
      this.emitChange();
    }
  }

  getAllExpenses(): Expense[] {
    return Array.from(this.expenses.values());
  }

  getAllSettlements(): Settlement[] {
    return Array.from(this.settlements.values());
  }

  getAllMembers(): Member[] {
    return Array.from(this.members.values());
  }

  clearAllData(): void {
    this.groups.clear();
    this.members.clear();
    this.expenses.clear();
    this.settlements.clear();
    this.persist('groups');
    this.persist('members');
    this.persist('expenses');
    this.persist('settlements');
    this.emitChange();
  }

  // --- Members ---

  getMember(id: string): Member | undefined {
    return this.members.get(id);
  }

  getGroupMembers(groupId: string, includeLeft = false): Member[] {
    const result: Member[] = [];
    for (const m of this.members.values()) {
      if (m.groupId === groupId) {
        if (!includeLeft && m.leftAt) continue;
        result.push(m);
      }
    }
    return result;
  }

  upsertMember(member: Member): void {
    this.members.set(member.id, member);
    this.persist('members');
    this.emitChange();
  }

  upsertMembers(members: Member[]): void {
    for (const m of members) {
      this.members.set(m.id, m);
    }
    this.persist('members');
    this.emitChange();
  }

  // --- Expenses ---

  getExpense(id: string): Expense | undefined {
    return this.expenses.get(id);
  }

  getGroupExpenses(groupId: string, includeDeleted = false): Expense[] {
    const result: Expense[] = [];
    for (const exp of this.expenses.values()) {
      if (exp.groupId === groupId) {
        if (!includeDeleted && exp.deletedAt) continue;
        result.push(exp);
      }
    }
    // Sort descending by expenseDate, then createdAt
    return result.sort((a, b) => {
      const dateA = a.expenseDate || a.createdAt || '';
      const dateB = b.expenseDate || b.createdAt || '';
      return dateB.localeCompare(dateA);
    });
  }

  upsertExpense(expense: Expense): void {
    this.expenses.set(expense.id, expense);
    this.persist('expenses');
    this.emitChange();
  }

  upsertExpenses(expenses: Expense[]): void {
    for (const exp of expenses) {
      this.expenses.set(exp.id, exp);
    }
    this.persist('expenses');
    this.emitChange();
  }

  softDeleteExpense(id: string, deletedAt = new Date().toISOString()): void {
    const exp = this.expenses.get(id);
    if (exp) {
      this.expenses.set(id, { ...exp, deletedAt, updatedAt: deletedAt });
      this.persist('expenses');
      this.emitChange();
    }
  }

  // --- Settlements ---

  getSettlement(id: string): Settlement | undefined {
    return this.settlements.get(id);
  }

  getGroupSettlements(groupId: string, includeDeleted = false): Settlement[] {
    const result: Settlement[] = [];
    for (const s of this.settlements.values()) {
      if (s.groupId === groupId) {
        if (!includeDeleted && s.deletedAt) continue;
        result.push(s);
      }
    }
    return result.sort((a, b) => {
      const dateA = a.settledOn || a.createdAt || '';
      const dateB = b.settledOn || b.createdAt || '';
      return dateB.localeCompare(dateA);
    });
  }

  upsertSettlement(settlement: Settlement): void {
    this.settlements.set(settlement.id, settlement);
    this.persist('settlements');
    this.emitChange();
  }

  upsertSettlements(settlements: Settlement[]): void {
    for (const s of settlements) {
      this.settlements.set(s.id, s);
    }
    this.persist('settlements');
    this.emitChange();
  }

  softDeleteSettlement(id: string, deletedAt = new Date().toISOString()): void {
    const st = this.settlements.get(id);
    if (st) {
      this.settlements.set(id, { ...st, deletedAt, updatedAt: deletedAt });
      this.persist('settlements');
      this.emitChange();
    }
  }

  /**
   * Resets entire store cache and persistence.
   */
  clear(): void {
    this.groups.clear();
    this.members.clear();
    this.expenses.clear();
    this.settlements.clear();
    this.adapter.removeItem('groups');
    this.adapter.removeItem('members');
    this.adapter.removeItem('expenses');
    this.adapter.removeItem('settlements');
    this.emitChange();
  }
}
