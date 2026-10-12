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
      <div className="min-h-screen bg-[#f5f5f0] p-6 flex flex-col items-center justify-center text-center">
        <h2 className="text-base font-mono font-black mb-2 uppercase">Group not found</h2>
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 text-xs font-mono font-black rounded-lg border-2 border-black bg-[#ccff00] text-black shadow-[2px_2px_0px_0px_#000]"
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
      const claimUrl = `${window.location.origin}/join?code=${group.inviteCode}&claimMemberId=${member.id}`;
      await navigator.clipboard.writeText(claimUrl);
      setClaimLinkStatus(`Claim link copied for ${member.displayName}!`);
      setTimeout(() => setClaimLinkStatus(null), 3500);
    } catch {
      setClaimLinkStatus(`Invite code: ${group.inviteCode}`);
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
    <div className="min-h-screen bg-[#f5f5f0] text-black p-4 sm:p-6 pb-24 font-sans">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between pt-1">
          <Link
            href={`/group?id=${groupId}`}
            className="w-10 h-10 rounded-lg border-2 border-black bg-white flex items-center justify-center text-black font-black hover:bg-[#ffd600] shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-transform"
          >
            ←
          </Link>

          <h1 className="text-sm font-mono font-black uppercase tracking-wider">
            MEMBERS & PERMISSIONS
          </h1>

          <div className="w-10" />
        </header>

        {errorMessage && (
          <div className="p-3 rounded-lg text-xs font-mono font-bold bg-[#ff8a80] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]">
            ⚠️ {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-lg text-xs font-mono font-bold bg-[#ccff00] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]">
            ✓ {successMessage}
          </div>
        )}

        {claimLinkStatus && (
          <div className="p-3 rounded-lg text-xs font-mono font-bold bg-[#00e5ff] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]">
            🔗 {claimLinkStatus}
          </div>
        )}

        {/* Invite Code Card */}
        <div className="p-4 sm:p-5 rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_0px_#000] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-mono font-black uppercase tracking-wider">
                GROUP INVITE LINK
              </h2>
              <p className="text-[11px] font-mono text-black/60">Share this code with friends to join</p>
            </div>
            <span className="px-2 py-0.5 rounded border border-black bg-[#ffd600] text-xs font-mono font-black">
              CODE
            </span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 px-3.5 py-2.5 rounded-lg border-2 border-black bg-[#f0f0ea] font-mono text-sm font-black text-center tracking-widest text-black select-all">
              {group.inviteCode || 'GENERATING...'}
            </div>
            {group.inviteCode && (
              <button
                onClick={handleCopyInviteCode}
                className="px-4 py-2.5 text-xs font-mono font-black rounded-lg border-2 border-black bg-[#ccff00] text-black hover:bg-black hover:text-[#ccff00] shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition"
              >
                {copiedInvite ? 'COPIED!' : 'COPY'}
              </button>
            )}
          </div>
        </div>

        {/* Members List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-mono font-black uppercase tracking-wider text-black">
              MEMBERS ROSTER ({members.length})
            </h2>
            <button
              onClick={() => setIsAddPlaceholderOpen(true)}
              className="px-2.5 py-1 text-xs font-mono font-black rounded border-2 border-black bg-[#ccff00] text-black shadow-[2px_2px_0px_0px_#000] hover:bg-black hover:text-[#ccff00] active:translate-x-0.5 active:translate-y-0.5 transition"
            >
              + ADD MEMBER
            </button>
          </div>

          <div className="divide-y-2 divide-black rounded-xl border-2 border-black bg-white shadow-[3px_3px_0px_0px_#000] overflow-hidden">
            {members.map((m) => {
              const balance = ledger.balances.get(m.id) ?? 0;
              const isYou = m.userId === currentUserId;
              const isPlaceholder = m.userId === null;
              const canManageThisMember = (isCurrentUserOwner || (isCurrentUserAdmin && m.role !== 'owner')) && !isYou;

              return (
                <div key={m.id} className="p-3.5 flex flex-col gap-2 hover:bg-[#fafaf6] transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg border-2 border-black bg-[#00e5ff] flex items-center justify-center text-sm font-mono font-black text-black shrink-0 shadow-[1px_1px_0px_0px_#000]">
                        {m.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs sm:text-sm font-mono font-black text-black truncate">
                            {m.displayName}
                          </span>
                          {isYou && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded border border-black bg-[#ccff00] text-black font-mono font-black uppercase">
                              YOU
                            </span>
                          )}
                          {isPlaceholder && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded border border-black bg-[#ffd600] text-black font-mono font-black uppercase">
                              GUEST
                            </span>
                          )}
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded border border-black font-mono font-bold uppercase ${
                              m.role === 'owner'
                                ? 'bg-purple-200 text-black'
                                : m.role === 'admin'
                                ? 'bg-blue-200 text-black'
                                : 'bg-[#f0f0ea] text-black/70'
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
                          <span className="px-2 py-0.5 rounded border border-black bg-[#ccff00] text-xs font-mono font-black text-black">
                            +{formatMinor(balance, group.currency)}
                          </span>
                        ) : balance < 0 ? (
                          <span className="px-2 py-0.5 rounded border border-black bg-[#ff8a80] text-xs font-mono font-black text-black">
                            -{formatMinor(Math.abs(balance), group.currency)}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded border border-black bg-[#f0f0ea] text-[10px] font-mono font-bold text-black/60 uppercase">
                            SETTLED
                          </span>
                        )}
                      </div>

                      {canManageThisMember && (
                        <button
                          onClick={() => handleOpenMemberActions(m)}
                          className="w-7 h-7 rounded border-2 border-black bg-white flex items-center justify-center text-xs font-mono font-black hover:bg-[#ffd600] shadow-[1px_1px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition"
                          title="Manage member"
                        >
                          ⋯
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Placeholder Claim Invitation Trigger */}
                  {isPlaceholder && (
                    <div className="mt-1 flex items-center justify-between bg-[#f0f0ea] px-3 py-1.5 rounded-lg border-2 border-black text-xs font-mono">
                      <span className="text-black/60 text-[10px] uppercase font-bold">Unclaimed guest account</span>
                      <button
                        onClick={() => handleGenerateClaimLink(m)}
                        className="text-[10px] font-black text-black underline hover:bg-[#ffd600] px-1 rounded flex items-center gap-1 uppercase"
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
        <div className="pt-2">
          <button
            onClick={handleLeaveGroup}
            className="w-full py-3 text-xs font-mono font-black uppercase rounded-xl border-2 border-black bg-white text-rose-600 hover:bg-[#ff8a80] hover:text-black shadow-[3px_3px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition"
          >
            LEAVE GROUP
          </button>
        </div>
      </div>

      {/* Member Action Menu Modal */}
      {isActionModalOpen && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-white border-2 border-black rounded-xl p-6 shadow-[6px_6px_0px_0px_#000] space-y-4">
            <div>
              <h2 className="text-sm font-mono font-black uppercase">MANAGE {selectedMember.displayName}</h2>
              <p className="text-xs font-mono text-black/60">Current role: {selectedMember.role.toUpperCase()}</p>
            </div>

            <div className="space-y-2 pt-2">
              {/* Role management: Owner only */}
              {isCurrentUserOwner && selectedMember.role === 'member' && (
                <button
                  onClick={() => handlePromoteDemote(selectedMember, 'admin')}
                  className="w-full py-2.5 px-4 text-xs font-mono font-black rounded-lg border-2 border-black bg-blue-100 text-black hover:bg-blue-200 text-left flex items-center justify-between shadow-[2px_2px_0px_0px_#000]"
                >
                  <span>PROMOTE TO ADMIN</span>
                  <span>🛡️</span>
                </button>
              )}

              {isCurrentUserOwner && selectedMember.role === 'admin' && (
                <button
                  onClick={() => handlePromoteDemote(selectedMember, 'member')}
                  className="w-full py-2.5 px-4 text-xs font-mono font-black rounded-lg border-2 border-black bg-[#f0f0ea] text-black hover:bg-[#e4e4dd] text-left flex items-center justify-between shadow-[2px_2px_0px_0px_#000]"
                >
                  <span>DEMOTE TO MEMBER</span>
                  <span>👤</span>
                </button>
              )}

              {/* Ownership transfer: Owner only */}
              {isCurrentUserOwner && (
                <button
                  onClick={() => initiateTransferOwnership(selectedMember)}
                  className="w-full py-2.5 px-4 text-xs font-mono font-black rounded-lg border-2 border-black bg-purple-100 text-black hover:bg-purple-200 text-left flex items-center justify-between shadow-[2px_2px_0px_0px_#000]"
                >
                  <span>TRANSFER GROUP OWNERSHIP</span>
                  <span>👑</span>
                </button>
              )}

              {/* Member removal */}
              <button
                onClick={() => initiateRemoveMember(selectedMember)}
                className="w-full py-2.5 px-4 text-xs font-mono font-black rounded-lg border-2 border-black bg-[#ff8a80] text-black hover:bg-rose-400 text-left flex items-center justify-between shadow-[2px_2px_0px_0px_#000]"
              >
                <span>REMOVE FROM GROUP</span>
                <span>🚪</span>
              </button>
            </div>

            <button
              onClick={() => setIsActionModalOpen(false)}
              className="w-full py-2.5 text-xs font-mono font-black uppercase rounded-lg border-2 border-black bg-[#f0f0ea] text-black hover:bg-white shadow-[2px_2px_0px_0px_#000]"
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* Remove Member Blocked Modal (Non-zero balance) */}
      {isRemoveBlockedModalOpen && memberToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-white border-2 border-black rounded-xl p-6 shadow-[6px_6px_0px_0px_#000] text-center space-y-3">
            <div className="w-12 h-12 rounded-lg border-2 border-black bg-[#ff8a80] text-black flex items-center justify-center mx-auto text-xl font-mono font-black shadow-[2px_2px_0px_0px_#000]">
              !
            </div>
            <h2 className="text-sm font-mono font-black uppercase">CANNOT REMOVE MEMBER</h2>
            <p className="text-xs font-mono text-black leading-relaxed">
              <span className="font-black">{memberToRemove.displayName}</span> has an outstanding balance of{' '}
              <span className="font-black bg-[#ffd600] px-1 rounded border border-black">
                {formatMinor(Math.abs(ledger.balances.get(memberToRemove.id) ?? 0), group.currency)}
              </span>
              . All balances must be settled to zero before removing a member.
            </p>
            <button
              onClick={() => {
                setIsRemoveBlockedModalOpen(false);
                setMemberToRemove(null);
              }}
              className="w-full py-2.5 text-xs font-mono font-black uppercase rounded-lg border-2 border-black bg-[#ccff00] text-black shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5"
            >
              UNDERSTOOD
            </button>
          </div>
        </div>
      )}

      {/* Remove Member Confirmation Modal */}
      {isRemoveConfirmOpen && memberToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-white border-2 border-black rounded-xl p-6 shadow-[6px_6px_0px_0px_#000] space-y-4">
            <h2 className="text-sm font-mono font-black uppercase">REMOVE {memberToRemove.displayName}?</h2>
            <p className="text-xs font-mono text-black leading-relaxed">
              Past splits and settled expenses will remain intact in the ledger, but they will no longer participate in this group.
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsRemoveConfirmOpen(false);
                  setMemberToRemove(null);
                }}
                className="flex-1 py-2.5 text-xs font-mono font-black uppercase rounded-lg border-2 border-black bg-[#f0f0ea] text-black"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={confirmRemoveMember}
                className="flex-1 py-2.5 text-xs font-mono font-black uppercase rounded-lg border-2 border-black bg-[#ff8a80] text-black shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5"
              >
                REMOVE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Ownership Confirmation Modal */}
      {isTransferConfirmOpen && transferTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-white border-2 border-black rounded-xl p-6 shadow-[6px_6px_0px_0px_#000] space-y-4">
            <h2 className="text-sm font-mono font-black uppercase">TRANSFER OWNERSHIP?</h2>
            <p className="text-xs font-mono text-black leading-relaxed">
              Transfer group ownership to <span className="font-black">{transferTarget.displayName}</span>? You will remain in the group as an admin.
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsTransferConfirmOpen(false);
                  setTransferTarget(null);
                }}
                className="flex-1 py-2.5 text-xs font-mono font-black uppercase rounded-lg border-2 border-black bg-[#f0f0ea] text-black"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={confirmTransferOwnership}
                className="flex-1 py-2.5 text-xs font-mono font-black uppercase rounded-lg border-2 border-black bg-[#00e5ff] text-black shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5"
              >
                CONFIRM TRANSFER
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sole Owner Cannot Leave Modal */}
      {isSoleOwnerLeaveBlockedOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-white border-2 border-black rounded-xl p-6 shadow-[6px_6px_0px_0px_#000] text-center space-y-3">
            <div className="w-12 h-12 rounded-lg border-2 border-black bg-[#ffd600] text-black flex items-center justify-center mx-auto text-xl font-mono font-black shadow-[2px_2px_0px_0px_#000]">
              👑
            </div>
            <h2 className="text-sm font-mono font-black uppercase">TRANSFER OWNERSHIP FIRST</h2>
            <p className="text-xs font-mono text-black leading-relaxed">
              As the sole group owner, you cannot leave while other active members exist. Please transfer ownership to another member before leaving.
            </p>
            <button
              onClick={() => setIsSoleOwnerLeaveBlockedOpen(false)}
              className="w-full py-2.5 text-xs font-mono font-black uppercase rounded-lg border-2 border-black bg-[#ccff00] text-black shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5"
            >
              UNDERSTOOD
            </button>
          </div>
        </div>
      )}

      {/* Leave Group Blocked Modal (Non-zero balance) */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-white border-2 border-black rounded-xl p-6 shadow-[6px_6px_0px_0px_#000] text-center space-y-3">
            <div className="w-12 h-12 rounded-lg border-2 border-black bg-[#ff8a80] text-black flex items-center justify-center mx-auto text-xl font-mono font-black shadow-[2px_2px_0px_0px_#000]">
              !
            </div>
            <h2 className="text-sm font-mono font-black uppercase">CANNOT LEAVE GROUP</h2>
            <p className="text-xs font-mono text-black leading-relaxed">
              You have an active balance of{' '}
              <span className="font-black bg-[#ffd600] px-1 rounded border border-black">
                {formatMinor(Math.abs(userNetBalance), group.currency)}
              </span>
              . You must settle all balances to zero before leaving this group.
            </p>
            <button
              onClick={() => setIsLeaveModalOpen(false)}
              className="w-full py-2.5 text-xs font-mono font-black uppercase rounded-lg border-2 border-black bg-[#ccff00] text-black shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5"
            >
              UNDERSTOOD
            </button>
          </div>
        </div>
      )}

      {/* Add Placeholder Member Modal */}
      {isAddPlaceholderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-white border-2 border-black rounded-xl p-6 shadow-[6px_6px_0px_0px_#000] space-y-4">
            <h2 className="text-sm font-mono font-black uppercase">ADD GROUP MEMBER</h2>
            <p className="text-xs font-mono text-black/60">
              Add a friend to track expenses with even before they install the app. You can share a claim link with them anytime.
            </p>

            <form onSubmit={handleAddPlaceholder} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-black uppercase mb-1">
                  MEMBER NAME
                </label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  placeholder="e.g. Sam, Priya"
                  value={placeholderName}
                  onChange={(e) => setPlaceholderName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs font-mono font-black rounded-lg border-2 border-black bg-white focus:outline-none focus:bg-[#faffea] shadow-[2px_2px_0px_0px_#000]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddPlaceholderOpen(false)}
                  className="flex-1 py-2 text-xs font-mono font-black uppercase rounded-lg border-2 border-black bg-[#f0f0ea] text-black"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-mono font-black uppercase rounded-lg border-2 border-black bg-[#ccff00] text-black shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5"
                >
                  ADD MEMBER
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
    <Suspense fallback={<div className="p-8 text-center text-xs font-mono font-black uppercase">Loading roster...</div>}>
      <GroupMembersContent />
    </Suspense>
  );
}
