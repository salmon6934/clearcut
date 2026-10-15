// tests/sync/pull.test.ts
import { describe, it, expect, vi } from 'vitest';
import { pullChanges, getLocalCursors } from '../../lib/sync/pull';
import { MutationQueue } from '../../lib/data/queue';
import { LocalStore } from '../../lib/data/local-store';
import { LocalStorageAdapter, MemoryStorage } from '../../lib/data/storage-adapter';
import type { Expense } from '../../lib/data/types';

describe('T-1.7.2: Pull & Idempotent Merge Engine', () => {
  function setup() {
    const rawStorage = new MemoryStorage();
    const adapter = new LocalStorageAdapter('test_pull_user', rawStorage);
    const store = new LocalStore(adapter);
    const queue = new MutationQueue(adapter);
    return { store, queue, adapter };
  }

  it('pulls remote rows, maps snake_case to domain types, and persists cursors', async () => {
    const { store, queue, adapter } = setup();

    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          groups: [
            {
              id: 'g-1',
              name: 'Trip to Tokyo',
              type: 'trip',
              currency: 'JPY',
              version: 1,
              updated_at: '2026-10-10T12:00:10.000Z',
            },
          ],
          members: [
            {
              id: 'm-1',
              group_id: 'g-1',
              user_id: 'u-1',
              display_name: 'Harsh',
              role: 'owner',
              updated_at: '2026-10-10T12:00:10.000Z',
            },
          ],
          expenses: [
            {
              id: 'e-1',
              group_id: 'g-1',
              title: 'Ramen',
              amount_minor: 1500,
              currency: 'JPY',
              expense_date: '2026-10-10',
              split_type: 'equal',
              version: 1,
              splits: [{ member_id: 'm-1', paid_minor: 1500, owed_minor: 1500 }],
              updated_at: '2026-10-10T12:00:10.000Z',
            },
          ],
          settlements: [],
          has_more: false,
          server_time: '2026-10-10T12:00:15.000Z',
        },
        error: null,
      }),
    };

    const res = await pullChanges(store, queue, adapter, mockSupabase as any);

    expect(res.groupsCount).toBe(1);
    expect(res.membersCount).toBe(1);
    expect(res.expensesCount).toBe(1);

    const group = store.getGroup('g-1');
    expect(group?.name).toBe('Trip to Tokyo');
    expect(group?.currency).toBe('JPY');
    expect(group?._sync).toBe('synced');

    const expense = store.getExpense('e-1');
    expect(expense?.title).toBe('Ramen');
    expect(expense?.amountMinor).toBe(1500);
    expect(expense?.splits).toHaveLength(1);
    expect(expense?.splits[0]?.paidMinor).toBe(1500);

    // Cursors are updated with 5-second overlap window:
    // 2026-10-10T12:00:10.000Z - 5s => 2026-10-10T12:00:05.000Z
    const cursors = getLocalCursors(adapter);
    expect(cursors.groups).toBe('2026-10-10T12:00:05.000Z');
  });

  it('preserves pending local unpushed mutations and flags conflict if remote version is higher', async () => {
    const { store, queue, adapter } = setup();

    // Local user created or edited an expense offline (version 1)
    const localExpense: Expense = {
      id: 'e-local',
      groupId: 'g-1',
      title: 'Local Offline Edit',
      amountMinor: 2000,
      currency: 'INR',
      expenseDate: '2026-10-10',
      splitType: 'equal',
      splits: [],
      createdBy: 'u-1',
      version: 1,
      _sync: 'pending',
    };
    store.upsertExpense(localExpense);
    queue.enqueue('UPSERT_EXPENSE', 'e-local', { expense: localExpense });

    // Server has a remote update with higher version (version 2)
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          groups: [],
          members: [],
          expenses: [
            {
              id: 'e-local',
              group_id: 'g-1',
              title: 'Server Conflict Edit',
              amount_minor: 3500,
              currency: 'INR',
              version: 2,
              updated_at: '2026-10-10T12:00:00.000Z',
            },
          ],
          settlements: [],
          has_more: false,
        },
        error: null,
      }),
    };

    await pullChanges(store, queue, adapter, mockSupabase as any);

    // Local content should NOT be overwritten
    const current = store.getExpense('e-local');
    expect(current?.title).toBe('Local Offline Edit');
    // But it should be marked as conflict for resolution!
    expect(current?._sync).toBe('conflict');
  });

  it('correctly applies remote tombstones (deleted_at)', async () => {
    const { store, queue, adapter } = setup();

    // Existing active expense in store
    store.upsertExpense({
      id: 'e-del',
      groupId: 'g-1',
      title: 'To be deleted',
      amountMinor: 100,
      currency: 'INR',
      expenseDate: '2026-10-10',
      splitType: 'equal',
      splits: [],
      createdBy: 'u-1',
      version: 1,
    });

    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          groups: [],
          members: [],
          expenses: [
            {
              id: 'e-del',
              group_id: 'g-1',
              title: 'To be deleted',
              amount_minor: 100,
              currency: 'INR',
              version: 2,
              deleted_at: '2026-10-10T15:00:00.000Z',
              updated_at: '2026-10-10T15:00:00.000Z',
            },
          ],
          settlements: [],
          has_more: false,
        },
        error: null,
      }),
    };

    await pullChanges(store, queue, adapter, mockSupabase as any);

    // Filtered out of active expenses
    expect(store.getGroupExpenses('g-1', false)).toHaveLength(0);
    // Preserved in deleted expenses
    expect(store.getGroupExpenses('g-1', true)).toHaveLength(1);
    expect(store.getExpense('e-del')?.deletedAt).toBe('2026-10-10T15:00:00.000Z');
  });

  it('falls back to direct table queries when pull_changes_v1 fails', async () => {
    const { store, queue, adapter } = setup();

    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'missing FROM-clause entry for table "c"', code: '42P01' },
      }),
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'groups') {
          return {
            select: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'g-1',
                    name: 'Fallback Group',
                    currency: 'INR',
                    version: 1,
                    created_by: 'u-1',
                    updated_at: '2026-10-10T12:00:00.000Z',
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'group_members') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'm-owner',
                      group_id: 'g-1',
                      user_id: 'u-1',
                      display_name: 'Owner',
                      role: 'owner',
                      updated_at: '2026-10-10T12:00:00.000Z',
                    },
                    {
                      id: 'm-member',
                      group_id: 'g-1',
                      user_id: 'u-2',
                      display_name: 'Friend',
                      role: 'member',
                      updated_at: '2026-10-10T12:01:00.000Z',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'expenses' || table === 'settlements') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }),
    };

    const res = await pullChanges(store, queue, adapter, mockSupabase as any);

    expect(res.groupsCount).toBe(1);
    expect(res.membersCount).toBe(2);

    const members = store.getGroupMembers('g-1');
    expect(members).toHaveLength(2);
    expect(members.map((m) => m.displayName)).toContain('Owner');
    expect(members.map((m) => m.displayName)).toContain('Friend');
  });

  it('preserves items correctly on fullRefresh without premature multi-page deletion', async () => {
    const { store, queue, adapter } = setup();

    // Member already in local store
    store.upsertMember({
      id: 'm-keep',
      groupId: 'g-1',
      userId: 'u-keep',
      displayName: 'Existing Member',
      role: 'member',
      _sync: 'synced',
    });

    // Page 1 returns member
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValueOnce({
        data: {
          groups: [{ id: 'g-1', name: 'G1', currency: 'INR', version: 1 }],
          members: [
            {
              id: 'm-keep',
              group_id: 'g-1',
              user_id: 'u-keep',
              display_name: 'Existing Member',
              role: 'member',
            },
          ],
          expenses: [],
          settlements: [],
          active_group_ids: ['g-1'],
          has_more: false,
        },
        error: null,
      }),
    };

    await pullChanges(store, queue, adapter, mockSupabase as any, 500, true);

    expect(store.getMember('m-keep')).toBeDefined();
    expect(store.getGroupMembers('g-1')).toHaveLength(1);
  });
});
