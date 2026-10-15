'use client';

// app/join/page.tsx
// Group Invitation Route for Invite Code & Placeholder Member Claim Processing (US-04, Tasks 2.7.2)

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRepository } from '../../lib/data/hooks';
import { getAuthState } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

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

    const cleanCode = code.trim().toUpperCase();
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
      const memberId = crypto.randomUUID();
      const { data, error: rpcError } = await supabase.rpc('join_group_v1', {
        p_code: cleanCode,
        p_invite_code: cleanCode,
        p_member_id: memberId,
      });

      if (rpcError) {
        // If group not found
        if (rpcError.code === 'PT404' || rpcError.message?.includes('INVITE_INVALID') || rpcError.message?.includes('not found')) {
          throw new Error(`Group not found with code "${cleanCode}". Please verify the code and try again.`);
        }
        // If offline / network error, fallback to offline queue
        if (rpcError.message?.includes('Failed to fetch') || (typeof navigator !== 'undefined' && !navigator.onLine)) {
          repo.joinGroup(cleanCode, currentUserId);
          router.push('/');
          return;
        }
        throw new Error(rpcError.message || 'Failed to join group');
      }

      // Write newly joined group and its members directly into the local store
      if (data?.group) {
        const g = data.group;
        repo.store.upsertGroup({
          id: g.id,
          name: g.name,
          type: g.type || 'trip',
          currency: g.currency,
          inviteCode: g.invite_code,
          createdBy: g.created_by,
          version: g.version || 1,
          createdAt: g.created_at,
          updatedAt: g.updated_at,
          _sync: 'synced',
        });

        if (Array.isArray(data.members)) {
          for (const m of data.members) {
            repo.store.upsertMember({
              id: m.id,
              groupId: m.group_id,
              userId: m.user_id,
              displayName: m.display_name,
              role: m.role,
              joinedAt: m.joined_at,
              leftAt: m.left_at,
              createdAt: m.created_at,
              updatedAt: m.updated_at,
              _sync: 'synced',
            });
          }
        } else if (data.member) {
          const m = data.member;
          repo.store.upsertMember({
            id: m.id,
            groupId: m.group_id,
            userId: m.user_id,
            displayName: m.display_name,
            role: m.role,
            joinedAt: m.joined_at,
            leftAt: m.left_at,
            createdAt: m.created_at,
            updatedAt: m.updated_at,
            _sync: 'synced',
          });
        }

        // Kick background sync to pull recent expenses
        repo.syncManager?.kick('join_group').catch(() => {});

        // Direct navigation to the joined group
        router.push(`/group?id=${g.id}`);
      } else {
        router.push('/');
      }
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
      const { data, error: rpcError } = await supabase.rpc('claim_placeholder_v1', {
        p_claim_token: cleanClaim,
      });

      if (rpcError) {
        if (rpcError.code === 'PT404' || rpcError.message?.includes('CLAIM_INVALID')) {
          throw new Error('Invalid or expired claim token. Please ask the group admin for a new link.');
        }
        if (rpcError.message?.includes('Failed to fetch') || (typeof navigator !== 'undefined' && !navigator.onLine)) {
          repo.claimPlaceholder(cleanClaim);
          router.push('/');
          return;
        }
        throw new Error(rpcError.message || 'Failed to claim member profile');
      }

      if (data?.member) {
        const m = data.member;
        repo.store.upsertMember({
          id: m.id,
          groupId: m.group_id,
          userId: m.user_id,
          displayName: m.display_name,
          role: m.role,
          joinedAt: m.joined_at,
          leftAt: m.left_at,
          createdAt: m.created_at,
          updatedAt: m.updated_at,
          _sync: 'synced',
        });
        repo.syncManager?.kick('claim_placeholder').catch(() => {});
        router.push(`/group?id=${m.group_id}`);
      } else {
        router.push('/');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to claim member profile');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-black flex flex-col justify-between p-4 sm:p-6 font-sans">
      <div className="max-w-md mx-auto w-full space-y-6 pt-4">
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="w-10 h-10 rounded-lg border-2 border-black bg-white flex items-center justify-center font-black text-black hover:bg-[#ffd600] shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition"
          >
            ←
          </Link>
          <h1 className="text-sm font-mono font-black uppercase tracking-wider">
            {activeTab === 'claim' ? 'CLAIM PROFILE' : 'JOIN GROUP'}
          </h1>
          <div className="w-10" />
        </header>

        {/* Tab Selector */}
        <div className="flex bg-[#f0f0ea] border-2 border-black p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('invite')}
            className={`flex-1 py-2 text-xs font-mono font-black uppercase rounded-lg transition-all ${
              activeTab === 'invite'
                ? 'bg-black text-[#ccff00] border-2 border-black shadow-[2px_2px_0px_0px_#000]'
                : 'text-black/60 hover:text-black'
            }`}
          >
            JOIN BY CODE
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('claim')}
            className={`flex-1 py-2 text-xs font-mono font-black uppercase rounded-lg transition-all ${
              activeTab === 'claim'
                ? 'bg-black text-[#ccff00] border-2 border-black shadow-[2px_2px_0px_0px_#000]'
                : 'text-black/60 hover:text-black'
            }`}
          >
            CLAIM PROFILE
          </button>
        </div>

        <div className="p-6 rounded-xl border-2 border-black bg-white shadow-[4px_4px_0px_0px_#000] space-y-5">
          {error && (
            <div className="p-3 rounded-lg text-xs font-mono font-bold bg-[#ff8a80] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]">
              ⚠️ {error}
            </div>
          )}

          {activeTab === 'invite' ? (
            <>
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-lg border-2 border-black bg-[#ffd600] flex items-center justify-center mx-auto text-xl shadow-[2px_2px_0px_0px_#000]">
                  🤝
                </div>
                <h2 className="text-base font-mono font-black uppercase">YOU&apos;RE INVITED!</h2>
                <p className="text-xs font-mono text-black/60">
                  Enter the invite code shared by your group peer.
                </p>
              </div>

              <form onSubmit={handleJoin} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono font-black uppercase mb-1">
                    INVITE CODE
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    placeholder="E.G. ABC123"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full px-4 py-3 text-center text-lg font-mono font-black tracking-widest rounded-lg border-2 border-black bg-white text-black focus:outline-none focus:bg-[#faffea] uppercase shadow-[2px_2px_0px_0px_#000]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 text-xs font-mono font-black uppercase rounded-lg border-2 border-black bg-[#ccff00] text-black hover:bg-black hover:text-[#ccff00] shadow-[3px_3px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 transition"
                >
                  {isSubmitting ? 'JOINING GROUP...' : 'JOIN GROUP'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-lg border-2 border-black bg-[#00e5ff] flex items-center justify-center mx-auto text-xl shadow-[2px_2px_0px_0px_#000]">
                  🎫
                </div>
                <h2 className="text-base font-mono font-black uppercase">CLAIM GUEST PROFILE</h2>
                <p className="text-xs font-mono text-black/60">
                  Were you added before having an account? Claim your profile to link past expenses and ledger records.
                </p>
              </div>

              <form onSubmit={handleClaimPlaceholder} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono font-black uppercase mb-1">
                    CLAIM TOKEN
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={64}
                    placeholder="PASTE CLAIM TOKEN"
                    value={claimToken}
                    onChange={(e) => setClaimToken(e.target.value)}
                    className="w-full px-4 py-3 text-center text-xs font-mono font-black tracking-wider rounded-lg border-2 border-black bg-white text-black focus:outline-none focus:bg-[#faffea] shadow-[2px_2px_0px_0px_#000]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 text-xs font-mono font-black uppercase rounded-lg border-2 border-black bg-[#00e5ff] text-black hover:bg-black hover:text-[#00e5ff] shadow-[3px_3px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 transition"
                >
                  {isSubmitting ? 'CLAIMING PROFILE...' : 'CLAIM MEMBER PROFILE'}
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
        <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center text-black text-xs font-mono font-black uppercase">
          Loading invitation...
        </div>
      }
    >
      <JoinContent />
    </Suspense>
  );
}
