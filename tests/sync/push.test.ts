// tests/sync/push.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drainQueue, classifyError, computeExponentialBackoffMs, resetBackoff } from '../../lib/sync/push';
import { MutationQueue } from '../../lib/data/queue';
import { LocalStore } from '../../lib/data/local-store';
import { LocalStorageAdapter, MemoryStorage } from '../../lib/data/storage-adapter';
import type { Expense, Group } from '../../lib/data/types';

describe('T-1.7.1: Push Drain Engine with Error Classification', () => {
  beforeEach(() => {
    resetBackoff();
  });

  function setup() {
    const rawStorage = new MemoryStorage();
    const adapter = new LocalStorageAdapter('test_user', rawStorage);
    const store = new LocalStore(adapter);
    const queue = new MutationQueue(adapter);
    return { store, queue, adapter };
  }

  it('correctly classifies error codes according to specification', () => {
    expect(classifyError(null).type).toBe('SUCCESS');

    expect(classifyError({ code: 'PT409', message: 'EXPENSE_CONFLICT' }).type).toBe('CONFLICT');
    expect(classifyError({ status: 409, message: 'Conflict' }).type).toBe('CONFLICT');

    expect(classifyError({ code: 'PT401', message: 'AUTH_REQUIRED' }).type).toBe('UNAUTHORIZED');
    expect(classifyError({ status: 401 }).type).toBe('UNAUTHORIZED');

    expect(classifyError({ code: 'PT400', message: 'VALIDATION_FAILED' }).type).toBe('PERMANENT');
    expect(classifyError({ status: 403, message: 'FORBIDDEN' }).type).toBe('PERMANENT');

    expect(classifyError({ status: 500, message: 'Internal Server Error' }).type).toBe('TRANSIENT');
    expect(classifyError(new Error('Failed to fetch')).type).toBe('TRANSIENT');
  });

  it('computes exponential backoff accurately', () => {
    expect(computeExponentialBackoffMs(1)).toBe(4000);
    expect(computeExponentialBackoffMs(2)).toBe(8000);
    expect(computeExponentialBackoffMs(5)).toBe(60000); // capped at 60s
  });

  it('successfully drains queue and updates local store entity to synced', async () => {
    const { store, queue } = setup();

    const expense: Expense = {
      id: 'exp-1',
      groupId: 'grp-1',
      title: 'Coffee',
      amountMinor: 35000,
      currency: 'INR',
      expenseDate: '2026-10-10',
      splitType: 'equal',
      splits: [{ memberId: 'm-1', paidMinor: 35000, owedMinor: 35000 }],
      createdBy: 'u-1',
      version: 1,
      _sync: 'pending',
    };
    store.upsertExpense(expense);

    queue.enqueue('UPSERT_EXPENSE', 'exp-1', { expense, baseVersion: 1 });

    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: { expense: { id: 'exp-1', version: 2 }, replayed: false },
        error: null,
      }),
      auth: { refreshSession: vi.fn() },
    };

    const res = await drainQueue(queue, store, mockSupabase as any);

    expect(res.processed).toBe(1);
    expect(res.synced).toBe(1);
    expect(queue.getPendingCount()).toBe(0);

    const updatedExpense = store.getExpense('exp-1');
    expect(updatedExpense?._sync).toBe('synced');
    expect(updatedExpense?.version).toBe(2);
  });

  it('handles 409 conflict by marking entity in conflict without stalling subsequent mutations', async () => {
    const { store, queue } = setup();

    // Exp-1 will conflict (PT409)
    const exp1: Expense = {
      id: 'exp-1',
      groupId: 'grp-1',
      title: 'Taxi',
      amountMinor: 50000,
      currency: 'INR',
      expenseDate: '2026-10-10',
      splitType: 'equal',
      splits: [],
      createdBy: 'u-1',
      version: 1,
      _sync: 'pending',
    };
    // Exp-2 will succeed
    const exp2: Expense = {
      id: 'exp-2',
      groupId: 'grp-1',
      title: 'Snacks',
      amountMinor: 10000,
      currency: 'INR',
      expenseDate: '2026-10-10',
      splitType: 'equal',
      splits: [],
      createdBy: 'u-1',
      version: 1,
      _sync: 'pending',
    };
    store.upsertExpense(exp1);
    store.upsertExpense(exp2);

    queue.enqueue('UPSERT_EXPENSE', 'exp-1', { expense: exp1 });
    queue.enqueue('UPSERT_EXPENSE', 'exp-2', { expense: exp2 });

    const mockSupabase = {
      rpc: vi.fn().mockImplementation((fn: string, params: any) => {
        if (params.p_expense.id === 'exp-1') {
          return Promise.resolve({
            data: null,
            error: { code: 'PT409', message: 'EXPENSE_CONFLICT: Version mismatch', details: '{"version":2}' },
          });
        }
        return Promise.resolve({
          data: { expense: { id: 'exp-2', version: 2 } },
          error: null,
        });
      }),
      auth: { refreshSession: vi.fn() },
    };

    const res = await drainQueue(queue, store, mockSupabase as any);

    expect(res.processed).toBe(2);
    expect(res.conflicts).toBe(1);
    expect(res.synced).toBe(1);

    // exp-1 is marked as conflict
    expect(store.getExpense('exp-1')?._sync).toBe('conflict');
    // exp-2 successfully synced
    expect(store.getExpense('exp-2')?._sync).toBe('synced');
  });

  it('handles poison pill (400 validation error) by moving to dead letter without blocking queue', async () => {
    const { store, queue } = setup();

    const badExpense: Expense = {
      id: 'bad-1',
      groupId: 'grp-1',
      title: 'Bad',
      amountMinor: 0,
      currency: 'INR',
      expenseDate: '2026-10-10',
      splitType: 'equal',
      splits: [],
      createdBy: 'u-1',
      version: 1,
      _sync: 'pending',
    };
    const goodExpense: Expense = {
      id: 'good-1',
      groupId: 'grp-1',
      title: 'Good',
      amountMinor: 10000,
      currency: 'INR',
      expenseDate: '2026-10-10',
      splitType: 'equal',
      splits: [],
      createdBy: 'u-1',
      version: 1,
      _sync: 'pending',
    };
    store.upsertExpense(badExpense);
    store.upsertExpense(goodExpense);

    queue.enqueue('UPSERT_EXPENSE', 'bad-1', { expense: badExpense });
    queue.enqueue('UPSERT_EXPENSE', 'good-1', { expense: goodExpense });

    const mockSupabase = {
      rpc: vi.fn().mockImplementation((fn: string, params: any) => {
        if (params.p_expense.id === 'bad-1') {
          return Promise.resolve({
            data: null,
            error: { code: 'PT400', message: 'VALIDATION_FAILED: Amount must be positive' },
          });
        }
        return Promise.resolve({
          data: { expense: { id: 'good-1', version: 2 } },
          error: null,
        });
      }),
      auth: { refreshSession: vi.fn() },
    };

    const res = await drainQueue(queue, store, mockSupabase as any);

    expect(res.processed).toBe(2);
    expect(res.dead).toBe(1);
    expect(res.synced).toBe(1);

    expect(store.getExpense('bad-1')?._sync).toBe('dead');
    expect(queue.getDeadLetterItems()).toHaveLength(1);
    expect(store.getExpense('good-1')?._sync).toBe('synced');
  });

  it('halts drain and applies backoff when transient network failure occurs', async () => {
    const { store, queue } = setup();

    queue.enqueue('CREATE_GROUP', 'grp-1', {
      group: { id: 'grp-1', name: 'Trip', type: 'trip', currency: 'INR' },
      ownerMemberId: 'm-1',
    });

    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { status: 503, message: 'Service Unavailable' },
      }),
      auth: { refreshSession: vi.fn() },
    };

    const res = await drainQueue(queue, store, mockSupabase as any);

    expect(res.halted).toBe(true);
    expect(res.backoffMs).toBeGreaterThan(0);
    expect(queue.getPendingCount()).toBe(1); // Still pending for retry
  });

  it('synchronizes inviteCode on CREATE_GROUP and populates group and members on JOIN_GROUP', async () => {
    const { store, queue } = setup();

    // 1. Test CREATE_GROUP
    const group: Group = {
      id: 'grp-test-1',
      name: 'Goa Trip',
      type: 'trip',
      currency: 'INR',
      inviteCode: 'GOA123',
      createdBy: 'u-1',
      version: 1,
      createdAt: '2026-10-10',
      updatedAt: '2026-10-10',
      _sync: 'pending',
    };
    store.upsertGroup(group);

    queue.enqueue('CREATE_GROUP', 'grp-test-1', {
      group,
      ownerMemberId: 'm-owner-1',
    });

    const mockSupabase = {
      rpc: vi.fn().mockImplementation((fn: string, params: any) => {
        if (fn === 'create_group_v1') {
          expect(params.p_group.invite_code).toBe('GOA123');
          return Promise.resolve({
            data: {
              group: { ...params.p_group, invite_code: 'GOA123' },
              member: { id: params.p_owner_member_id, group_id: params.p_group.id },
            },
            error: null,
          });
        }
        if (fn === 'join_group_v1') {
          expect(params.p_code).toBe('JOINME');
          expect(params.p_invite_code).toBe('JOINME');
          return Promise.resolve({
            data: {
              group: {
                id: 'grp-joined-1',
                name: 'Joined Group',
                type: 'trip',
                currency: 'USD',
                invite_code: 'JOINME',
                created_by: 'u-creator',
                version: 1,
                created_at: '2026-10-10',
                updated_at: '2026-10-10',
              },
              members: [
                {
                  id: 'm-joined-1',
                  group_id: 'grp-joined-1',
                  user_id: 'u-friend',
                  display_name: 'Friend',
                  role: 'member',
                  joined_at: '2026-10-10',
                  created_at: '2026-10-10',
                  updated_at: '2026-10-10',
                },
              ],
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      auth: { refreshSession: vi.fn() },
    };

    let res = await drainQueue(queue, store, mockSupabase as any);
    expect(res.synced).toBe(1);
    expect(store.getGroup('grp-test-1')?._sync).toBe('synced');
    expect(store.getGroup('grp-test-1')?.inviteCode).toBe('GOA123');

    // 2. Test JOIN_GROUP
    queue.enqueue('JOIN_GROUP', 'JOINME', {
      inviteCode: 'joinme',
      memberId: 'm-joined-1',
    });

    res = await drainQueue(queue, store, mockSupabase as any);
    expect(res.synced).toBe(1);
    const joinedGroup = store.getGroup('grp-joined-1');
    expect(joinedGroup).toBeDefined();
    expect(joinedGroup?.name).toBe('Joined Group');
    expect(joinedGroup?._sync).toBe('synced');
    const joinedMember = store.getMember('m-joined-1');
    expect(joinedMember).toBeDefined();
    expect(joinedMember?.displayName).toBe('Friend');
    expect(joinedMember?._sync).toBe('synced');
  });
});
