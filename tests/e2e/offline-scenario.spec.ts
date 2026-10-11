// tests/e2e/offline-scenario.spec.ts
// End-to-End Offline-to-Online Scenario Verification Suite
// Validates NFR-01 (< 100ms local write), NFR-03 (cold start < 2s persistence), NFR-04 (drain < 10s)

import { describe, it, expect, vi } from 'vitest';
import { DomainRepository } from '../../lib/data/repository';
import { LocalStore } from '../../lib/data/local-store';
import { MutationQueue } from '../../lib/data/queue';
import { LocalStorageAdapter, MemoryStorage } from '../../lib/data/storage-adapter';
import { SyncLifecycleManager } from '../../lib/sync/lifecycle';
import { resetBackoff } from '../../lib/sync/push';
import { selectGroupLedger } from '../../lib/data/selectors';

describe('T-1.12.1: End-to-End Airplane-Mode Scenario & Lifecycle Verification', () => {
  it('executes the full offline-to-online cycle with zero data loss and exact balance agreement', async () => {
    resetBackoff();

    // ---------------------------------------------------------
    // Phase 1: Airplane Mode ON (Device is 100% offline)
    // ---------------------------------------------------------
    const rawStorage = new MemoryStorage();
    const adapter = new LocalStorageAdapter('alice_offline_device', rawStorage);
    const store = new LocalStore(adapter);
    const queue = new MutationQueue(adapter);

    const remoteRpcMock = vi.fn().mockImplementation((fn: string, params: any) => {
      if (fn === 'pull_changes_v1') {
        return Promise.resolve({
          data: { groups: [], members: [], expenses: [], settlements: [], has_more: false },
          error: null,
        });
      }
      return Promise.resolve({ data: { success: true }, error: null });
    });

    const mockSupabase = {
      rpc: remoteRpcMock,
      auth: { refreshSession: vi.fn() },
    };

    // Airplane Mode: Local DomainRepository writes with 0 network latency
    const repo = new DomainRepository(store, queue);

    // 1. Create group while offline
    const tGroupStart = performance.now();
    const { group, member: aliceMember } = repo.createGroup(
      { name: 'Kashmir Expedition', type: 'trip', currency: 'INR' },
      'user_alice',
      'Alice'
    );
    const groupDuration = performance.now() - tGroupStart;
    expect(groupDuration).toBeLessThan(100); // NFR-01: write latency < 100ms

    // 2. Add placeholder member while offline
    const bobMember = repo.addPlaceholderMember(group.id, 'Bob');

    // 3. Create Expense 1: Equal Split (Dinner ₹3,000)
    const tExp1Start = performance.now();
    const exp1 = repo.addExpense(
      {
        groupId: group.id,
        title: 'Shikara Dinner',
        amountMinor: 300000,
        currency: 'INR',
        splitType: 'equal',
        splits: [
          { memberId: aliceMember.id, paidMinor: 300000, owedMinor: 150000 },
          { memberId: bobMember.id, paidMinor: 0, owedMinor: 150000 },
        ],
      },
      'user_alice'
    );
    const exp1Duration = performance.now() - tExp1Start;
    expect(exp1Duration).toBeLessThan(100); // NFR-01

    // 4. Create Expense 2: Unequal / Exact Split (Gondola Ride ₹2,500)
    const exp2 = repo.addExpense(
      {
        groupId: group.id,
        title: 'Gulmarg Gondola',
        amountMinor: 250000,
        currency: 'INR',
        splitType: 'exact',
        splits: [
          { memberId: aliceMember.id, paidMinor: 250000, owedMinor: 100000 },
          { memberId: bobMember.id, paidMinor: 0, owedMinor: 150000 },
        ],
      },
      'user_alice'
    );

    // 5. Create Expense 3: Multi-Payer Split (Groceries ₹1,200)
    // Both Alice (₹800) and Bob (₹400) paid; split equally (₹600 each)
    const exp3 = repo.addExpense(
      {
        groupId: group.id,
        title: 'Pahalgam Supplies',
        amountMinor: 120000,
        currency: 'INR',
        splitType: 'equal',
        splits: [
          { memberId: aliceMember.id, paidMinor: 80000, owedMinor: 60000 },
          { memberId: bobMember.id, paidMinor: 40000, owedMinor: 60000 },
        ],
      },
      'user_alice'
    );

    // 6. Record Settlement: Bob gave Alice ₹1,000 in cash
    const settlement = repo.addSettlement(
      {
        groupId: group.id,
        fromMemberId: bobMember.id,
        toMemberId: aliceMember.id,
        amountMinor: 100000,
        method: 'cash',
        note: 'Handed over cash at hotel',
      },
      'user_alice'
    );

    // Verify Invariant I3: Sum of balances === 0
    const offlineLedger = selectGroupLedger(store, group.id);
    const aliceBalance = offlineLedger.balances.get(aliceMember.id)!;
    const bobBalance = offlineLedger.balances.get(bobMember.id)!;
    expect(aliceBalance + bobBalance).toBe(0);

    // Alice paid: 3000 + 2500 + 800 = 6300. Alice owed: 1500 + 1000 + 600 = 3100.
    // Net before settlement: +3200. Bob gave 1000 to Alice -> Alice net = +2200, Bob net = -2200.
    expect(aliceBalance).toBe(220000);
    expect(bobBalance).toBe(-220000);

    // Total queued mutations pending offline:
    // 1 group + 1 placeholder + 3 expenses + 1 settlement = 6 mutations
    expect(queue.getPendingCount()).toBe(6);

    // ---------------------------------------------------------
    // Phase 2: Force-kill app & simulate cold start restart
    // ---------------------------------------------------------
    const tRestartStart = performance.now();
    const restartedAdapter = new LocalStorageAdapter('alice_offline_device', rawStorage);
    const restartedStore = new LocalStore(restartedAdapter);
    const restartedQueue = new MutationQueue(restartedAdapter);
    const restartDuration = performance.now() - tRestartStart;

    // NFR-03: Cold-start reload from local storage < 2s
    expect(restartDuration).toBeLessThan(2000);

    // Verify ZERO data loss on restart
    expect(restartedStore.getGroup(group.id)?.name).toBe('Kashmir Expedition');
    expect(restartedStore.getGroupExpenses(group.id)).toHaveLength(3);
    expect(restartedStore.getGroupSettlements(group.id)).toHaveLength(1);
    expect(restartedQueue.getPendingCount()).toBe(6);

    // Re-verify exact balance agreement after cold start
    const coldStartLedger = selectGroupLedger(restartedStore, group.id);
    expect(coldStartLedger.balances.get(aliceMember.id)).toBe(220000);
    expect(coldStartLedger.balances.get(bobMember.id)).toBe(-220000);

    // ---------------------------------------------------------
    // Phase 3: Airplane Mode OFF (Reconnection & Queue Drain)
    // ---------------------------------------------------------
    const restartedSyncManager = new SyncLifecycleManager(
      restartedStore,
      restartedQueue,
      restartedAdapter,
      mockSupabase as any
    );

    const tDrainStart = performance.now();
    const drainSnapshot = await restartedSyncManager.kick('airplane_mode_disabled');
    const drainDuration = performance.now() - tDrainStart;

    // NFR-04: Queue drains within 10 seconds
    expect(drainDuration).toBeLessThan(10000);
    expect(drainSnapshot.pendingCount).toBe(0);
    expect(restartedQueue.getPendingCount()).toBe(0);

    // Remote RPC was called for every mutation
    expect(remoteRpcMock).toHaveBeenCalledWith('create_group_v1', expect.anything());
    expect(remoteRpcMock).toHaveBeenCalledWith('add_placeholder_v1', expect.anything());
    expect(remoteRpcMock).toHaveBeenCalledWith('upsert_expense_v1', expect.anything());
    expect(remoteRpcMock).toHaveBeenCalledWith('upsert_settlement_v1', expect.anything());

    // Final check: all local entities are marked synced
    expect(restartedStore.getExpense(exp1.id)?._sync).toBe('synced');
    expect(restartedStore.getExpense(exp2.id)?._sync).toBe('synced');
    expect(restartedStore.getExpense(exp3.id)?._sync).toBe('synced');
    expect(restartedStore.getSettlement(settlement.id)?._sync).toBe('synced');
  });
});
