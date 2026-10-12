import { describe, it, expect, beforeEach } from 'vitest';
import { DomainRepository } from '../../lib/data/repository';
import { LocalStore } from '../../lib/data/local-store';
import { MutationQueue } from '../../lib/data/queue';
import { LocalStorageAdapter, MemoryStorage } from '../../lib/data/storage-adapter';
import { EngineError } from '../../lib/engine/errors';

describe('T-2.7.1 & T-2.7.2: Advanced Member & Group Management', () => {
  let rawStorage: MemoryStorage;
  let adapter: LocalStorageAdapter;
  let store: LocalStore;
  let queue: MutationQueue;
  let repo: DomainRepository;

  beforeEach(() => {
    rawStorage = new MemoryStorage();
    adapter = new LocalStorageAdapter('test_user', rawStorage);
    store = new LocalStore(adapter);
    queue = new MutationQueue(adapter);
    repo = new DomainRepository(store, queue);
  });

  it('blocks member removal when member has a non-zero balance (MEMBER_HAS_BALANCE)', () => {
    // 1. Create group with owner (Alice)
    const { group, member: alice } = repo.createGroup(
      { name: 'Roadtrip', currency: 'INR' },
      'user-alice',
      'Alice'
    );

    // 2. Add placeholder member (Bob)
    const bob = repo.addPlaceholderMember(group.id, 'Bob');

    // 3. Add expense where Alice paid 1000 and Bob owes 500 (Bob net = -500)
    repo.addExpense(
      {
        groupId: group.id,
        title: 'Snacks',
        amountMinor: 1000,
        currency: 'INR',
        splitType: 'equal',
        splits: [
          { memberId: alice.id, paidMinor: 1000, owedMinor: 500 },
          { memberId: bob.id, paidMinor: 0, owedMinor: 500 },
        ],
      },
      'user-alice'
    );

    // 4. Attempt to remove Bob -> must throw MEMBER_HAS_BALANCE
    expect(() => repo.removeMember(group.id, bob.id)).toThrowError(
      expect.objectContaining({
        code: 'MEMBER_HAS_BALANCE',
      })
    );
  });

  it('blocks removal of sole owner without ownership transfer (SOLE_OWNER)', () => {
    const { group, member: alice } = repo.createGroup(
      { name: 'Trip', currency: 'INR' },
      'user-alice',
      'Alice'
    );
    repo.addPlaceholderMember(group.id, 'Bob');

    // Alice is the sole owner and Bob exists
    expect(() => repo.removeMember(group.id, alice.id)).toThrowError(
      expect.objectContaining({
        code: 'SOLE_OWNER',
      })
    );
  });

  it('successfully removes member when their balance is 0 and enqueues REMOVE_MEMBER', () => {
    const { group, member: alice } = repo.createGroup(
      { name: 'Trip', currency: 'INR' },
      'user-alice',
      'Alice'
    );
    const bob = repo.addPlaceholderMember(group.id, 'Bob');

    // Bob has 0 balance
    const removedBob = repo.removeMember(group.id, bob.id);
    expect(removedBob.leftAt).toBeDefined();

    // Check store
    const storedBob = store.getMember(bob.id);
    expect(storedBob?.leftAt).toBeDefined();

    // Active members query should now exclude Bob
    const activeMembers = store.getGroupMembers(group.id, false);
    expect(activeMembers.find((m) => m.id === bob.id)).toBeUndefined();

    // Check queue
    const queueItems = queue.getAllItems();
    const removeMutation = queueItems.find((m) => m.type === 'REMOVE_MEMBER');
    expect(removeMutation).toBeDefined();
    expect(removeMutation?.payload.memberId).toBe(bob.id);
  });

  it('promotes and demotes member roles (updateMemberRole)', () => {
    const { group } = repo.createGroup(
      { name: 'Housemates', currency: 'INR' },
      'user-alice',
      'Alice'
    );
    const bob = repo.addPlaceholderMember(group.id, 'Bob');

    // Promote Bob to admin
    const promotedBob = repo.updateMemberRole(group.id, bob.id, 'admin');
    expect(promotedBob.role).toBe('admin');
    expect(store.getMember(bob.id)?.role).toBe('admin');

    // Check mutation queue
    const queueItems = queue.getAllItems();
    const roleMutation = queueItems.find((m) => m.type === 'UPDATE_MEMBER_ROLE');
    expect(roleMutation?.payload.role).toBe('admin');

    // Demote Bob back to member
    const demotedBob = repo.updateMemberRole(group.id, bob.id, 'member');
    expect(demotedBob.role).toBe('member');
    expect(store.getMember(bob.id)?.role).toBe('member');
  });

  it('transfers group ownership and updates roles (transferOwnership)', () => {
    const { group, member: alice } = repo.createGroup(
      { name: 'Camping', currency: 'INR' },
      'user-alice',
      'Alice'
    );
    const bob = repo.addPlaceholderMember(group.id, 'Bob');

    const result = repo.transferOwnership(group.id, alice.id, bob.id);
    expect(result.previousOwner.role).toBe('admin');
    expect(result.newOwner.role).toBe('owner');

    expect(store.getMember(alice.id)?.role).toBe('admin');
    expect(store.getMember(bob.id)?.role).toBe('owner');

    const queueItems = queue.getAllItems();
    const transferMutation = queueItems.find((m) => m.type === 'TRANSFER_OWNERSHIP');
    expect(transferMutation?.payload.newOwnerMemberId).toBe(bob.id);
  });

  it('enforces balance and sole owner constraints on leaveGroup', () => {
    const { group, member: alice } = repo.createGroup(
      { name: 'Dinner Club', currency: 'INR' },
      'user-alice',
      'Alice'
    );
    const bob = repo.addPlaceholderMember(group.id, 'Bob');

    // Alice is sole owner and Bob is member
    expect(() => repo.leaveGroup(group.id, alice.id)).toThrowError(
      expect.objectContaining({ code: 'SOLE_OWNER' })
    );

    // Transfer ownership to Bob
    repo.transferOwnership(group.id, alice.id, bob.id);

    // Now Alice can leave because balance is 0 and she is not sole owner
    repo.leaveGroup(group.id, alice.id);
    expect(store.getMember(alice.id)?.leftAt).toBeDefined();

    const queueItems = queue.getAllItems();
    const leaveMutation = queueItems.find((m) => m.type === 'LEAVE_GROUP');
    expect(leaveMutation?.payload.memberId).toBe(alice.id);
  });

  it('enqueues placeholder claim mutation (claimPlaceholder)', () => {
    repo.claimPlaceholder('token-secret-xyz-123');

    const queueItems = queue.getAllItems();
    const claimMutation = queueItems.find((m) => m.type === 'CLAIM_PLACEHOLDER');
    expect(claimMutation).toBeDefined();
    expect(claimMutation?.payload.claimToken).toBe('token-secret-xyz-123');
  });
});
