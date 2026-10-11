// tests/data/queue.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MemoryStorage, LocalStorageAdapter } from '../../lib/data/storage-adapter';
import { MutationQueue } from '../../lib/data/queue';

describe('T-1.6.3: Mutation Queue with Compaction & Idempotency Keys', () => {
  function createQueue() {
    const rawStorage = new MemoryStorage();
    const adapter = new LocalStorageAdapter('queue_user', rawStorage);
    return { queue: new MutationQueue(adapter), adapter, rawStorage };
  }

  it('enforces FIFO ordering with state transitions (pending -> inflight -> synced)', () => {
    const { queue } = createQueue();

    const m1 = queue.enqueue('UPSERT_EXPENSE', 'exp-1', { amount: 100 });
    const m2 = queue.enqueue('UPSERT_SETTLEMENT', 'stl-1', { amount: 50 });

    expect(queue.getPendingCount()).toBe(2);
    expect(queue.peekNextPending()?.id).toBe(m1.id);

    // Transition m1 to inflight
    const inflightSuccess = queue.markInflight(m1.id);
    expect(inflightSuccess).toBe(true);

    // Next pending is now m2
    expect(queue.peekNextPending()?.id).toBe(m2.id);

    // Mark m1 as synced (removes from active queue)
    queue.markSynced(m1.id);
    expect(queue.getPendingCount()).toBe(1);
    expect(queue.peekNextPending()?.id).toBe(m2.id);

    queue.markInflight(m2.id);
    queue.markSynced(m2.id);
    expect(queue.getPendingCount()).toBe(0);
  });

  it('survives restart and resets any abandoned inflight items back to pending', () => {
    const rawStorage = new MemoryStorage();
    const adapter = new LocalStorageAdapter('queue_user', rawStorage);

    const queue1 = new MutationQueue(adapter);
    const m1 = queue1.enqueue('UPSERT_EXPENSE', 'exp-1', { title: 'Lunch' });
    queue1.markInflight(m1.id);

    // Simulate app restart by constructing a new MutationQueue instance on same storage
    const queue2 = new MutationQueue(adapter);
    expect(queue2.getPendingCount()).toBe(1);
    const item = queue2.peekNextPending();
    expect(item?.id).toBe(m1.id);
    expect(item?.status).toBe('pending');
  });

  it('compacts consecutive pending UPSERTs on the same entity into the latest payload', () => {
    const { queue } = createQueue();

    const m1 = queue.enqueue('UPSERT_EXPENSE', 'exp-1', { amount: 100, title: 'Draft' });
    expect(queue.getPendingCount()).toBe(1);

    // User edits draft offline before it could be pushed
    const m2 = queue.enqueue('UPSERT_EXPENSE', 'exp-1', { amount: 150, title: 'Final' });

    expect(queue.getPendingCount()).toBe(1);
    expect(m2.id).toBe(m1.id);
    expect(queue.peekNextPending()?.payload).toEqual({ amount: 150, title: 'Final' });
  });

  it('cancels unsynced pending UPSERT when followed by DELETE of the same entity', () => {
    const { queue } = createQueue();

    queue.enqueue('UPSERT_EXPENSE', 'exp-local-1', { title: 'Accidental expense' });
    expect(queue.getPendingCount()).toBe(1);

    // User deletes the locally created expense before it was ever pushed
    queue.enqueue('DELETE_EXPENSE', 'exp-local-1', {});

    // Both are eliminated from the active queue!
    expect(queue.getPendingCount()).toBe(0);
  });

  it('handles permanent failures and max-retry dead letter escalation', () => {
    const { queue } = createQueue();

    const m1 = queue.enqueue('UPSERT_EXPENSE', 'exp-1', {});
    const m2 = queue.enqueue('UPSERT_EXPENSE', 'exp-2', {});

    // Mark m1 failed with permanent conflict (e.g. OCC PT409)
    queue.markInflight(m1.id);
    queue.markFailed(m1.id, 'OCC Version mismatch', true);

    expect(queue.getDeadLetterItems()).toHaveLength(1);
    expect(queue.getDeadLetterItems()[0]?.status).toBe('conflict');

    // Fail m2 with transient error 5 times -> moves to dead letter
    queue.markInflight(m2.id);
    for (let i = 0; i < 4; i++) {
      queue.markFailed(m2.id, 'Network timeout', false, 5);
      queue.markInflight(m2.id);
    }
    queue.markFailed(m2.id, 'Network timeout', false, 5);

    expect(queue.getDeadLetterItems()).toHaveLength(2);
    expect(queue.getDeadLetterItems()[1]?.status).toBe('dead');

    // Clear dead letter
    queue.clearDeadLetter(m1.id);
    expect(queue.getDeadLetterItems()).toHaveLength(1);
  });

  it('notifies subscribers on queue modifications', () => {
    const { queue } = createQueue();
    const subscriber = vi.fn();
    const unsubscribe = queue.subscribe(subscriber);

    queue.enqueue('CREATE_GROUP', 'grp-1', { name: 'Trip' });
    expect(subscriber).toHaveBeenCalledTimes(1);

    unsubscribe();
    queue.enqueue('CREATE_GROUP', 'grp-2', { name: 'Home' });
    expect(subscriber).toHaveBeenCalledTimes(1);
  });
});
