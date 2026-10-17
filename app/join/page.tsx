'use client';

// app/join/page.tsx
// Group Invitation Route for Invite Code Processing

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

  const repo = useRepository();
  const authState = getAuthState();
  const currentUserId = authState.user?.id;

  const [code, setCode] = useState(rawCode);
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

  return (
    <div className="min-h-screen bg-transparent text-[#432E22] flex flex-col justify-between p-4 sm:p-6 font-sans">
      <div className="max-w-md mx-auto w-full space-y-6 pt-4">
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="w-10 h-10 rounded-full border border-[#E5D9CC] bg-[#FAF6F0] flex items-center justify-center text-[#543A2A] hover:bg-[#EFE4D6] shadow-sm active:scale-95 transition cursor-pointer"
          >
            ←
          </Link>
          <h1 className="text-sm sm:text-base font-bold tracking-tight text-[#432E22]">
            Join Group
          </h1>
          <div className="w-10" />
        </header>

        <div className="p-6 sm:p-8 rounded-3xl border border-[#E5D9CC] bg-white shadow-xl space-y-5">
          {error && (
            <div className="p-3.5 rounded-2xl text-xs font-semibold bg-[#FCE8E6] text-[#A83232] border border-[#F5C2C0] shadow-xs">
              ⚠️ {error}
            </div>
          )}

          <div className="text-center space-y-1.5">
            <div className="w-14 h-14 rounded-2xl bg-[#EFE4D6] text-[#543A2A] flex items-center justify-center mx-auto text-2xl shadow-sm">
              🤝
            </div>
            <h2 className="text-base font-bold text-[#432E22]">You&apos;re Invited!</h2>
            <p className="text-xs text-[#8D7868] font-medium">
              Enter the invite code shared by your group peer.
            </p>
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#432E22] mb-1.5">
                Invite Code
              </label>
              <input
                type="text"
                required
                maxLength={32}
                placeholder="e.g. ABC123"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 text-center text-lg font-bold tracking-widest rounded-2xl border border-[#E5D9CC] bg-[#FAF6F0] text-[#432E22] focus:outline-none focus:border-[#543A2A] uppercase shadow-xs transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 text-xs font-bold uppercase tracking-wider rounded-full bg-[#543A2A] text-[#FAF6F0] hover:bg-[#432E20] shadow-md active:scale-95 disabled:opacity-50 transition cursor-pointer"
            >
              {isSubmitting ? 'Joining group...' : 'Join Group'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-transparent flex items-center justify-center text-[#8D7868] text-xs font-bold">
          Loading invitation...
        </div>
      }
    >
      <JoinContent />
    </Suspense>
  );
}
