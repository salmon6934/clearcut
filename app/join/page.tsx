'use client';

// app/join/page.tsx
// Group Invitation Route for Invite Code & Placeholder Member Claim Processing (US-04, Tasks 2.7.2)

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRepository } from '../../lib/data/hooks';
import { getAuthState } from '../../lib/auth';

function JoinContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawCode = searchParams.get('code') || '';
  const rawClaim = searchParams.get('claim') || '';

  const repo = useRepository();
  const authState = getAuthState();
  const currentUserId = authState.user?.id;

  const [activeTab, setActiveTab] = useState<'invite' | 'claim'>(rawClaim ? 'claim' : 'invite');
  const [code, setCode] = useState(rawCode);
  const [claimToken, setClaimToken] = useState(rawClaim);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCode = code.trim().toLowerCase();
    if (!cleanCode) {
      setError('Please enter an invite code');
      return;
    }

    if (!currentUserId) {
      // Store code to resume after sign-in
      if (typeof window !== 'undefined') {
        localStorage.setItem('pending_join_code', cleanCode);
      }
      router.push('/auth');
      return;
    }

    setIsSubmitting(true);
    try {
      repo.joinGroup(cleanCode, currentUserId);
      // Kick sync immediately to fetch the group data from Supabase
      await repo.syncManager?.kick('join_group');
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Failed to join group');
      setIsSubmitting(false);
    }
  };

  const handleClaimPlaceholder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanClaim = claimToken.trim();
    if (!cleanClaim) {
      setError('Please enter a claim token');
      return;
    }

    if (!currentUserId) {
      // Store claim token to resume after sign-in
      if (typeof window !== 'undefined') {
        localStorage.setItem('pending_claim_token', cleanClaim);
      }
      router.push('/auth');
      return;
    }

    setIsSubmitting(true);
    try {
      repo.claimPlaceholder(cleanClaim);
      await repo.syncManager?.kick('claim_placeholder');
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Failed to claim member profile');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col justify-between p-6">
      <div className="max-w-md mx-auto w-full space-y-6 pt-6">
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="w-9 h-9 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-base font-bold">
            {activeTab === 'claim' ? 'Claim Group Profile' : 'Join Group'}
          </h1>
          <div className="w-9" />
        </header>

        {/* Tab Selector */}
        <div className="flex bg-zinc-200/60 dark:bg-zinc-800/60 p-1 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('invite')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'invite'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            Join by Code
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('claim')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'claim'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            Claim Member Profile
          </button>
        </div>

        <div className="p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm space-y-4">
          {error && (
            <div className="p-3 rounded-xl text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
              {error}
            </div>
          )}

          {activeTab === 'invite' ? (
            <>
              <div className="text-center space-y-1">
                <span className="text-3xl">🤝</span>
                <h2 className="text-lg font-bold">You&apos;re Invited!</h2>
                <p className="text-xs text-zinc-400">
                  Enter the invite code shared by the group owner.
                </p>
              </div>

              <form onSubmit={handleJoin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">
                    Invite Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    placeholder="e.g. A1B2C3D4"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full px-4 py-3 text-center text-lg font-mono font-bold tracking-widest rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 text-sm font-bold rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-all"
                >
                  {isSubmitting ? 'Joining group...' : 'Join Group'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="text-center space-y-1">
                <span className="text-3xl">🎫</span>
                <h2 className="text-lg font-bold">Claim Offline Profile</h2>
                <p className="text-xs text-zinc-400">
                  Were you added before having an account? Claim your profile to link all past expense history, splits, and balances seamlessly.
                </p>
              </div>

              <form onSubmit={handleClaimPlaceholder} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">
                    Claim Token
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={64}
                    placeholder="Enter claim token"
                    value={claimToken}
                    onChange={(e) => setClaimToken(e.target.value)}
                    className="w-full px-4 py-3 text-center text-sm font-mono font-bold tracking-wider rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 text-sm font-bold rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all"
                >
                  {isSubmitting ? 'Claiming profile...' : 'Claim Member Profile'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center text-zinc-400 text-sm">
          Loading invitation...
        </div>
      }
    >
      <JoinContent />
    </Suspense>
  );
}
