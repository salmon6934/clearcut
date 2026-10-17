'use client';

// app/page.tsx

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useRepository,
  useAllGroups,
  useDashboardTotals,
  useFriendsBalances,
} from '../lib/data/hooks';
import { selectGroupLedger } from '../lib/data/selectors';
import { formatMinor } from '../lib/engine/money';
import { SyncBadge } from '../components/SyncBadge';
import { EmptyState } from '../components/EmptyState';
import { BottomNav } from '../components/BottomNav';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import type { GroupType } from '../lib/data/types';
import { initDeepLinkListener } from '../lib/native/deeplink';

const GROUP_TYPE_CONFIG: Record<
  GroupType,
  { emoji: string; badgeIcon: string; label: string; tagBg: string; thumbnailBg: string }
> = {
  trip: {
    emoji: '🏖️',
    badgeIcon: '✈️',
    label: 'TRIP',
    tagBg: 'bg-[#D4B89B] text-[#432E22]',
    thumbnailBg: 'bg-[#EFE4D6]',
  },
  home: {
    emoji: '🏠',
    badgeIcon: '📶',
    label: 'HOME',
    tagBg: 'bg-[#DEC4AC] text-[#432E22]',
    thumbnailBg: 'bg-[#F2E7DC]',
  },
  couple: {
    emoji: '🍷',
    badgeIcon: '❤️',
    label: 'COUPLE',
    tagBg: 'bg-[#E5BFB0] text-[#432E22]',
    thumbnailBg: 'bg-[#F7EAE5]',
  },
  other: {
    emoji: '☕',
    badgeIcon: '✨',
    label: 'SHARED',
    tagBg: 'bg-[#DFC8B2] text-[#432E22]',
    thumbnailBg: 'bg-[#F4ECE2]',
  },
};

const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AED', 'SGD'];

let hasClientHydrated = false;

