'use client';

// app/group/members/page.tsx
// Advanced Member & Group Management: Member Removal, Role Management, Ownership Transfer & Placeholder Claims
// Specification Baseline: Technical Specification v1.0 Section 5.2, US-04, US-20 & Tasks 2.7.1, 2.7.2

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useRepository,
  useGroup,
  useGroupMembers,
  useGroupLedger,
} from '../../../lib/data/hooks';
import { useAuth } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { SyncBadge } from '../../../components/SyncBadge';
import { GroupRealtimeManager, type RealtimeStatus } from '../../../lib/sync/realtime';
import { formatMinor } from '../../../lib/engine/money';
import type { Member } from '../../../lib/data/types';

function GroupMembersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = searchParams.get('id') || '';

  const authState = useAuth();
  const currentUserId = authState.user?.id || 'local_user';
  const repo = useRepository(currentUserId);
  const group = useGroup(repo, groupId);
  const members = useGroupMembers(repo, groupId);
  const ledger = useGroupLedger(repo, groupId);
  const currentMember = members.find((m) => m.userId === currentUserId);
  const isCurrentUserOwner = currentMember?.role === 'owner';
  const isCurrentUserAdmin = currentMember?.role === 'admin' || isCurrentUserOwner;
  const userNetBalance = currentMember ? ledger.balances.get(currentMember.id) ?? 0 : 0;

  // Placeholder creation state
  const [isAddPlaceholderOpen, setIsAddPlaceholderOpen] = useState(false);
  const [placeholderName, setPlaceholderName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Selected member for action modal
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);

  // Remove member confirmation / blocked states
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [isRemoveBlockedModalOpen, setIsRemoveBlockedModalOpen] = useState(false);
  const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false);

  // Transfer ownership confirmation state
  const [transferTarget, setTransferTarget] = useState<Member | null>(null);
  const [isTransferConfirmOpen, setIsTransferConfirmOpen] = useState(false);

  // Leave group states
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isSoleOwnerLeaveBlockedOpen, setIsSoleOwnerLeaveBlockedOpen] = useState(false);
  const [isDeleteGroupModalOpen, setIsDeleteGroupModalOpen] = useState(false);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);

  // Claim link generation state
  const [claimLinkStatus, setClaimLinkStatus] = useState<string | null>(null);

  // Realtime subscription for instant member join/update notifications
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('disconnected');

  useEffect(() => {
    if (!groupId) return;
    const rt = new GroupRealtimeManager(groupId, supabase, async () => {
      await repo.syncManager?.kick('realtime_members_hint');
    });

    const unsub = rt.subscribeStatus((st) => {
      setRealtimeStatus(st);
    });

    rt.start();

    return () => {
      unsub();
      rt.destroy();
    };
  }, [groupId, repo]);

  if (!groupId || !group) {
    return (
      <div className="min-h-screen bg-transparent p-6 flex flex-col items-center justify-center text-center">
        <h2 className="text-base font-bold text-[#432E22] mb-2">Group not found</h2>
        <button
          onClick={() => router.push('/')}
          className="px-5 py-2.5 text-xs font-bold rounded-full bg-[#543A2A] text-[#FAF6F0] hover:bg-[#432E20] shadow-sm transition active:scale-95 cursor-pointer"
        >
          Back to Groups
        </button>
      </div>
    );
  }

  const handleAddPlaceholder = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    try {
      repo.addPlaceholderMember(groupId, placeholderName);
      setIsAddPlaceholderOpen(false);
      setPlaceholderName('');
      setSuccessMessage(`Added member "${placeholderName.trim()}"`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add member');
    }
  };

  const inviteCode =
    group?.inviteCode ||
    (group ? group.id.replace(/-/g, '').slice(0, 6).toUpperCase() : '');

  // Persist fallback code if group lacked one
  useEffect(() => {
    if (group && !group.inviteCode && inviteCode) {
      repo.store.upsertGroup({ ...group, inviteCode });
    }
  }, [group, inviteCode, repo]);

  // Sync latest members on mount (full refresh)
  useEffect(() => {
    repo.syncManager?.kick('members_page_mount', true).catch(() => {});
  }, [repo]);

  const handleCopyInviteCode = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  const handleGenerateClaimLink = async (member: Member) => {
    try {
      const inviteUrl = `${window.location.origin}/join?code=${inviteCode}`;
      await navigator.clipboard.writeText(inviteUrl);
      setClaimLinkStatus(`Invite link copied for ${member.displayName}!`);
      setTimeout(() => setClaimLinkStatus(null), 3500);
    } catch {
      setClaimLinkStatus(`Invite code: ${inviteCode}`);
      setTimeout(() => setClaimLinkStatus(null), 3500);
    }
  };

  const handleOpenMemberActions = (member: Member) => {
    setSelectedMember(member);
    setIsActionModalOpen(true);
  };

  const handlePromoteDemote = (member: Member, newRole: 'admin' | 'member') => {
    try {
      repo.updateMemberRole(groupId, member.id, newRole);
      setIsActionModalOpen(false);
      setSuccessMessage(`Updated ${member.displayName}'s role to ${newRole}`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update member role');
    }
  };

  const initiateRemoveMember = (member: Member) => {
    setIsActionModalOpen(false);
    const balance = ledger.balances.get(member.id) ?? 0;
    if (balance !== 0) {
      setMemberToRemove(member);
      setIsRemoveBlockedModalOpen(true);
    } else {
      setMemberToRemove(member);
      setIsRemoveConfirmOpen(true);
    }
  };

  const confirmRemoveMember = () => {
    if (!memberToRemove) return;
    try {
      repo.removeMember(groupId, memberToRemove.id);
      setIsRemoveConfirmOpen(false);
      setSuccessMessage(`Removed ${memberToRemove.displayName} from the group`);
      setTimeout(() => setSuccessMessage(null), 3000);
      setMemberToRemove(null);
    } catch (err: any) {
      setIsRemoveConfirmOpen(false);
      setErrorMessage(err.message || 'Failed to remove member');
    }
  };

  const initiateTransferOwnership = (member: Member) => {
    setIsActionModalOpen(false);
    setTransferTarget(member);
    setIsTransferConfirmOpen(true);
  };

  const confirmTransferOwnership = () => {
    if (!transferTarget || !currentMember) return;
    try {
      repo.transferOwnership(groupId, currentMember.id, transferTarget.id);
      setIsTransferConfirmOpen(false);
      setSuccessMessage(`Transferred ownership to ${transferTarget.displayName}`);
      setTimeout(() => setSuccessMessage(null), 3000);
      setTransferTarget(null);
    } catch (err: any) {
      setIsTransferConfirmOpen(false);
      setErrorMessage(err.message || 'Failed to transfer ownership');
    }
  };

  const handleLeaveGroup = () => {
    if (!currentMember) return;

    // 1. Balance check
    if (userNetBalance !== 0) {
      setIsLeaveModalOpen(true);
      return;
    }

    // 2. Sole owner check: only block if there are other active members to transfer to
    if (isCurrentUserOwner) {
      const activeMembers = members.filter((m) => !m.leftAt);
      const otherOwners = activeMembers.filter((m) => m.role === 'owner' && m.id !== currentMember.id);
      if (otherOwners.length === 0 && activeMembers.length > 1) {
        setIsSoleOwnerLeaveBlockedOpen(true);
        return;
      }
    }

    if (!window.confirm('Are you sure you want to leave this group?')) {
      return;
    }

    try {
      repo.leaveGroup(groupId, currentMember.id);
      router.push('/');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to leave group');
    }
  };

  const handleDeleteGroup = async () => {
    setIsDeletingGroup(true);
    setErrorMessage(null);
    try {
      await repo.deleteGroup(groupId);
      setIsDeleteGroupModalOpen(false);
      router.push('/');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete group');
      setIsDeletingGroup(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-[#432E22] p-4 sm:p-6 pb-24 font-sans">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between pt-1">
          <Link
            href={`/group?id=${groupId}`}
            className="w-10 h-10 rounded-full border border-[#E5D9CC] bg-[#FAF6F0] flex items-center justify-center text-[#543A2A] hover:bg-[#EFE4D6] shadow-sm active:scale-95 transition cursor-pointer"
          >
            ←
          </Link>

          <h1 className="text-sm sm:text-base font-bold tracking-tight text-[#432E22]">
            Members & Permissions
          </h1>

          <SyncBadge manager={repo.syncManager} realtimeStatus={realtimeStatus} />
        </header>

        {errorMessage && (
          <div className="p-3.5 rounded-2xl text-xs font-semibold bg-[#FCE8E6] text-[#A83232] border border-[#F5C2C0] shadow-xs">
            ⚠️ {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 rounded-2xl text-xs font-semibold bg-[#E8F0E4] text-[#2E4226] border border-[#C5D9BE] shadow-xs">
            ✓ {successMessage}
          </div>
        )}

        {claimLinkStatus && (
          <div className="p-3.5 rounded-2xl text-xs font-semibold bg-[#FAF0E6] text-[#8C5E23] border border-[#ECD3B6] shadow-xs">
            🔗 {claimLinkStatus}
          </div>
        )}

        {/* Invite Code Card */}
        <div className="p-5 rounded-3xl border border-[#E5D9CC] bg-white shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#432E22]">
                Group Invite Code
              </h2>
              <p className="text-xs text-[#8D7868] mt-0.5 font-medium">Share this code with friends to join</p>
            </div>
            <span className="px-2.5 py-0.5 rounded-full border border-[#E5D9CC] bg-[#FAF6F0] text-xs font-bold text-[#8D7868]">
              Code
            </span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 px-4 py-2.5 rounded-2xl border border-[#E5D9CC] bg-[#FAF6F0] text-base font-bold text-center tracking-widest text-[#432E22] select-all">
              {inviteCode}
            </div>
            <button
              onClick={handleCopyInviteCode}
              className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-full bg-[#543A2A] text-[#FAF6F0] hover:bg-[#432E20] shadow-sm active:scale-95 transition cursor-pointer"
            >
              {copiedInvite ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Members List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#8D7868]">
              Members Roster ({members.length})
            </h2>
            <button
              onClick={() => setIsAddPlaceholderOpen(true)}
              className="px-3.5 py-1.5 text-xs font-bold rounded-full bg-[#543A2A] text-[#FAF6F0] hover:bg-[#432E20] shadow-sm active:scale-95 transition cursor-pointer"
            >
              + Add Member
            </button>
          </div>

          <div className="divide-y divide-[#E5D9CC] rounded-3xl border border-[#E5D9CC] bg-white shadow-sm overflow-hidden">
            {members.map((m) => {
              const balance = ledger.balances.get(m.id) ?? 0;
              const isYou = m.userId === currentUserId;
              const isPlaceholder = m.userId === null;
              const canManageThisMember = (isCurrentUserOwner || (isCurrentUserAdmin && m.role !== 'owner')) && !isYou;

              return (
                <div key={m.id} className="p-4 flex flex-col gap-2 hover:bg-[#FAF6F0] transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full border border-[#E5D9CC] bg-[#EFE4D6] flex items-center justify-center text-sm font-bold text-[#543A2A] shrink-0">
                        {m.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-[#432E22] truncate">
                            {m.displayName}
                          </span>
                          {isYou && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#C5D9BE] bg-[#E8F0E4] text-[#2E4226] font-bold uppercase">
                              You
                            </span>
                          )}
                          {isPlaceholder && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#ECD3B6] bg-[#FAF0E6] text-[#8C5E23] font-bold uppercase">
                              Guest
                            </span>
                          )}
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full border border-[#E5D9CC] font-semibold uppercase ${
                              m.role === 'owner'
                                ? 'bg-[#EFE4D6] text-[#543A2A]'
                                : m.role === 'admin'
                                ? 'bg-[#FAF6F0] text-[#543A2A]'
                                : 'bg-[#FAF6F0] text-[#8D7868]'
                            }`}
                          >
                            {m.role}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="text-right">
                        {balance > 0 ? (
                          <span className="px-2.5 py-0.5 rounded-full border border-[#C5D9BE] bg-[#E8F0E4] text-xs font-bold text-[#2E4226]">
                            +{formatMinor(balance, group.currency)}
                          </span>
                        ) : balance < 0 ? (
                          <span className="px-2.5 py-0.5 rounded-full border border-[#F5C2C0] bg-[#FCE8E6] text-xs font-bold text-[#A83232]">
                            -{formatMinor(Math.abs(balance), group.currency)}
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full border border-[#E5D9CC] bg-[#FAF6F0] text-[10px] font-semibold text-[#8D7868] uppercase">
                            Settled
                          </span>
                        )}
                      </div>

                      {canManageThisMember && (
                        <button
                          onClick={() => handleOpenMemberActions(m)}
                          className="w-8 h-8 rounded-full border border-[#E5D9CC] bg-[#FAF6F0] hover:bg-[#EFE4D6] text-[#543A2A] flex items-center justify-center text-xs font-bold shadow-xs active:scale-95 transition cursor-pointer"
                          title="Manage member"
                        >
                          ⋯
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Placeholder Guest Account Indicator */}
                  {isPlaceholder && (
                    <div className="mt-1 flex items-center justify-between bg-[#FAF6F0] px-3.5 py-2 rounded-2xl border border-[#E5D9CC] text-xs">
                      <span className="text-[#8D7868] text-[11px] font-medium">Guest member</span>
                      <button
                        onClick={() => handleGenerateClaimLink(m)}
                        className="text-xs font-bold text-[#543A2A] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        🔗 Copy Invite Link
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Group Actions: Delete Group & Leave Group */}
        <div className="pt-2 space-y-2.5">
          {isCurrentUserOwner && (
            <button
              onClick={() => setIsDeleteGroupModalOpen(true)}
              className="w-full py-3.5 text-xs font-bold uppercase tracking-wider rounded-full bg-[#A83232] text-white hover:bg-[#912828] shadow-md active:scale-95 transition cursor-pointer"
            >
              Delete Group
            </button>
          )}

          <button
            onClick={handleLeaveGroup}
            className="w-full py-3.5 text-xs font-bold uppercase tracking-wider rounded-full border border-[#F5C2C0] bg-[#FCE8E6] text-[#A83232] hover:bg-[#F8D8D5] shadow-xs active:scale-95 transition cursor-pointer"
          >
            Leave Group
          </button>
        </div>
      </div>

      {/* Member Action Menu Modal */}
      {isActionModalOpen && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-white border border-[#E5D9CC] rounded-3xl p-6 shadow-2xl space-y-4">
            <div>
              <h2 className="text-base font-bold text-[#432E22]">Manage {selectedMember.displayName}</h2>
              <p className="text-xs text-[#8D7868] font-medium mt-0.5">Current role: {selectedMember.role.toUpperCase()}</p>
            </div>

            <div className="space-y-2 pt-2">
              {/* Role management: Owner only */}
              {isCurrentUserOwner && selectedMember.role === 'member' && (
                <button
                  onClick={() => handlePromoteDemote(selectedMember, 'admin')}
                  className="w-full py-2.5 px-4 text-xs font-bold rounded-2xl border border-[#E5D9CC] bg-[#FAF6F0] text-[#432E22] hover:bg-[#EFE4D6] text-left flex items-center justify-between shadow-xs cursor-pointer"
                >
                  <span>Promote to Admin</span>
                  <span>🛡️</span>
                </button>
              )}

              {isCurrentUserOwner && selectedMember.role === 'admin' && (
                <button
                  onClick={() => handlePromoteDemote(selectedMember, 'member')}
                  className="w-full py-2.5 px-4 text-xs font-bold rounded-2xl border border-[#E5D9CC] bg-[#FAF6F0] text-[#432E22] hover:bg-[#EFE4D6] text-left flex items-center justify-between shadow-xs cursor-pointer"
                >
                  <span>Demote to Member</span>
                  <span>👤</span>
                </button>
              )}

              {/* Ownership transfer: Owner only */}
              {isCurrentUserOwner && (
                <button
                  onClick={() => initiateTransferOwnership(selectedMember)}
                  className="w-full py-2.5 px-4 text-xs font-bold rounded-2xl border border-[#ECD3B6] bg-[#FAF0E6] text-[#8C5E23] hover:bg-[#F4E4D0] text-left flex items-center justify-between shadow-xs cursor-pointer"
                >
                  <span>Transfer Group Ownership</span>
                  <span>👑</span>
                </button>
              )}

              {/* Member removal */}
              <button
                onClick={() => initiateRemoveMember(selectedMember)}
                className="w-full py-2.5 px-4 text-xs font-bold rounded-2xl border border-[#F5C2C0] bg-[#FCE8E6] text-[#A83232] hover:bg-[#F8D8D5] text-left flex items-center justify-between shadow-xs cursor-pointer"
              >
                <span>Remove from Group</span>
                <span>🚪</span>
              </button>
            </div>

            <button
              onClick={() => setIsActionModalOpen(false)}
              className="w-full py-2.5 text-xs font-bold uppercase rounded-full border border-[#E5D9CC] bg-[#FAF6F0] text-[#543A2A] hover:bg-[#EFE4D6] shadow-xs cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Remove Member Blocked Modal (Non-zero balance) */}
      {isRemoveBlockedModalOpen && memberToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-white border border-[#E5D9CC] rounded-3xl p-6 shadow-2xl text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl border border-[#F5C2C0] bg-[#FCE8E6] text-[#A83232] flex items-center justify-center mx-auto text-xl font-bold">
              !
            </div>
            <h2 className="text-base font-bold text-[#432E22]">Cannot Remove Member</h2>
            <p className="text-xs text-[#8D7868] leading-relaxed">
              <span className="font-bold text-[#432E22]">{memberToRemove.displayName}</span> has an outstanding balance of{' '}
              <span className="font-bold text-[#A83232] bg-[#FCE8E6] px-1.5 py-0.5 rounded-full border border-[#F5C2C0]">
                {formatMinor(Math.abs(ledger.balances.get(memberToRemove.id) ?? 0), group.currency)}
              </span>
              . All balances must be settled to zero before removing a member.
            </p>
            <button
              onClick={() => {
                setIsRemoveBlockedModalOpen(false);
                setMemberToRemove(null);
              }}
              className="w-full py-3 text-xs font-bold uppercase tracking-wider rounded-full bg-[#543A2A] text-[#FAF6F0] shadow-md hover:bg-[#432E20] active:scale-95 cursor-pointer"
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* Remove Member Confirmation Modal */}
      {isRemoveConfirmOpen && memberToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-white border border-[#E5D9CC] rounded-3xl p-6 shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-[#432E22]">Remove {memberToRemove.displayName}?</h2>
            <p className="text-xs text-[#8D7868] leading-relaxed">
              Past splits and settled expenses will remain intact, but they will no longer participate in this group.
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsRemoveConfirmOpen(false);
                  setMemberToRemove(null);
                }}
                className="flex-1 py-2.5 text-xs font-bold uppercase rounded-full border border-[#E5D9CC] bg-[#FAF6F0] text-[#543A2A] hover:bg-[#EFE4D6] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemoveMember}
                className="flex-1 py-2.5 text-xs font-bold uppercase rounded-full bg-[#A83232] text-white hover:bg-[#912828] shadow-md active:scale-95 cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Ownership Confirmation Modal */}
      {isTransferConfirmOpen && transferTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-white border border-[#E5D9CC] rounded-3xl p-6 shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-[#432E22]">Transfer Ownership?</h2>
            <p className="text-xs text-[#8D7868] leading-relaxed">
              Transfer group ownership to <span className="font-bold text-[#432E22]">{transferTarget.displayName}</span>? You will remain in the group as an admin.
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsTransferConfirmOpen(false);
                  setTransferTarget(null);
                }}
                className="flex-1 py-2.5 text-xs font-bold uppercase rounded-full border border-[#E5D9CC] bg-[#FAF6F0] text-[#543A2A] hover:bg-[#EFE4D6] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmTransferOwnership}
                className="flex-1 py-2.5 text-xs font-bold uppercase rounded-full bg-[#543A2A] text-[#FAF6F0] hover:bg-[#432E20] shadow-md active:scale-95 cursor-pointer"
              >
                Confirm Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sole Owner Cannot Leave Modal */}
      {isSoleOwnerLeaveBlockedOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-white border border-[#E5D9CC] rounded-3xl p-6 shadow-2xl text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl border border-[#ECD3B6] bg-[#FAF0E6] text-[#8C5E23] flex items-center justify-center mx-auto text-xl font-bold">
              👑
            </div>
            <h2 className="text-base font-bold text-[#432E22]">Transfer Ownership First</h2>
            <p className="text-xs text-[#8D7868] leading-relaxed">
              As the sole group owner, you cannot leave while other active members exist. Please transfer ownership to another member before leaving.
            </p>
            <button
              onClick={() => setIsSoleOwnerLeaveBlockedOpen(false)}
              className="w-full py-3 text-xs font-bold uppercase tracking-wider rounded-full bg-[#543A2A] text-[#FAF6F0] shadow-md hover:bg-[#432E20] active:scale-95 cursor-pointer"
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* Leave Group Blocked Modal (Non-zero balance) */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-white border border-[#E5D9CC] rounded-3xl p-6 shadow-2xl text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl border border-[#F5C2C0] bg-[#FCE8E6] text-[#A83232] flex items-center justify-center mx-auto text-xl font-bold">
              !
            </div>
            <h2 className="text-base font-bold text-[#432E22]">Cannot Leave Group</h2>
            <p className="text-xs text-[#8D7868] leading-relaxed">
              You have an active balance of{' '}
              <span className="font-bold text-[#A83232] bg-[#FCE8E6] px-1.5 py-0.5 rounded-full border border-[#F5C2C0]">
                {formatMinor(Math.abs(userNetBalance), group.currency)}
              </span>
              . You must settle all balances to zero before leaving this group.
            </p>
            <button
              onClick={() => setIsLeaveModalOpen(false)}
              className="w-full py-3 text-xs font-bold uppercase tracking-wider rounded-full bg-[#543A2A] text-[#FAF6F0] shadow-md hover:bg-[#432E20] active:scale-95 cursor-pointer"
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* Delete Group Modal */}
      {isDeleteGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-white border border-[#E5D9CC] rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="text-center space-y-1">
              <span className="text-3xl">🗑️</span>
              <h2 className="text-base font-bold text-[#432E22]">Delete Group?</h2>
              <p className="text-xs text-[#8D7868]">
                Are you sure you want to delete &quot;{group.name}&quot;? This will archive the group for all members.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setIsDeleteGroupModalOpen(false)}
                className="flex-1 py-2.5 text-xs font-bold uppercase rounded-full border border-[#E5D9CC] bg-[#FAF6F0] text-[#543A2A] hover:bg-[#EFE4D6] cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={isDeletingGroup}
                onClick={handleDeleteGroup}
                className="flex-1 py-2.5 text-xs font-bold uppercase rounded-full bg-[#A83232] text-white hover:bg-[#912828] disabled:opacity-50 shadow-md active:scale-95 cursor-pointer"
              >
                {isDeletingGroup ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Placeholder Member Modal */}
      {isAddPlaceholderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-white border border-[#E5D9CC] rounded-3xl p-6 shadow-2xl space-y-4">
            <h2 className="text-base font-bold text-[#432E22]">Add Group Member</h2>
            <p className="text-xs text-[#8D7868]">
              Add a friend to track expenses with even before they install the app. You can share an invite link with them anytime.
            </p>

            <form onSubmit={handleAddPlaceholder} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#432E22] mb-1.5">
                  Member Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  placeholder="e.g. Sam, Priya"
                  value={placeholderName}
                  onChange={(e) => setPlaceholderName(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm font-semibold rounded-2xl border border-[#E5D9CC] bg-[#FAF6F0] text-[#432E22] focus:outline-none focus:border-[#543A2A] transition-colors"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddPlaceholderOpen(false)}
                  className="flex-1 py-2.5 text-xs font-bold uppercase rounded-full border border-[#E5D9CC] bg-[#FAF6F0] text-[#543A2A] hover:bg-[#EFE4D6] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-xs font-bold uppercase rounded-full bg-[#543A2A] text-[#FAF6F0] hover:bg-[#432E20] shadow-md active:scale-95 cursor-pointer"
                >
                  Add Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GroupMembersPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs font-bold text-[#8D7868]">Loading roster...</div>}>
      <GroupMembersContent />
    </Suspense>
  );
}
