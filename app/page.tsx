'use client';

// app/page.tsx
// Production Dashboard with Currency Net Balances, Group List & Create Modal

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
import { getAuthState, signOut } from '../lib/auth';
import type { GroupType } from '../lib/data/types';
import { initDeepLinkListener } from '../lib/native/deeplink';

const GROUP_TYPE_ICONS: Record<GroupType, string> = {
  trip: '✈️',
  home: '🏠',
  couple: '❤️',
  other: '📁',
};

const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AED', 'SGD'];

export default function DashboardPage() {
  const router = useRouter();
  const repo = useRepository();
  const authState = getAuthState();
  const currentUserId = authState.user?.id || 'local_user';

  const groups = useAllGroups(repo);
  const dashboardTotals = useDashboardTotals(repo, currentUserId);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<GroupType>('trip');
  const [newGroupCurrency, setNewGroupCurrency] = useState('INR');
  const [createError, setCreateError] = useState<string | null>(null);

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

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth');
  };

  // Group currencies with activity
  const activeCurrencies = Object.keys(dashboardTotals.netPerCurrency);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col justify-between">
      <div className="max-w-xl mx-auto w-full p-4 sm:p-6 space-y-6">
        {/* Header Bar */}
        <header className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-emerald-600/20">
              C
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight leading-none">Clearcut</h1>
              <span className="text-[10px] text-zinc-400 font-medium">Splitwise Clone • Offline First</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SyncBadge
              manager={repo.syncManager}
              onClickKick={() => repo.syncManager?.kick('manual_badge_tap')}
            />
            {authState.user && (
              <button
                onClick={handleSignOut}
                title="Sign out"
                className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition"
              >
                {authState.profile?.displayName?.charAt(0).toUpperCase() || 'U'}
              </button>
            )}
          </div>
        </header>

        {/* Total Net Balance Card */}
        <section className="p-5 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-400">
            <span>Overall Balance</span>
            <span>{activeCurrencies.length > 0 ? `${activeCurrencies.length} Currencies` : 'Zero Debt'}</span>
          </div>

          {activeCurrencies.length === 0 ? (
            <div className="py-2">
              <span className="text-2xl font-bold text-zinc-400">All settled up</span>
              <p className="text-xs text-zinc-500 mt-1">You do not owe or have outstanding balances in any group.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeCurrencies.map((cur) => {
                const net = dashboardTotals.netPerCurrency[cur] || 0;
                const owed = dashboardTotals.totalOwedToYouByCurrency[cur] || 0;
                const owes = dashboardTotals.totalYouOweByCurrency[cur] || 0;

                return (
                  <div key={cur} className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                        {cur}
                      </span>
                      <span
                        className={`text-lg font-bold font-mono ${
                          net > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : net < 0
                            ? 'text-orange-600 dark:text-orange-400'
                            : 'text-zinc-500'
                        }`}
                      >
                        {net > 0 ? `+${formatMinor(net, cur)}` : net < 0 ? `-${formatMinor(Math.abs(net), cur)}` : formatMinor(0, cur)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-zinc-200/50 dark:border-zinc-700/50">
                      <div>
                        <span className="text-zinc-400 text-[10px] uppercase font-medium block">You are owed</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                          {formatMinor(owed, cur)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-zinc-400 text-[10px] uppercase font-medium block">You owe</span>
                        <span className="font-semibold text-orange-600 dark:text-orange-400 font-mono">
                          {formatMinor(owes, cur)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Groups List Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
              Groups ({groups.length})
            </h2>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
            >
              <span>+ New Group</span>
            </button>
          </div>

          {groups.length === 0 ? (
            <EmptyState
              icon={<span className="text-2xl">🌴</span>}
              title="No groups yet"
              description="Create a group for your next road trip, apartment rent, or dinner party to track shared expenses."
              actionText="+ Create Group"
              onAction={() => setIsCreateModalOpen(true)}
            />
          ) : (
            <div className="space-y-2">
              {groups.map((g) => {
                const members = repo.store.getGroupMembers(g.id);
                const userMember = members.find((m) => m.userId === currentUserId);
                const ledger = selectGroupLedger(repo.store, g.id);
                const userBalance = userMember ? ledger.balances.get(userMember.id) ?? 0 : 0;

                return (
                  <Link
                    key={g.id}
                    href={`/group?id=${g.id}`}
                    className="flex items-center justify-between p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 shadow-sm transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-xl shrink-0 shadow-inner">
                        {GROUP_TYPE_ICONS[g.type] || '📁'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 truncate">
                            {g.name}
                          </h3>
                          {g._sync === 'pending' && (
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" title="Pending sync" />
                          )}
                        </div>
                        <p className="text-xs text-zinc-400">
                          {members.length} member{members.length > 1 ? 's' : ''} • {g.currency}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0 ml-3">
                      {userBalance > 0 ? (
                        <div>
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                            you are owed
                          </span>
                          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                            +{formatMinor(userBalance, g.currency)}
                          </span>
                        </div>
                      ) : userBalance < 0 ? (
                        <div>
                          <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider block">
                            you owe
                          </span>
                          <span className="text-sm font-bold text-orange-600 dark:text-orange-400 font-mono">
                            -{formatMinor(Math.abs(userBalance), g.currency)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-zinc-400">
                          settled up
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Create Group Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Create a New Group</h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl text-xs font-medium bg-rose-500/10 text-rose-500 border border-rose-500/20">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  placeholder="e.g. Goa Trip, Apartment 4B"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">
                    Group Type
                  </label>
                  <select
                    value={newGroupType}
                    onChange={(e) => setNewGroupType(e.target.value as GroupType)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="trip">✈️ Trip</option>
                    <option value="home">🏠 Home / Apartment</option>
                    <option value="couple">❤️ Couple</option>
                    <option value="other">📁 Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1">
                    Currency
                  </label>
                  <select
                    value={newGroupCurrency}
                    onChange={(e) => setNewGroupCurrency(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 py-2.5 text-sm font-semibold rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md active:scale-95 transition"
                >
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
