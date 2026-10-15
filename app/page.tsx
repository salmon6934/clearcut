'use client';

// app/page.tsx
// Stitch Neo-Brutalist Financial Ledger Dashboard (P2P LEDGER V2.4)

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useRepository,
  useAllGroups,
  useDashboardTotals,
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
    tagBg: 'bg-[#ffd600] text-black',
    thumbnailBg: 'bg-[#fff5cc]',
  },
  home: {
    emoji: '🏠',
    badgeIcon: '📶',
    label: 'HOME',
    tagBg: 'bg-[#00e5ff] text-black',
    thumbnailBg: 'bg-[#e0fbff]',
  },
  couple: {
    emoji: '🍷',
    badgeIcon: '❤️',
    label: 'COUPLE',
    tagBg: 'bg-[#ff80bf] text-black',
    thumbnailBg: 'bg-[#ffe6f2]',
  },
  other: {
    emoji: '🚗',
    badgeIcon: '🚙',
    label: 'SHARED',
    tagBg: 'bg-[#ffd600] text-black',
    thumbnailBg: 'bg-[#f0f0ea]',
  },
};

const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AED', 'SGD'];

export default function DashboardPage() {
  const router = useRouter();
  const authState = useAuth();
  const currentUserId = authState.user?.id || 'local_user';
  const repo = useRepository(currentUserId);

  const activeGroups = useAllGroups(repo, false);
  const dashboardTotals = useDashboardTotals(repo, currentUserId);

  const [mounted, setMounted] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<GroupType>('trip');
  const [newGroupCurrency, setNewGroupCurrency] = useState('INR');
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
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

  const activeCurrencies = Object.keys(dashboardTotals.netPerCurrency);
  const primaryCurrency = activeCurrencies.includes('INR')
    ? 'INR'
    : activeCurrencies[0] || 'INR';

  const primaryNet = dashboardTotals.netPerCurrency[primaryCurrency] || 0;
  const primaryOwed = dashboardTotals.totalOwedToYouByCurrency[primaryCurrency] || 0;
  const primaryOwe = dashboardTotals.totalYouOweByCurrency[primaryCurrency] || 0;

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] text-black flex flex-col justify-between pb-24">
        <div className="max-w-xl mx-auto w-full p-4 sm:p-5 space-y-6">
          <header className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#ccff00] border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_0px_#000]">
                <span className="text-black font-black text-xl font-mono">C</span>
              </div>
              <div>
                <span className="text-xl font-black text-black tracking-tight uppercase block leading-tight">
                  Clearcut
                </span>
              </div>
            </div>
            <div className="w-16 h-8 bg-[#e0e0d8] border-2 border-black rounded-lg animate-pulse" />
          </header>

          <section className="h-56 bg-white rounded-2xl border-2 border-black shadow-[4px_4px_0px_0px_#000] animate-pulse" />
          <section className="h-44 bg-white rounded-2xl border-2 border-black shadow-[3px_3px_0px_0px_#000] animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-black flex flex-col justify-between relative pb-28">
      <div className="max-w-xl mx-auto w-full p-4 sm:p-5 space-y-5">
        {/* Top Header Bar matching Stitch */}
        <header className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#ccff00] border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_0px_#000]">
              <span className="text-black font-black text-xl font-mono leading-none">C</span>
            </div>
            <div>
              <span className="text-xl font-black text-black tracking-tight uppercase block leading-none">
                Clearcut
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Live Status Pill */}
            <SyncBadge
              manager={repo.syncManager}
            />

            {/* Profile Avatar */}
            <Link
              href="/settings"
              title="Settings & Profile"
              className="w-10 h-10 bg-white border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_#000] flex items-center justify-center font-mono font-black text-xs text-black active:translate-x-0.5 active:translate-y-0.5 overflow-hidden transition-all"
            >
              {authState.profile?.avatarUrl ? (
                <img
                  src={authState.profile.avatarUrl}
                  alt="Prof"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[11px] font-bold">
                  {authState.profile?.displayName ? authState.profile.displayName.slice(0, 4) : 'Prof'}
                </span>
              )}
            </Link>
          </div>
        </header>

        {/* Hero Net Group Balance Card */}
        <section className="bg-white rounded-2xl border-2 border-black shadow-[4px_4px_0px_0px_#000] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-mono text-xs font-black tracking-wider uppercase text-black">
              <div className="w-6 h-6 bg-[#ccff00] border-2 border-black flex items-center justify-center shadow-[1px_1px_0px_0px_#000]">
                <svg className="w-3.5 h-3.5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <span>NET GROUP BALANCE</span>
            </div>

            <button
              onClick={() => repo.syncManager?.kick('manual_sync_btn', true)}
              className="px-2.5 py-1 bg-white hover:bg-[#ffd600] text-black border-2 border-black rounded-lg text-xs font-mono font-bold shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-1.5 cursor-pointer transition"
            >
              <svg className="w-3.5 h-3.5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>SYNC</span>
            </button>
          </div>

          <div className="space-y-2">
            <div>
              <span
                className={`inline-block px-2.5 py-0.5 border-2 border-black text-[11px] font-mono font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_#000] ${primaryNet > 0
                  ? 'bg-[#ccff00] text-black'
                  : primaryNet < 0
                    ? 'bg-[#ff8a80] text-black'
                    : 'bg-[#ffd600] text-black'
                  }`}
              >
                {primaryNet > 0
                  ? 'TOTAL SURPLUS'
                  : primaryNet < 0
                    ? 'TOTAL DEFICIT'
                    : 'SETTLED UP'}
              </span>
            </div>

            <div className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-black">
              {primaryNet > 0
                ? `+${formatMinor(primaryNet, primaryCurrency)}`
                : primaryNet < 0
                  ? `-${formatMinor(Math.abs(primaryNet), primaryCurrency)}`
                  : formatMinor(0, primaryCurrency)}
            </div>

            <p className="text-xs text-black/70 flex items-center gap-2 font-mono font-bold">
              <span className="w-2 h-2 rounded-full bg-black shrink-0" />
              <span>Calculated across {activeGroups.length || 1} groups</span>
            </p>
          </div>

          {/* Sub-cards Row: Owed To You & You Owe */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            {/* Owed To You Box */}
            <div className="bg-[#eaff96] rounded-xl border-2 border-black p-3 shadow-[2px_2px_0px_0px_#000] space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-black uppercase tracking-wider text-black">
                  OWED TO YOU
                </span>
                <div className="w-5 h-5 bg-black rounded-sm flex items-center justify-center text-[#ccff00]">
                  <svg className="w-3 h-3 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7H7M17 7V17" />
                  </svg>
                </div>
              </div>
              <div className="font-mono text-base sm:text-lg font-black text-black truncate">
                +{formatMinor(primaryOwed, primaryCurrency)}
              </div>
            </div>

            {/* You Owe Box */}
            <div className="bg-[#ffd2c9] rounded-xl border-2 border-black p-3 shadow-[2px_2px_0px_0px_#000] space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-black uppercase tracking-wider text-black">
                  YOU OWE
                </span>
                <div className="w-5 h-5 bg-black rounded-sm flex items-center justify-center text-[#ff8a80]">
                  <svg className="w-3 h-3 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 7L7 17M7 17H17M7 17V7" />
                  </svg>
                </div>
              </div>
              <div className="font-mono text-base sm:text-lg font-black text-black truncate">
                -{formatMinor(primaryOwe, primaryCurrency)}
              </div>
            </div>
          </div>
        </section>


        {/* Active Groups Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-black uppercase tracking-tight">ACTIVE GROUPS</h2>
              <span className="px-2 py-0.5 rounded-md bg-black text-white text-xs font-mono font-bold">
                {activeGroups.length}
              </span>
            </div>
          </div>

          {activeGroups.length === 0 ? (
            <EmptyState
              icon={<span>🌴</span>}
              title="No active groups yet"
              description="Create a group for your trip, roommates, or split bills to start tracking."
              actionText="Create Your First Group"
              onAction={() => setIsCreateModalOpen(true)}
              secondaryActionText="Join with Code"
              onSecondaryAction={() => router.push('/join')}
            />
          ) : (
            <div className="space-y-3">
              {activeGroups.map((g) => {
                const members = repo.store.getGroupMembers(g.id);
                const userMember = members.find((m) => m.userId === currentUserId);
                const ledger = selectGroupLedger(repo.store, g.id);
                const userBalance = userMember ? ledger.balances.get(userMember.id) ?? 0 : 0;
                const expenses = repo.store.getGroupExpenses(g.id);
                const config = GROUP_TYPE_CONFIG[g.type] || GROUP_TYPE_CONFIG.other;

                return (
                  <Link
                    key={g.id}
                    href={`/group?id=${g.id}`}
                    className="block p-3.5 rounded-2xl bg-white border-2 border-black shadow-[3px_3px_0px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Visual Thumbnail with Badge Icon */}
                        <div className="relative shrink-0">
                          <div
                            className={`w-13 h-13 rounded-xl border-2 border-black ${config.thumbnailBg} flex items-center justify-center text-2xl shadow-[2px_2px_0px_0px_#000]`}
                          >
                            <span>{config.emoji}</span>
                          </div>
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-md bg-black text-white flex items-center justify-center text-[10px] font-bold border border-black">
                            <span>{config.badgeIcon}</span>
                          </div>
                        </div>

                        {/* Details */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black text-black truncate">
                              {g.name}
                            </h3>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-black uppercase tracking-wider shrink-0 border border-black ${config.tagBg}`}
                            >
                              {config.label}
                            </span>
                            {g._sync === 'pending' && (
                              <span
                                title="Saved locally, not synced to cloud yet"
                                className="px-1.5 py-0.5 rounded text-[9px] font-mono font-black bg-[#ffd600] text-black border border-black shrink-0 inline-flex items-center gap-1 shadow-[1px_1px_0px_0px_#000]"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                                NOT SYNCED
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-black/60 font-mono mt-1 flex items-center gap-1.5 truncate">
                            <span>👥 {members.length} friends</span>
                            <span>·</span>
                            <span className="truncate">
                              {expenses.length > 0 ? `${expenses.length} expenses` : `${g.currency}`}
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* Right Balance & Status Pill */}
                      <div className="text-right shrink-0 space-y-1">
                        <div className="text-sm sm:text-base font-black font-mono text-black">
                          {userBalance > 0
                            ? `+${formatMinor(userBalance, g.currency)}`
                            : userBalance < 0
                              ? `-${formatMinor(Math.abs(userBalance), g.currency)}`
                              : formatMinor(0, g.currency)}
                        </div>

                        <div>
                          {userBalance > 0 ? (
                            <span className="px-2 py-0.5 rounded-md bg-[#ccff00] border border-black text-black text-[10px] font-mono font-black shadow-[1px_1px_0px_0px_#000]">
                              You are owed
                            </span>
                          ) : userBalance < 0 ? (
                            <span className="px-2 py-0.5 rounded-md bg-[#ff8a80] border border-black text-black text-[10px] font-mono font-black shadow-[1px_1px_0px_0px_#000]">
                              You owe
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-[#f0f0ea] border border-black text-black text-[10px] font-mono font-bold">
                              Settled up ✓
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Floating Action Button Backdrop */}
      {isFabOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] transition-opacity"
          onClick={() => setIsFabOpen(false)}
        />
      )}

      {/* Floating Action Button & Menu */}
      <div className="fixed bottom-20 right-4 sm:right-6 z-40 flex flex-col items-end gap-3 pointer-events-auto">
        {/* Floating Menu Buttons */}
        {isFabOpen && (
          <div className="flex flex-col items-end gap-2.5 animate-fadeIn">
            {/* 1. New Group */}
            <button
              type="button"
              onClick={() => {
                setIsFabOpen(false);
                setIsCreateModalOpen(true);
              }}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#ccff00] hover:bg-[#bbf000] text-black font-black text-xs font-mono uppercase tracking-wider border-2 border-black shadow-[3px_3px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer"
            >
              <div className="w-5 h-5 rounded-full border-2 border-black flex items-center justify-center font-black text-xs leading-none">
                +
              </div>
              <span>NEW GROUP</span>
            </button>

            {/* 2. Join Group */}
            <Link
              href="/join"
              onClick={() => setIsFabOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#00e5ff] hover:bg-[#00cbe6] text-black font-black text-xs font-mono uppercase tracking-wider border-2 border-black shadow-[3px_3px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer"
            >
              <svg className="w-4 h-4 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <span>JOIN GROUP</span>
            </Link>
          </div>
        )}

        {/* Main Floating Trigger Button */}
        <button
          type="button"
          onClick={() => setIsFabOpen((prev) => !prev)}
          aria-label={isFabOpen ? 'Close group actions' : 'Create or join group'}
          className={`w-14 h-14 rounded-2xl border-2 border-black flex items-center justify-center shadow-[4px_4px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition-all duration-200 cursor-pointer ${
            isFabOpen
              ? 'bg-[#ff8a80] text-black rotate-45'
              : 'bg-[#ccff00] hover:bg-[#bbf000] text-black rotate-0'
          }`}
        >
          <svg className="w-7 h-7 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Persistent Bottom Navigation matching Stitch */}
      <BottomNav />

      {/* Create Group Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div
            className="relative w-full max-w-md bg-white border-2 border-black rounded-2xl p-6 shadow-[5px_5px_0px_0px_#000] space-y-5"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-black tracking-tight uppercase">CREATE NEW GROUP</h2>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-white hover:bg-[#ffd600] border-2 border-black font-mono font-black text-xs flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl text-xs font-bold bg-[#ff8a80] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-black text-black uppercase tracking-wider mb-1.5">
                  Group Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Goa Villa Trip, Flat 402, Date Nights"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white border-2 border-black text-black placeholder:text-black/40 focus:outline-none focus:bg-[#faffea] text-sm font-semibold shadow-[2px_2px_0px_0px_#000]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-black text-black uppercase tracking-wider mb-1.5">
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
                        className={`p-2.5 rounded-xl border-2 border-black text-xs font-mono font-black flex items-center gap-2 transition cursor-pointer shadow-[2px_2px_0px_0px_#000] ${newGroupType === t
                          ? 'bg-[#ccff00] text-black'
                          : 'bg-white text-black/70 hover:bg-[#fafaf6]'
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
                <label className="block text-xs font-mono font-black text-black uppercase tracking-wider mb-1.5">
                  Currency
                </label>
                <select
                  value={newGroupCurrency}
                  onChange={(e) => setNewGroupCurrency(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white border-2 border-black text-black focus:outline-none text-sm font-mono font-bold shadow-[2px_2px_0px_0px_#000]"
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
                  className="w-full py-3.5 rounded-xl bg-[#ccff00] hover:bg-[#bbf000] text-black font-black text-sm tracking-wider uppercase border-2 border-black shadow-[3px_3px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer"
                >
                  CREATE & OPEN GROUP →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
