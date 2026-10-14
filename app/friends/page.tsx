'use client';

// app/friends/page.tsx
// Stitch Neo-Brutalist Friends Ledger Page (P2P LEDGER V2.4)

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRepository, useFriendsBalances } from '../../lib/data/hooks';
import { formatMinor } from '../../lib/engine/money';
import { useAuth } from '../../lib/auth';
import { EmptyState } from '../../components/EmptyState';
import { BottomNav } from '../../components/BottomNav';
import { SyncBadge } from '../../components/SyncBadge';
import { haptics } from '../../lib/native/haptics';
import { sendFriendPushReminder } from '../../lib/native/push';
import type { FriendSummary } from '../../lib/data/selectors';

const AVATAR_COLORS = [
  'bg-[#ccff00]', // Electric Lime
  'bg-[#00e5ff]', // Cyan
  'bg-[#ffd600]', // Yellow
  'bg-[#ff80bf]', // Pink
  'bg-[#ff8a80]', // Coral
];

export default function FriendsPage() {
  const router = useRouter();
  const authState = useAuth();
  const currentUserId = authState.user?.id || 'local_user';
  const repo = useRepository(currentUserId);

  const friends = useFriendsBalances(repo, currentUserId);

  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'owed' | 'owe' | 'settled'>('all');
  const [expandedFriendId, setExpandedFriendId] = useState<string | null>(null);

  // Reminder Notification Modal State
  const [reminderFriend, setReminderFriend] = useState<FriendSummary | null>(null);
  const [reminderMessage, setReminderMessage] = useState('');
  const [copiedReminder, setCopiedReminder] = useState(false);
  const [isSendingPush, setIsSendingPush] = useState(false);
  const [pushStatus, setPushStatus] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] text-black pb-28">
        <header className="sticky top-0 z-30 bg-[#f5f5f0] border-b-2 border-black px-4 py-3 animate-pulse">
          <div className="max-w-xl mx-auto flex items-center justify-between">
            <div className="h-6 w-32 bg-[#e0e0d8] rounded border border-black" />
            <div className="h-8 w-20 bg-[#e0e0d8] rounded-lg border border-black" />
          </div>
        </header>
        <div className="max-w-xl mx-auto p-4 space-y-4 animate-pulse">
          <div className="h-28 w-full bg-white rounded-2xl border-2 border-black" />
          <div className="h-14 w-full bg-white rounded-xl border-2 border-black" />
        </div>
      </div>
    );
  }

  // Calculate overall totals across friends (for primary currency, defaults to INR)
  let totalOwedToYou = 0;
  let totalYouOwe = 0;
  const primaryCurrency = 'INR';

  for (const f of friends) {
    const net = f.netPerCurrency[primaryCurrency] ?? 0;
    if (net > 0) totalOwedToYou += net;
    else if (net < 0) totalYouOwe += Math.abs(net);
  }

  const handleOpenReminder = (friend: FriendSummary, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const net = friend.netPerCurrency[primaryCurrency] ?? 0;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const text = `Hey ${friend.displayName}! Friendly reminder regarding the ${primaryCurrency} ${formatMinor(net, primaryCurrency)} balance on Clearcut. Let's settle up whenever you get a chance! ${origin}/friends`;
    setReminderFriend(friend);
    setReminderMessage(text);
    setCopiedReminder(false);
    setPushStatus(null);
    haptics.tap().catch(() => {});
  };

  const handleSendPush = async () => {
    if (!reminderFriend) return;
    setIsSendingPush(true);
    setPushStatus(null);
    haptics.tap().catch(() => {});

    try {
      const net = reminderFriend.netPerCurrency[primaryCurrency] ?? 0;
      const res = await sendFriendPushReminder({
        friendUserId: reminderFriend.userId,
        friendName: reminderFriend.displayName,
        amountMinor: net,
        currency: primaryCurrency,
        customMessage: reminderMessage,
        senderName: currentUserId === 'local_user' ? 'You' : undefined,
      });

      if (res.success) {
        haptics.success().catch(() => {});
        setPushStatus({ success: true, message: res.message });
      } else {
        haptics.warning().catch(() => {});
        setPushStatus({ success: false, message: res.message });
      }
    } catch (err: any) {
      setPushStatus({
        success: false,
        message: err?.message || 'Failed to dispatch push notification',
      });
    } finally {
      setIsSendingPush(false);
    }
  };

  const handleSendWhatsApp = () => {
    haptics.tap().catch(() => {});
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(reminderMessage)}`;
    window.open(url, '_blank');
  };

  const handleShareReminder = async () => {
    haptics.tap().catch(() => {});
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Settle up on Clearcut',
          text: reminderMessage,
        });
        return;
      } catch {
        // Fallback to SMS
      }
    }
    window.open(`sms:?&body=${encodeURIComponent(reminderMessage)}`, '_blank');
  };

  const handleCopyReminder = async () => {
    haptics.tap().catch(() => {});
    await navigator.clipboard.writeText(reminderMessage);
    setCopiedReminder(true);
    setTimeout(() => setCopiedReminder(false), 2500);
  };

  // Filter friends list
  const filteredFriends = friends.filter((f) => {
    // 1. Search text filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = f.displayName.toLowerCase().includes(q);
      const matchGroup = f.groups.some((g) => g.groupName.toLowerCase().includes(q));
      if (!matchName && !matchGroup) return false;
    }

    // 2. Status filter
    const net = f.netPerCurrency[primaryCurrency] ?? 0;
    if (filterType === 'owed' && net <= 0) return false;
    if (filterType === 'owe' && net >= 0) return false;
    if (filterType === 'settled' && net !== 0) return false;

    return true;
  });

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-black pb-28">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-[#f5f5f0] border-b-2 border-black px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#ccff00] border-2 border-black flex items-center justify-center font-mono font-black text-sm shadow-[2px_2px_0px_0px_#000]">
              👥
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight uppercase leading-none">
                FRIENDS
              </h1>
            </div>
          </div>

          <SyncBadge manager={repo.syncManager} />
        </div>
      </header>

      <div className="max-w-xl mx-auto p-4 sm:p-5 space-y-4">
        {/* Hero Balance Summary Cards */}
        <section className="grid grid-cols-2 gap-3">
          {/* Owed To You Box */}
          <div className="bg-[#eaff96] rounded-2xl border-2 border-black p-4 shadow-[3px_3px_0px_0px_#000] space-y-1">
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
            <div className="font-mono text-xl sm:text-2xl font-black text-black truncate">
              +{formatMinor(totalOwedToYou, primaryCurrency)}
            </div>
            <p className="font-mono text-[10px] text-black/60 font-bold uppercase">
              Across {friends.filter((f) => (f.netPerCurrency[primaryCurrency] ?? 0) > 0).length} friends
            </p>
          </div>

          {/* You Owe Box */}
          <div className="bg-[#ffd2c9] rounded-2xl border-2 border-black p-4 shadow-[3px_3px_0px_0px_#000] space-y-1">
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
            <div className="font-mono text-xl sm:text-2xl font-black text-black truncate">
              -{formatMinor(totalYouOwe, primaryCurrency)}
            </div>
            <p className="font-mono text-[10px] text-black/60 font-bold uppercase">
              Across {friends.filter((f) => (f.netPerCurrency[primaryCurrency] ?? 0) < 0).length} friends
            </p>
          </div>
        </section>

        {/* Search & Filter Controls */}
        <div className="space-y-2.5">
          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="SEARCH BY FRIEND OR GROUP NAME..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border-2 border-black bg-white font-mono text-xs font-bold text-black placeholder:text-black/40 focus:outline-none focus:bg-[#faffea] shadow-[2px_2px_0px_0px_#000]"
            />
            <svg
              className="w-4 h-4 text-black/50 absolute left-3 top-3 stroke-[2.5]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-xs font-mono font-bold text-black/50 hover:text-black"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono font-black scrollbar-none">
            {[
              { id: 'all', label: `ALL (${friends.length})` },
              { id: 'owed', label: 'OWES YOU' },
              { id: 'owe', label: 'YOU OWE' },
              { id: 'settled', label: 'SETTLED' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id as any)}
                className={`px-3 py-1 rounded-lg border-2 border-black uppercase whitespace-nowrap transition cursor-pointer active:translate-x-0.5 active:translate-y-0.5 ${filterType === tab.id
                    ? 'bg-[#ccff00] text-black shadow-[2px_2px_0px_0px_#000]'
                    : 'bg-white text-black/70 hover:text-black shadow-[1px_1px_0px_0px_#000]'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Friends Roster List */}
        {filteredFriends.length === 0 ? (
          <EmptyState
            icon={<span>👥</span>}
            title={friends.length === 0 ? 'No friends connected yet' : 'No friends match filter'}
            description={
              friends.length === 0
                ? 'Friends appear here automatically once you share a group with them. Create a group or join with a code to start tracking balances!'
                : 'Try adjusting your search query or status filter.'
            }
            actionText={friends.length === 0 ? '+ Create A Group' : undefined}
            onAction={friends.length === 0 ? () => router.push('/') : undefined}
            secondaryActionText={friends.length === 0 ? 'Join with Code' : undefined}
            onSecondaryAction={friends.length === 0 ? () => router.push('/join') : undefined}
          />
        ) : (
          <div className="space-y-3">
            {filteredFriends.map((friend, idx) => {
              const net = friend.netPerCurrency[primaryCurrency] ?? 0;
              const isExpanded = expandedFriendId === friend.id;
              const colorBg = AVATAR_COLORS[idx % AVATAR_COLORS.length];
              const initial = (friend.displayName.trim()[0] || '?').toUpperCase();

              return (
                <div
                  key={friend.id}
                  className="bg-white rounded-2xl border-2 border-black shadow-[3px_3px_0px_0px_#000] overflow-hidden transition"
                >
                  {/* Friend Header Card */}
                  <div
                    onClick={() => setExpandedFriendId(isExpanded ? null : friend.id)}
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-[#fafaf6] transition select-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar Badge */}
                      <div
                        className={`w-11 h-11 rounded-xl border-2 border-black flex items-center justify-center font-mono font-black text-base text-black shadow-[2px_2px_0px_0px_#000] shrink-0 ${colorBg}`}
                      >
                        {initial}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-black truncate uppercase tracking-tight">
                            {friend.displayName}
                          </h3>
                        </div>
                        <p className="font-mono text-[10px] text-black/60 font-bold uppercase tracking-wider">
                          {friend.groups.length} SHARED {friend.groups.length === 1 ? 'GROUP' : 'GROUPS'}
                        </p>
                      </div>
                    </div>

                    {/* Balance Pill, Remind Button & Toggle */}
                    <div className="text-right shrink-0 flex items-center gap-3">
                      <div>
                        {net > 0 ? (
                          <div className="space-y-1">
                            <div className="inline-block px-2.5 py-1 rounded-lg border-2 border-black bg-[#ccff00] text-black font-mono font-black text-xs shadow-[2px_2px_0px_0px_#000]">
                              +{formatMinor(net, primaryCurrency)}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => handleOpenReminder(friend, e)}
                              className="px-2 py-0.5 rounded border-2 border-black bg-[#ffd600] hover:bg-[#ffe033] text-black font-mono font-black text-[9px] uppercase shadow-[1px_1px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer flex items-center gap-1 justify-center w-full"
                            >
                              <span>⚡ REMIND</span>
                            </button>
                          </div>
                        ) : net < 0 ? (
                          <div>
                            <div className="inline-block px-2.5 py-1 rounded-lg border-2 border-black bg-[#ff8a80] text-black font-mono font-black text-xs shadow-[2px_2px_0px_0px_#000]">
                              -{formatMinor(Math.abs(net), primaryCurrency)}
                            </div>
                            <span className="block font-mono text-[9px] text-black/60 uppercase font-black tracking-wider mt-0.5">
                              YOU OWE
                            </span>
                          </div>
                        ) : (
                          <div>
                            <div className="inline-block px-2 py-0.5 rounded-lg border border-black bg-[#ffd600] text-black font-mono font-bold text-[11px]">
                              SETTLED
                            </div>
                            <span className="block font-mono text-[9px] text-black/60 uppercase font-black tracking-wider mt-0.5">
                              ALL CLEAR
                            </span>
                          </div>
                        )}
                      </div>

                      <svg
                        className={`w-4 h-4 text-black transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded Shared Groups Breakdown */}
                  {isExpanded && (
                    <div className="border-t-2 border-black bg-[#fbfbf8] p-4 space-y-2.5 animate-fadeIn">
                      <div className="font-mono text-[10px] font-black uppercase tracking-wider text-black/70">
                        BREAKDOWN BY SHARED GROUP
                      </div>

                      <div className="space-y-2">
                        {friend.groups.map((g) => (
                          <div
                            key={g.groupId}
                            className="p-3 rounded-xl bg-white border-2 border-black shadow-[2px_2px_0px_0px_#000] flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="font-bold text-black uppercase">{g.groupName}</div>
                              <span className="font-mono text-[10px] text-black/60 font-bold uppercase">
                                Currency: {g.currency}
                              </span>
                            </div>

                            <div className="flex items-center gap-3">
                              <span
                                className={`font-mono font-black ${g.netMinor > 0
                                    ? 'text-[#008f11]'
                                    : g.netMinor < 0
                                      ? 'text-[#d32f2f]'
                                      : 'text-black/60'
                                  }`}
                              >
                                {g.netMinor > 0
                                  ? `+${formatMinor(g.netMinor, g.currency)}`
                                  : g.netMinor < 0
                                    ? `-${formatMinor(Math.abs(g.netMinor), g.currency)}`
                                    : 'SETTLED'}
                              </span>

                              <Link
                                href={`/group?id=${g.groupId}`}
                                className="px-2.5 py-1 bg-[#ffd600] hover:bg-[#ffe033] border-2 border-black rounded-lg text-[10px] font-mono font-black text-black shadow-[1px_1px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 uppercase transition"
                              >
                                VIEW
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>

                      {net > 0 && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => handleOpenReminder(friend)}
                            className="w-full py-2.5 rounded-xl border-2 border-black bg-[#ccff00] hover:bg-[#bbf000] text-black font-mono font-black text-xs uppercase shadow-[2px_2px_0px_0px_#000] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer flex items-center justify-center gap-2"
                          >
                            <span>⚡ SEND PAYMENT REMINDER</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Settle Up Reminder Modal */}
      {reminderFriend && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div
            className="w-full max-w-md bg-white border-2 border-black rounded-2xl p-5 shadow-[5px_5px_0px_0px_#000] space-y-4 max-h-[90vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between border-b-2 border-black pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg border-2 border-black bg-[#ffd600] flex items-center justify-center text-sm font-black shadow-[1px_1px_0px_0px_#000]">
                  ⚡
                </div>
                <div>
                  <h3 className="text-sm font-black font-mono uppercase tracking-tight text-black">
                    NOTIFY {reminderFriend.displayName}
                  </h3>
                  <p className="text-[10px] font-mono font-bold text-black/60">
                    Owes you +{formatMinor(reminderFriend.netPerCurrency[primaryCurrency] || 0, primaryCurrency)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setReminderFriend(null)}
                className="w-8 h-8 rounded-lg border-2 border-black bg-white hover:bg-[#ffd600] flex items-center justify-center font-mono font-black text-xs transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Recipient Account Status Indicator */}
            <div>
              {reminderFriend.userId ? (
                <div className="px-3 py-2 rounded-xl border-2 border-black bg-[#eaff96] flex items-center gap-2 shadow-[2px_2px_0px_0px_#000]">
                  <span className="text-sm">🔔</span>
                  <div className="text-[10px] font-mono font-bold text-black uppercase leading-tight">
                    <span className="font-black text-black">REGISTERED USER:</span> Direct push notifications supported
                  </div>
                </div>
              ) : (
                <div className="px-3 py-2 rounded-xl border-2 border-black bg-[#fff3cd] flex items-center gap-2 shadow-[2px_2px_0px_0px_#000]">
                  <span className="text-sm">👤</span>
                  <div className="text-[10px] font-mono font-bold text-black uppercase leading-tight">
                    <span className="font-black text-black">PLACEHOLDER CONTACT:</span> No linked app account yet
                  </div>
                </div>
              )}
            </div>

            {/* Push Notification Feedback Banner */}
            {pushStatus && (
              <div
                className={`p-3 rounded-xl border-2 border-black text-xs font-mono font-bold flex items-center gap-2 shadow-[2px_2px_0px_0px_#000] animate-fadeIn ${
                  pushStatus.success
                    ? 'bg-[#ccff00] text-black'
                    : 'bg-[#ffcdd2] text-[#b71c1c]'
                }`}
              >
                <span>{pushStatus.success ? '✓' : '⚠️'}</span>
                <span>{pushStatus.message}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-mono font-black uppercase tracking-wider text-black block">
                Reminder Message (Push Notification Content)
              </label>
              <textarea
                rows={3}
                value={reminderMessage}
                onChange={(e) => setReminderMessage(e.target.value)}
                className="w-full p-3 rounded-xl border-2 border-black bg-white font-mono text-xs font-bold text-black focus:outline-none focus:bg-[#faffea] shadow-[2px_2px_0px_0px_#000] resize-none"
              />
            </div>

            {/* Notification Actions */}
            <div className="space-y-2 pt-1">
              {reminderFriend.userId ? (
                <button
                  type="button"
                  disabled={isSendingPush}
                  onClick={handleSendPush}
                  className="w-full py-3.5 px-4 rounded-xl border-2 border-black bg-[#ccff00] hover:bg-[#bbf000] text-black font-mono font-black text-xs uppercase shadow-[3px_3px_0px_0px_#000] flex items-center justify-center gap-2 active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer disabled:opacity-50"
                >
                  <span>{isSendingPush ? '⏳ SENDING PUSH NOTIFICATION...' : '⚡ SEND PUSH NOTIFICATION'}</span>
                </button>
              ) : (
                <div className="p-3 rounded-xl border-2 border-dashed border-black bg-[#fafaf6] text-center space-y-1">
                  <p className="font-mono text-[11px] font-bold text-black">
                    Push notifications require a registered Clearcut account.
                  </p>
                  <p className="font-mono text-[10px] text-black/60 font-medium">
                    Send them a reminder via WhatsApp or SMS below:
                  </p>
                </div>
              )}

              {/* External Share Fallbacks */}
              <div className="pt-2">
                <div className="text-[10px] font-mono font-black uppercase tracking-wider text-black/60 mb-1.5">
                  {reminderFriend.userId ? 'Or share externally:' : 'External share options:'}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleSendWhatsApp}
                    className="py-2.5 px-3 rounded-xl border-2 border-black bg-[#25D366] hover:bg-[#20ba5a] text-black font-mono font-black text-xs uppercase shadow-[2px_2px_0px_0px_#000] flex items-center justify-center gap-1.5 active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer"
                  >
                    <span>💬 WHATSAPP</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleShareReminder}
                    className="py-2.5 px-3 rounded-xl border-2 border-black bg-[#00e5ff] hover:bg-[#00cbe6] text-black font-mono font-black text-xs uppercase shadow-[2px_2px_0px_0px_#000] flex items-center justify-center gap-1.5 active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer"
                  >
                    <span>📲 SMS / SHARE</span>
                  </button>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleCopyReminder}
                    className="w-full py-2 px-3 rounded-xl border-2 border-black bg-white hover:bg-[#ffd600] text-black font-mono font-black text-xs uppercase shadow-[1px_1px_0px_0px_#000] flex items-center justify-center gap-1.5 active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer"
                  >
                    <span>{copiedReminder ? '✓ COPIED TO CLIPBOARD!' : '📋 COPY MESSAGE'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Bottom Nav */}
      <BottomNav />
    </div>
  );
}