export default function DashboardPage() {
  const router = useRouter();
  const authState = useAuth();
  const currentUserId = authState.user?.id || 'local_user';
  const repo = useRepository(currentUserId);

  const activeGroups = useAllGroups(repo, false);
  const dashboardTotals = useDashboardTotals(repo, currentUserId);
  const friends = useFriendsBalances(repo, currentUserId);

  const [mounted, setMounted] = useState(hasClientHydrated);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isTopMenuOpen, setIsTopMenuOpen] = useState(false);
  const [isSelectTargetModalOpen, setIsSelectTargetModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<GroupType>('trip');
  const [newGroupCurrency, setNewGroupCurrency] = useState('INR');
  const [createError, setCreateError] = useState<string | null>(null);

  // Join group modal states
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    hasClientHydrated = true;
    setMounted(true);
    repo.syncManager?.kick('dashboard_mount', false).catch(() => { });
  }, [repo]);

  // Realtime subscription on Dashboard for changes across all user groups
  useEffect(() => {
    if (!currentUserId || currentUserId === 'local_user') return;
    const channel = supabase.channel(`dashboard-realtime:${currentUserId}`);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleRemoteChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        repo.syncManager?.kick('dashboard_realtime_hint', true).catch(() => { });
      }, 300);
    };

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, handleRemoteChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements' }, handleRemoteChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, handleRemoteChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, handleRemoteChange)
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel).catch(() => { });
    };
  }, [currentUserId, repo]);

  // Initialize native deep link router
  useEffect(() => {
    const unsubscribe = initDeepLinkListener((route) => {
      router.push(route);
    });
    return () => unsubscribe();
  }, [router]);

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!newGroupName.trim()) {
      setCreateError('Group name is required');
      return;
    }

    try {
      const { group } = repo.createGroup(
        {
          name: newGroupName.trim(),
          type: newGroupType,
          currency: newGroupCurrency,
        },
        currentUserId,
        authState.profile?.displayName || 'You'
      );

      setIsCreateModalOpen(false);
      setNewGroupName('');
      router.push(`/group?id=${group.id}`);
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create group');
    }
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);

    const cleanCode = joinCode.trim().toUpperCase();
    if (!cleanCode) {
      setJoinError('Please enter an invite code');
      return;
    }

    if (!currentUserId || currentUserId === 'local_user') {
      if (typeof window !== 'undefined') {
        localStorage.setItem('pending_join_code', cleanCode);
      }
      router.push('/auth');
      return;
    }

    setIsJoining(true);
    try {
      const memberId = crypto.randomUUID();
      const { data, error: rpcError } = await supabase.rpc('join_group_v1', {
        p_code: cleanCode,
        p_invite_code: cleanCode,
        p_member_id: memberId,
      });

      if (rpcError) {
        if (
          rpcError.code === 'PT404' ||
          rpcError.message?.includes('INVITE_INVALID') ||
          rpcError.message?.includes('not found')
        ) {
          throw new Error(`Group not found with code "${cleanCode}". Please verify the code and try again.`);
        }
        if (
          rpcError.message?.includes('Failed to fetch') ||
          (typeof navigator !== 'undefined' && !navigator.onLine)
        ) {
          repo.joinGroup(cleanCode, currentUserId);
          setIsJoinModalOpen(false);
          setJoinCode('');
          return;
        }
        throw new Error(rpcError.message || 'Failed to join group');
      }

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

        repo.syncManager?.kick('join_group').catch(() => { });
        setIsJoinModalOpen(false);
        setJoinCode('');
        router.push(`/group?id=${g.id}`);
      } else {
        setIsJoinModalOpen(false);
      }
    } catch (err: any) {
      setJoinError(err.message || 'Failed to join group');
    } finally {
      setIsJoining(false);
    }
  };

  const activeCurrencies = Object.keys(dashboardTotals.netPerCurrency);
  const primaryCurrency = activeCurrencies.includes('INR')
    ? 'INR'
    : activeCurrencies[0] || 'INR';

  const primaryOwed = dashboardTotals.totalOwedToYouByCurrency[primaryCurrency] || 0;
  const primaryOwe = dashboardTotals.totalYouOweByCurrency[primaryCurrency] || 0;
  const isOwed = primaryOwed > 0;
  const owes = primaryOwe > 0;

  if (!mounted) {
    return (
      <div className="min-h-screen bg-transparent text-[#432E22] flex flex-col justify-between pb-24">
        <div className="max-w-xl mx-auto w-full p-4 sm:p-5 space-y-6">
          <header className="flex items-center justify-between pt-2">
            <h1 className="text-2xl font-extrabold text-[#432E22] tracking-tight">Groups</h1>
            <div className="w-16 h-8 bg-[#EFE4D6] rounded-full animate-pulse" />
          </header>

          <section className="h-32 bg-white rounded-3xl border border-[#E5D9CC] shadow-sm animate-pulse" />
          <section className="h-44 bg-white rounded-3xl border border-[#E5D9CC] shadow-sm animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-[#432E22] flex flex-col justify-between relative pb-28">
      <div className="max-w-xl mx-auto w-full p-4 sm:p-5 space-y-5">
        {/* Top Header Bar labeled "Groups" with top FAB button */}
        <header className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#543A2A] text-[#FAF6F0] flex items-center justify-center shadow-sm shrink-0">
              <svg className="w-5 h-5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-extrabold text-[#432E22] tracking-tight">
              Groups
            </h1>
          </div>

          <div className="flex items-center gap-2 relative">
            {/* Live Status Pill */}
            <SyncBadge manager={repo.syncManager} />

            {/* Top FAB button with downward animating menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsTopMenuOpen((v) => !v)}
                aria-label="Add or join group"
                className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm transition-all duration-200 cursor-pointer ${isTopMenuOpen ? 'bg-[#A84A3B]' : 'bg-[#543A2A] hover:bg-[#432E20]'
                  }`}
              >
                {isTopMenuOpen ? (
                  <svg className="w-5 h-5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user-plus preview-icon">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" x2="19" y1="8" y2="14" />
                    <line x1="22" x2="16" y1="11" y2="11" />
                  </svg>
                )}
              </button>

              {/* Downward Animating Dropdown Menu */}
              {isTopMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-transparent"
                    onClick={() => setIsTopMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-12 z-50 w-30 bg-[#FAF6F0] rounded-2xl border border-[#E5D9CC] shadow-xl p-2 space-y-1 animate-fadeIn origin-top-right">
                    <button
                      type="button"
                      onClick={() => {
                        setIsTopMenuOpen(false);
                        setIsCreateModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-bold text-[#432E22] hover:bg-[#EFE4D6] transition cursor-pointer"
                    >
                      <span className="w-6 h-6 rounded-full bg-[#543A2A] text-white flex items-center justify-center text-xs font-bold leading-none">
                        +
                      </span>
                      <span>Create</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsTopMenuOpen(false);
                        setJoinError(null);
                        setJoinCode('');
                        setIsJoinModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-xs font-bold text-[#432E22] hover:bg-[#EFE4D6] transition cursor-pointer"
                    >
                      <span className="w-6 h-6 rounded-full bg-[#D4B89B] text-[#432E22] flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-link preview-icon">
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                      </span>
                      <span>Join</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Summary labels: show only if they exist */}
        {!isOwed && !owes ? (
          <section className="bg-white rounded-3xl border border-[#E5D9CC] shadow-[0_4px_20px_rgba(84,58,42,0.06)] p-5 text-center">
            <p className="text-base font-bold text-[#432E22]">Relax, you are settled.</p>
          </section>
        ) : isOwed && !owes ? (
          <section className="bg-white rounded-3xl border border-[#E5D9CC] shadow-[0_4px_20px_rgba(84,58,42,0.06)] p-5">
            <div className="bg-[#EAEFE8] rounded-2xl border border-[#D5E2D2] p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#3D5638] block">
                  You are owed
                </span>
                <span className="text-2xl sm:text-3xl font-extrabold text-[#3D5638]">
                  +{formatMinor(primaryOwed, primaryCurrency)}
                </span>
              </div>
              <div className="w-9 h-9 rounded-full bg-[#3D5638] text-white flex items-center justify-center text-sm font-bold shadow-xs">
                ↙
              </div>
            </div>
          </section>
        ) : owes && !isOwed ? (
          <section className="bg-white rounded-3xl border border-[#E5D9CC] shadow-[0_4px_20px_rgba(84,58,42,0.06)] p-5">
            <div className="bg-[#F8EDEA] rounded-2xl border border-[#EBD7D3] p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#9A3C2D] block">
                  You owe
                </span>
                <span className="text-2xl sm:text-3xl font-extrabold text-[#9A3C2D]">
                  -{formatMinor(primaryOwe, primaryCurrency)}
                </span>
              </div>
              <div className="w-9 h-9 rounded-full bg-[#9A3C2D] text-white flex items-center justify-center text-sm font-bold shadow-xs">
                ↗
              </div>
            </div>
          </section>
        ) : (
          <section className="bg-white rounded-3xl border border-[#E5D9CC] shadow-[0_4px_20px_rgba(84,58,42,0.06)] p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#EAEFE8] rounded-2xl border border-[#D5E2D2] p-3.5 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#3D5638] flex items-center gap-1">
                  <span>↙</span> <span>You are owed</span>
                </span>
                <span className="text-lg sm:text-xl font-extrabold text-[#3D5638] block truncate">
                  +{formatMinor(primaryOwed, primaryCurrency)}
                </span>
              </div>

              <div className="bg-[#F8EDEA] rounded-2xl border border-[#EBD7D3] p-3.5 space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#9A3C2D] flex items-center gap-1">
                  <span>↗</span> <span>You owe</span>
                </span>
                <span className="text-lg sm:text-xl font-extrabold text-[#9A3C2D] block truncate">
                  -{formatMinor(primaryOwe, primaryCurrency)}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Groups List */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1 pt-1">
            <h2 className="text-xs font-bold text-[#6E5849] uppercase tracking-wider">
              Groups
            </h2>
            <span className="text-xs font-semibold text-[#8D7868]">
              {activeGroups.length} {activeGroups.length === 1 ? 'group' : 'groups'}
            </span>
          </div>

          {activeGroups.length === 0 ? (
            <EmptyState
              icon={
                <div className="w-12 h-12 rounded-2xl bg-[#543A2A]/10 text-[#543A2A] flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-ghost preview-icon">
                    <path d="M15 10v1" />
                    <path d="M7.528 20.472a1.6 1.6 0 012.277 0l1.057 1.056a1.6 1.6 0 002.276 0l1.057-1.056a1.6 1.6 0 012.277 0l1.114 1.114a1.4 1.4 0 002.414-1V10a8 8 0 00-16 0v10.586a1.4 1.4 0 002.414 1z" />
                    <path d="M9 10v1" />
                  </svg>
                </div>
              }
              title="No active groups yet"
              description="Create a group or join with a code to start splitting expenses."
              actionText="Create Your First Group"
              onAction={() => setIsCreateModalOpen(true)}
              secondaryActionText="Join with Code"
              onSecondaryAction={() => {
                setJoinError(null);
                setJoinCode('');
                setIsJoinModalOpen(true);
              }}
            />
          ) : (
            <div className="space-y-3">
              {activeGroups.map((g) => {
                const members = repo.store.getGroupMembers(g.id);
                const userMember = members.find((m) => m.userId === currentUserId);
                const ledger = selectGroupLedger(repo.store, g.id);
                const userBalance = userMember ? ledger.balances.get(userMember.id) ?? 0 : 0;
                const config = GROUP_TYPE_CONFIG[g.type] || GROUP_TYPE_CONFIG.other;

                return (
                  <Link
                    key={g.id}
                    href={`/group?id=${g.id}`}
                    className="block p-4 rounded-2xl bg-white border border-[#E5D9CC] shadow-sm hover:shadow-md hover:border-[#D4B89B] active:scale-[0.99] transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-3">
                      {/* Icon & Group Name (No category pill tag) */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={`w-12 h-12 rounded-2xl ${config.thumbnailBg} flex items-center justify-center text-2xl border border-[#E5D9CC]/60 shrink-0`}
                        >
                          <span>{config.emoji}</span>
                        </div>

                        <div className="min-w-0">
                          <h3 className="text-base font-bold text-[#432E22] truncate">
                            {g.name}
                          </h3>
                        </div>
                      </div>

                      {/* Owing Status + Balance for that group */}
                      <div className="text-right shrink-0">
                        {userBalance > 0 ? (
                          <div className="text-sm font-bold text-[#3D5638] flex items-center justify-end gap-1">
                            <span>↙</span>
                            <span>You are owed {formatMinor(userBalance, g.currency)}</span>
                          </div>
                        ) : userBalance < 0 ? (
                          <div className="text-sm font-bold text-[#9A3C2D] flex items-center justify-end gap-1">
                            <span>↗</span>
                            <span>You owe {formatMinor(Math.abs(userBalance), g.currency)}</span>
                          </div>
                        ) : (
                          <div className="text-sm font-semibold text-[#8D7868]">
                            You are settled up
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Replaced FAB with "+ Add expense" button in bottom right */}
      <div className="fixed bottom-22 right-4 sm:right-6 z-40">
        <button
          type="button"
          onClick={() => {
            if (activeGroups.length === 1 && activeGroups[0]) {
              router.push(`/group/expense?id=${activeGroups[0].id}`);
            } else {
              setIsSelectTargetModalOpen(true);
            }
          }}
          className="flex items-center gap-2 px-5 py-3.5 rounded-full bg-[#543A2A] hover:bg-[#432E20] text-[#FAF6F0] font-bold text-sm shadow-xl active:scale-95 transition-all cursor-pointer"
        >
          <span className="text-lg leading-none">+</span>
          <span>Add expense</span>
        </button>
      </div>

      {/* Modal to select a group or a friend to add expense */}
      {isSelectTargetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md bg-[#FAF6F0] border border-[#E5D9CC] rounded-3xl p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#432E22]">Add Expense To</h2>
                <p className="text-xs text-[#8D7868]">Choose a group or friend</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSelectTargetModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white hover:bg-[#EFE4D6] border border-[#E5D9CC] font-bold text-xs text-[#432E22] flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 pr-1">
              {/* Groups Section */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-[#8D7868] uppercase tracking-wider block">
                  Groups ({activeGroups.length})
                </span>
                {activeGroups.length === 0 ? (
                  <p className="text-xs text-[#8D7868]">No groups yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {activeGroups.map((g) => {
                      const cfg = GROUP_TYPE_CONFIG[g.type] || GROUP_TYPE_CONFIG.other;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            setIsSelectTargetModalOpen(false);
                            router.push(`/group/expense?id=${g.id}`);
                          }}
                          className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white border border-[#E5D9CC] hover:bg-[#EFE4D6]/50 active:scale-[0.99] transition text-left cursor-pointer"
                        >
                          <span className="text-xl">{cfg.emoji}</span>
                          <span className="text-sm font-bold text-[#432E22] truncate">{g.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Friends Section */}
              {friends.length > 0 && (
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-bold text-[#8D7868] uppercase tracking-wider block">
                    Friends ({friends.length})
                  </span>
                  <div className="space-y-1.5">
                    {friends.map((f) => {
                      const firstGroup = f.groups[0];
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => {
                            setIsSelectTargetModalOpen(false);
                            if (firstGroup) {
                              router.push(`/group/expense?id=${firstGroup.groupId}`);
                            } else if (activeGroups[0]) {
                              router.push(`/group/expense?id=${activeGroups[0].id}`);
                            }
                          }}
                          className="w-full flex items-center justify-between p-3 rounded-2xl bg-white border border-[#E5D9CC] hover:bg-[#EFE4D6]/50 active:scale-[0.99] transition text-left cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <div className="w-8 h-8 rounded-full bg-[#D4B89B] text-[#432E22] font-bold text-xs flex items-center justify-center shrink-0">
                              {(f.displayName.trim()[0] || '?').toUpperCase()}
                            </div>
                            <span className="text-sm font-bold text-[#432E22] truncate">{f.displayName}</span>
                          </div>
                          {firstGroup && (
                            <span className="text-[11px] text-[#8D7868] shrink-0 font-medium">
                              via {firstGroup.groupName}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Persistent Bottom Navigation */}
      <BottomNav />

      {/* Create Group Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div
            className="relative w-full max-w-md bg-[#FAF6F0] border border-[#E5D9CC] rounded-3xl p-6 shadow-2xl space-y-5"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#432E22] tracking-tight">CREATE NEW GROUP</h2>
                <p className="text-xs text-[#8D7868]">Split and share expenses with friends</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white hover:bg-[#EFE4D6] border border-[#E5D9CC] font-bold text-xs text-[#432E22] flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-2xl text-xs font-semibold bg-[#F8EDEA] text-[#9A3C2D] border border-[#EBD7D3]">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#432E22] uppercase tracking-wider mb-1.5">
                  Group Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Coffee Club, Goa Villa, Flat 402"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-white border border-[#E5D9CC] text-[#432E22] placeholder:text-[#8D7868]/60 focus:outline-none focus:border-[#543A2A] text-sm font-medium shadow-sm transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#432E22] uppercase tracking-wider mb-1.5">
                  Group Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['trip', 'home', 'couple', 'other'] as GroupType[]).map((t) => {
                    const cfg = GROUP_TYPE_CONFIG[t];
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNewGroupType(t)}
                        className={`p-2.5 rounded-2xl border text-xs font-bold flex items-center gap-2 transition cursor-pointer ${newGroupType === t
                          ? 'bg-[#543A2A] text-white border-[#543A2A] shadow-sm'
                          : 'bg-white text-[#432E22] border-[#E5D9CC] hover:bg-[#EFE4D6]/50'
                          }`}
                      >
                        <span>{cfg.emoji}</span>
                        <span>{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#432E22] uppercase tracking-wider mb-1.5">
                  Currency
                </label>
                <select
                  value={newGroupCurrency}
                  onChange={(e) => setNewGroupCurrency(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-white border border-[#E5D9CC] text-[#432E22] focus:outline-none focus:border-[#543A2A] text-sm font-semibold shadow-sm transition"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3.5 rounded-full bg-[#543A2A] hover:bg-[#432E20] text-[#FAF6F0] font-bold text-sm tracking-wider uppercase shadow-md active:scale-[0.99] transition cursor-pointer"
                >
                  CREATE & OPEN GROUP →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Group Modal */}
      {isJoinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div
            className="relative w-full max-w-md bg-[#FAF6F0] border border-[#E5D9CC] rounded-3xl p-6 shadow-2xl space-y-5"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#432E22] tracking-tight">JOIN GROUP</h2>
                <p className="text-xs text-[#8D7868]">Enter the invite code shared with you</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsJoinModalOpen(false);
                  setJoinError(null);
                  setJoinCode('');
                }}
                className="w-8 h-8 rounded-full bg-white hover:bg-[#EFE4D6] border border-[#E5D9CC] font-bold text-xs text-[#432E22] flex items-center justify-center transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {joinError && (
              <div className="p-3 rounded-2xl text-xs font-semibold bg-[#F8EDEA] text-[#9A3C2D] border border-[#EBD7D3]">
                {joinError}
              </div>
            )}

            <form onSubmit={handleJoinGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#432E22] uppercase tracking-wider mb-1.5">
                  Invite Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={32}
                  placeholder="e.g. ABC123"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 rounded-2xl bg-white border border-[#E5D9CC] text-[#432E22] placeholder:text-[#8D7868]/60 focus:outline-none focus:border-[#543A2A] text-center text-lg font-bold tracking-widest uppercase shadow-sm transition"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isJoining}
                  className="w-full py-3.5 rounded-full bg-[#543A2A] hover:bg-[#432E20] text-[#FAF6F0] font-bold text-sm tracking-wider uppercase shadow-md active:scale-[0.99] disabled:opacity-50 transition cursor-pointer"
                >
                  {isJoining ? 'JOINING GROUP...' : 'JOIN GROUP →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
