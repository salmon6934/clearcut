'use client';

// app/group/members/page.tsx
// Advanced Member & Group Management: Member Removal, Role Management, Ownership Transfer & Placeholder Claims
// Specification Baseline: Technical Specification v1.0 Section 5.2, US-04, US-20 & Tasks 2.7.1, 2.7.2

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useRepository,
  useGroup,
  useGroupMembers,
  useGroupLedger,
} from '../../../lib/data/hooks';
import { getAuthState } from '../../../lib/auth';
import { formatMinor } from '../../../lib/engine/money';
import type { Member } from '../../../lib/data/types';

function GroupMembersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = searchParams.get('id') || '';

  const repo = useRepository();
  const group = useGroup(repo, groupId);
  const members = useGroupMembers(repo, groupId);
  const ledger = useGroupLedger(repo, groupId);

  const authState = getAuthState();
  const currentUserId = authState.user?.id || 'local_user';
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

  // Claim link generation state
  const [claimLinkStatus, setClaimLinkStatus] = useState<string | null>(null);

  if (!groupId || !group) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 flex flex-col items-center justify-center text-center">
        <h2 className="text-base font-bold mb-2">Group not found</h2>
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 text-white"
        >
          Back to Dashboard
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

  const handleCopyInviteCode = () => {
    if (!group.inviteCode) return;
    navigator.clipboard.writeText(group.inviteCode);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  const handleGenerateClaimLink = async (member: Member) => {
    try {
      setClaimLinkStatus('Generating claim invite...');
      const token = await repo.generatePlaceholderClaim(groupId, member.id);
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const claimUrl = `${origin}/join?claim=${token}`;

      await navigator.clipboard.writeText(claimUrl);
      setClaimLinkStatus(`Claim link for ${member.displayName} copied to clipboard!`);
      setTimeout(() => setClaimLinkStatus(null), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate claim link');
      setClaimLinkStatus(null);
    }
  };

  const handleOpenMemberActions = (member: Member) => {
    setSelectedMember(member);
    setIsActionModalOpen(true);
  };

  const handlePromoteDemote = (member: Member, newRole: 'admin' | 'member') => {
    setIsActionModalOpen(false);
    try {
      repo.updateMemberRole(groupId, member.id, newRole);
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

    // 2. Sole owner check
    if (isCurrentUserOwner) {
      const activeMembers = members.filter((m) => !m.leftAt);
      const otherOwners = activeMembers.filter((m) => m.role === 'owner' && m.id !== currentMember.id);
      if (otherOwners.length === 0 && activeMembers.length > 1) {
        setIsSoleOwnerLeaveBlockedOpen(true);
        return;
      }
    }

    try {
      repo.leaveGroup(groupId, currentMember.id);
      router.push('/');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to leave group');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-4 sm:p-6 pb-12">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between pt-1">
          <Link
            href={`/group?id=${groupId}`}
            className="w-9 h-9 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>

          <h1 className="text-base font-bold">Group Members & Settings</h1>

          <div className="w-9" />
        </header>

        {errorMessage && (
          <div className="p-3 rounded-xl text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-xl text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            {successMessage}
          </div>
        )}

        {claimLinkStatus && (
          <div className="p-3 rounded-xl text-xs font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 animate-pulse">
            {claimLinkStatus}
          </div>
        )}

        {/* Invite Code Card */}
        <div className="p-5 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold">Invite Friends</h2>
              <p className="text-xs text-zinc-400">Share this code with group members to join</p>
            </div>
            <span className="text-2xl">🔗</span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 font-mono text-sm font-bold text-center tracking-widest text-emerald-600 dark:text-emerald-400 select-all">
              {group.inviteCode || 'Available once synced'}
            </div>
            {group.inviteCode && (
              <button
                onClick={handleCopyInviteCode}
                className="px-4 py-2.5 text-xs font-semibold rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 active:scale-95 transition"
              >
                {copiedInvite ? 'Copied!' : 'Copy'}
              </button>
            )}
          </div>
        </div>

        {/* Members List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Members ({members.length})
            </h2>
            <button
              onClick={() => setIsAddPlaceholderOpen(true)}
              className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              + Add Placeholder Member
            </button>
          </div>

          <div className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
            {members.map((m) => {
              const balance = ledger.balances.get(m.id) ?? 0;
              const isYou = m.userId === currentUserId;
              const isPlaceholder = m.userId === null;
              const canManageThisMember = (isCurrentUserOwner || (isCurrentUserAdmin && m.role !== 'owner')) && !isYou;

              return (
                <div key={m.id} className="p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-300">
                        {m.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {m.displayName}
                          </span>
                          {isYou && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                              You
                            </span>
                          )}
                          {isPlaceholder && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                              Placeholder
                            </span>
                          )}
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-semibold capitalize ${
                              m.role === 'owner'
                                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                                : m.role === 'admin'
                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                : 'bg-zinc-500/10 text-zinc-500'
                            }`}
                          >
                            {m.role}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        {balance > 0 ? (
                          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                            +{formatMinor(balance, group.currency)}
                          </span>
                        ) : balance < 0 ? (
                          <span className="text-sm font-bold text-orange-600 dark:text-orange-400 font-mono">
                            -{formatMinor(Math.abs(balance), group.currency)}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400 font-medium">settled</span>
                        )}
                      </div>

                      {canManageThisMember && (
                        <button
                          onClick={() => handleOpenMemberActions(m)}
                          className="w-8 h-8 rounded-lg border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          title="Manage member"
                        >
                          ⋯
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Placeholder Claim Invitation Trigger */}
                  {isPlaceholder && (
                    <div className="mt-1 flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/40 px-3 py-2 rounded-xl text-xs border border-zinc-200 dark:border-zinc-800/60">
                      <span className="text-zinc-400 text-[11px]">Not linked to an app account yet</span>
                      <button
                        onClick={() => handleGenerateClaimLink(m)}
                        className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        🔗 Copy Claim Link
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Leave Group Action */}
        <div className="pt-4">
          <button
            onClick={handleLeaveGroup}
            className="w-full py-3 text-sm font-semibold rounded-2xl border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            Leave Group
          </button>
        </div>
      </div>

      {/* Member Action Menu Modal */}
      {isActionModalOpen && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div>
              <h2 className="text-base font-bold">Manage {selectedMember.displayName}</h2>
              <p className="text-xs text-zinc-400">Current role: {selectedMember.role}</p>
            </div>

            <div className="space-y-2 pt-2">
              {/* Role management: Owner only */}
              {isCurrentUserOwner && selectedMember.role === 'member' && (
                <button
                  onClick={() => handlePromoteDemote(selectedMember, 'admin')}
                  className="w-full py-2.5 px-4 text-xs font-semibold rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 text-left flex items-center justify-between"
                >
                  <span>Promote to Admin</span>
                  <span>🛡️</span>
                </button>
              )}

              {isCurrentUserOwner && selectedMember.role === 'admin' && (
                <button
                  onClick={() => handlePromoteDemote(selectedMember, 'member')}
                  className="w-full py-2.5 px-4 text-xs font-semibold rounded-xl bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-500/20 text-left flex items-center justify-between"
                >
                  <span>Demote to Member</span>
                  <span>👤</span>
                </button>
              )}

              {/* Ownership transfer: Owner only */}
              {isCurrentUserOwner && (
                <button
                  onClick={() => initiateTransferOwnership(selectedMember)}
                  className="w-full py-2.5 px-4 text-xs font-semibold rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 text-left flex items-center justify-between"
                >
                  <span>Transfer Group Ownership</span>
                  <span>👑</span>
                </button>
              )}

              {/* Member removal */}
              <button
                onClick={() => initiateRemoveMember(selectedMember)}
                className="w-full py-2.5 px-4 text-xs font-semibold rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 text-left flex items-center justify-between"
              >
                <span>Remove from Group</span>
                <span>🚪</span>
              </button>
            </div>

            <button
              onClick={() => setIsActionModalOpen(false)}
              className="w-full py-2.5 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Remove Member Blocked Modal (Non-zero balance) */}
      {isRemoveBlockedModalOpen && memberToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-base font-bold">Cannot Remove Member</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              <span className="font-semibold text-zinc-200">{memberToRemove.displayName}</span> has an outstanding net balance of{' '}
              <span className="font-bold text-zinc-200 font-mono">
                {formatMinor(Math.abs(ledger.balances.get(memberToRemove.id) ?? 0), group.currency)}
              </span>
              . All balances must be settled to zero before removing a member.
            </p>
            <button
              onClick={() => {
                setIsRemoveBlockedModalOpen(false);
                setMemberToRemove(null);
              }}
              className="w-full py-2.5 text-xs font-semibold rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* Remove Member Confirmation Modal */}
      {isRemoveConfirmOpen && memberToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <h2 className="text-base font-bold">Remove {memberToRemove.displayName}?</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Their past splits and settled expense history will remain intact, but they will no longer be an active participant in this group.
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsRemoveConfirmOpen(false);
                  setMemberToRemove(null);
                }}
                className="flex-1 py-2.5 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemoveMember}
                className="flex-1 py-2.5 text-xs font-semibold rounded-xl bg-rose-600 text-white hover:bg-rose-500"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Ownership Confirmation Modal */}
      {isTransferConfirmOpen && transferTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <h2 className="text-base font-bold">Transfer Ownership?</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Are you sure you want to transfer group ownership to{' '}
              <span className="font-semibold text-zinc-200">{transferTarget.displayName}</span>? You will remain in the group as an admin.
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsTransferConfirmOpen(false);
                  setTransferTarget(null);
                }}
                className="flex-1 py-2.5 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmTransferOwnership}
                className="flex-1 py-2.5 text-xs font-semibold rounded-xl bg-purple-600 text-white hover:bg-purple-500"
              >
                Confirm Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sole Owner Cannot Leave Modal */}
      {isSoleOwnerLeaveBlockedOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center mx-auto">
              👑
            </div>
            <h2 className="text-base font-bold">Transfer Ownership First</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              As the group owner, you cannot leave while other active members exist. Please transfer group ownership to another member before leaving.
            </p>
            <button
              onClick={() => setIsSoleOwnerLeaveBlockedOpen(false)}
              className="w-full py-2.5 text-xs font-semibold rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* Leave Group Blocked Modal (Non-zero balance) */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-base font-bold">Cannot Leave Group</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              You have an active balance of{' '}
              <span className="font-bold text-zinc-200 font-mono">
                {formatMinor(Math.abs(userNetBalance), group.currency)}
              </span>
              . You must settle all balances to zero before leaving this group.
            </p>
            <button
              onClick={() => setIsLeaveModalOpen(false)}
              className="w-full py-2.5 text-xs font-semibold rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* Add Placeholder Member Modal */}
      {isAddPlaceholderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <h2 className="text-base font-bold">Add Group Member</h2>
            <p className="text-xs text-zinc-400">
              Add someone to track expenses with even if they don&apos;t have an app account yet. You can share a claim invite with them anytime.
            </p>

            <form onSubmit={handleAddPlaceholder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">
                  Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  placeholder="e.g. Sam, Priya"
                  value={placeholderName}
                  onChange={(e) => setPlaceholderName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddPlaceholderOpen(false)}
                  className="flex-1 py-2 text-xs font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
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
    <Suspense fallback={<div className="p-8 text-center text-sm text-zinc-500">Loading members...</div>}>
      <GroupMembersContent />
    </Suspense>
  );
}
