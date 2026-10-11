'use client';

// app/group/members/page.tsx
// Member Management, Placeholder Member Creation, Invite Code Sharing & Leave Group Action

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
  const userNetBalance = currentMember ? ledger.balances.get(currentMember.id) ?? 0 : 0;

  const [isAddPlaceholderOpen, setIsAddPlaceholderOpen] = useState(false);
  const [placeholderName, setPlaceholderName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Leave group modal state
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);

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

  const handleLeaveGroup = () => {
    if (userNetBalance !== 0) {
      setIsLeaveModalOpen(true);
      return;
    }

    try {
      repo.queue.enqueue('LEAVE_GROUP', groupId, { groupId });
      repo.syncManager?.kick('leave_group').catch(() => {});
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

        {/* Invite Code Card */}
        <div className="p-5 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold">Invite Friends</h2>
              <p className="text-xs text-zinc-400">Share this code or link with group members</p>
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

              return (
                <div key={m.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-300">
                      {m.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {m.displayName}
                        </span>
                        {isYou && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                            You
                          </span>
                        )}
                        {isPlaceholder && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-500 font-medium">
                            Offline
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-400 capitalize block">{m.role}</span>
                    </div>
                  </div>

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

      {/* Add Placeholder Member Modal */}
      {isAddPlaceholderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <h2 className="text-base font-bold">Add Group Member</h2>
            <p className="text-xs text-zinc-400">
              Add someone to track expenses with even if they don&apos;t have an app account yet.
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
