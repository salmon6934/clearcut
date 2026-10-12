// lib/data/queue.ts
// Persistent FIFO Mutation Queue with Compaction, State Transitions & Dead-Letter Handling

import type { StorageAdapter } from './storage-adapter';

export type MutationType =
  | 'CREATE_GROUP'
  | 'ADD_PLACEHOLDER'
  | 'JOIN_GROUP'
  | 'UPSERT_EXPENSE'
  | 'DELETE_EXPENSE'
  | 'UPSERT_SETTLEMENT'
  | 'DELETE_SETTLEMENT'
  | 'LEAVE_GROUP'
  | 'REMOVE_MEMBER'
  | 'UPDATE_MEMBER_ROLE'
  | 'TRANSFER_OWNERSHIP'
  | 'CLAIM_PLACEHOLDER';

export type MutationStatus = 'pending' | 'inflight' | 'synced' | 'conflict' | 'dead';

export interface MutationRecord<T = any> {
  id: string; // client UUID (client_mutation_id)
  entityId: string;
  type: MutationType;
  payload: T;
  status: MutationStatus;
  retryCount: number;
  lastError?: string;
  conflictDetail?: any;
  createdAt: string;
  updatedAt: string;
}

export type QueueListener = () => void;

export class MutationQueue {
  private queue: MutationRecord[] = [];
  private readonly adapter: StorageAdapter;
  private readonly listeners = new Set<QueueListener>();
  private readonly storageKey = 'mutation_queue';

  constructor(adapter: StorageAdapter) {
    this.adapter = adapter;
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const raw = this.adapter.getItem(this.storageKey);
      if (raw) {
        this.queue = JSON.parse(raw) as MutationRecord[];
        // Any item that was left 'inflight' on restart returns to 'pending'
        for (const item of this.queue) {
          if (item.status === 'inflight') {
            item.status = 'pending';
          }
        }
      }
    } catch (err) {
      console.error('[MutationQueue] Failed to load queue from storage:', err);
      this.queue = [];
    }
  }

  private persist(): void {
    try {
      this.adapter.setItem(this.storageKey, JSON.stringify(this.queue));
    } catch (err) {
      console.error('[MutationQueue] Failed to persist queue:', err);
      throw err;
    }
  }

  private emitChange(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('[MutationQueue] Listener error:', err);
      }
    }
  }

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Enqueues a new mutation with compaction logic.
   * Assigns a client UUID if not provided.
   */
  enqueue<T>(
    type: MutationType,
    entityId: string,
    payload: T,
    customId?: string
  ): MutationRecord<T> {
    const now = new Date().toISOString();
    const id = customId || crypto.randomUUID();

    // 1. Compaction: Check for existing pending mutation on the same entity
    if (type === 'UPSERT_EXPENSE' || type === 'UPSERT_SETTLEMENT') {
      const existingIdx = this.queue.findIndex(
        (m) => m.status === 'pending' && m.entityId === entityId && m.type === type
      );
      if (existingIdx !== -1) {
        // Merge into the existing pending record
        const existing = this.queue[existingIdx]!;
        existing.payload = payload;
        existing.updatedAt = now;
        this.persist();
        this.emitChange();
        return existing as MutationRecord<T>;
      }
    }

    if (type === 'DELETE_EXPENSE' || type === 'DELETE_SETTLEMENT') {
      const upsertType: MutationType =
        type === 'DELETE_EXPENSE' ? 'UPSERT_EXPENSE' : 'UPSERT_SETTLEMENT';

      const pendingUpsertIdx = this.queue.findIndex(
        (m) => m.status === 'pending' && m.entityId === entityId && m.type === upsertType
      );

      // If entity was created locally while offline and never pushed, cancel both!
      if (pendingUpsertIdx !== -1) {
        this.queue.splice(pendingUpsertIdx, 1);
        this.persist();
        this.emitChange();
        return {
          id,
          entityId,
          type,
          payload,
          status: 'synced', // Cancelled out cleanly
          retryCount: 0,
          createdAt: now,
          updatedAt: now,
        };
      }
    }

    const record: MutationRecord<T> = {
      id,
      entityId,
      type,
      payload,
      status: 'pending',
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.queue.push(record);
    this.persist();
    this.emitChange();
    return record;
  }

  /**
   * Retrieves next pending mutation in FIFO order.
   */
  peekNextPending(): MutationRecord | undefined {
    return this.queue.find((m) => m.status === 'pending');
  }

  /**
   * Transitions a pending mutation to inflight.
   */
  markInflight(id: string): boolean {
    const item = this.queue.find((m) => m.id === id);
    if (item && item.status === 'pending') {
      item.status = 'inflight';
      item.updatedAt = new Date().toISOString();
      this.persist();
      this.emitChange();
      return true;
    }
    return false;
  }

  /**
   * Marks a mutation successfully synced and removes it from active queue.
   */
  markSynced(id: string): void {
    const index = this.queue.findIndex((m) => m.id === id);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.persist();
      this.emitChange();
    }
  }

  /**
   * Handles failure: increments retry count or moves to dead letter / conflict.
   */
  markFailed(
    id: string,
    error: string,
    permanent: boolean = false,
    maxRetries: number = 5,
    conflictDetail?: any
  ): void {
    const item = this.queue.find((m) => m.id === id);
    if (!item) return;

    item.retryCount++;
    item.lastError = error;
    item.updatedAt = new Date().toISOString();

    if (permanent) {
      item.status = 'conflict';
      if (conflictDetail) {
        item.conflictDetail = conflictDetail;
      }
    } else if (item.retryCount >= maxRetries) {
      item.status = 'dead';
    } else {
      item.status = 'pending';
    }

    this.persist();
    this.emitChange();
  }

  getPendingCount(): number {
    return this.queue.filter((m) => m.status === 'pending' || m.status === 'inflight').length;
  }

  getAllItems(): MutationRecord[] {
    return [...this.queue];
  }

  getDeadLetterItems(): MutationRecord[] {
    return this.queue.filter((m) => m.status === 'dead' || m.status === 'conflict');
  }

  clearDeadLetter(id: string): void {
    const index = this.queue.findIndex((m) => m.id === id && (m.status === 'dead' || m.status === 'conflict'));
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.persist();
      this.emitChange();
    }
  }

  clear(): void {
    this.queue = [];
    this.adapter.removeItem(this.storageKey);
    this.emitChange();
  }
}
