'use client';

// app/friends/page.tsx
// Friends Page with overall status+balance summary, list of friends, and expandable shared expenses with Settle & Remind buttons

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRepository, useFriendsBalances } from '../../lib/data/hooks';
import { formatMinor } from '../../lib/engine/money';
import { useAuth } from '../../lib/auth';
import { EmptyState } from '../../components/EmptyState';
import { BottomNav } from '../../components/BottomNav';
import { SyncBadge } from '../../components/SyncBadge';
import { SettleModal } from '../../components/SettleModal';
import { haptics } from '../../lib/native/haptics';
import { sendFriendPushReminder } from '../../lib/native/push';
import type { FriendSummary } from '../../lib/data/selectors';
import type { Member, Expense, SettlementDraft } from '../../lib/data/types';

const AVATAR_COLORS = [
  'bg-[#543A2A] text-[#FAF6F0]', // Espresso
  'bg-[#D4B89B] text-[#432E22]', // Warm Caramel
  'bg-[#C7B299] text-[#432E22]', // Warm Sand
  'bg-[#E5BFB0] text-[#432E22]', // Blush Mocha
  'bg-[#B5C2A3] text-[#2E4226]', // Warm Sage
];

let hasClientHydratedFriends = false;

export default function FriendsPage() {
  const router = useRouter();
  const authState = useAuth();
  const currentUserId = authState.user?.id || 'local_user';
  const repo = useRepository(currentUserId);

  const friends = useFriendsBalances(repo, currentUserId);

  const [mounted, setMounted] = useState(hasClientHydratedFriends);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFriendId, setExpandedFriendId] = useState<string | null>(null);

  // Settle modal state
  const [settleContext, setSettleContext] = useState<{
    groupId: string;
    currency: string;
    members: Member[];
    fromMemberId?: string;
    toMemberId?: string;
    amountMinor?: number;
  } | null>(null);

  // Reminder Notification Modal State
  const [reminderFriend, setReminderFriend] = useState<FriendSummary | null>(null);
  const [reminderMessage, setReminderMessage] = useState('');
  const [copiedReminder, setCopiedReminder] = useState(false);
  const [isSendingPush, setIsSendingPush] = useState(false);
  const [pushStatus, setPushStatus] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    hasClientHydratedFriends = true;
    setMounted(true);
    repo.syncManager?.kick('friends_mount', true).catch(() => { });
  }, [repo]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-transparent text-[#432E22] pb-28">
        <div className="max-w-xl mx-auto p-4 sm:p-5 space-y-5 animate-pulse">
          <header className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#EFE4D6]" />
              <div className="h-7 w-28 bg-[#EFE4D6] rounded-xl" />
            </div>
            <div className="h-9 w-24 bg-[#EFE4D6] rounded-full" />
          </header>
          <div className="h-28 w-full bg-white rounded-3xl border border-[#E5D9CC]" />
          <div className="h-16 w-full bg-white rounded-2xl border border-[#E5D9CC]" />
        </div>
      </div>
    );
  }

  // Calculate overall totals across friends
  let totalOwedToYou = 0;
  let totalYouOwe = 0;
  const primaryCurrency = 'INR';

  for (const f of friends) {
    const net = f.netPerCurrency[primaryCurrency] ?? 0;
    if (net > 0) totalOwedToYou += net;
    else if (net < 0) totalYouOwe += Math.abs(net);
  }

  const overallNet = totalOwedToYou - totalYouOwe;

  const handleOpenReminder = (friend: FriendSummary, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const net = friend.netPerCurrency[primaryCurrency] ?? 0;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const text = `Hey ${friend.displayName}! Friendly reminder regarding the ${primaryCurrency} ${formatMinor(net, primaryCurrency)} balance on Clearcut. Let's settle up whenever you get a chance! ${origin}/friends`;
    setReminderFriend(friend);
    setReminderMessage(text);
    setCopiedReminder(false);
    setPushStatus(null);
    haptics.tap().catch(() => { });
  };

  const handleOpenSettle = (friend: FriendSummary, e?: React.MouseEvent) => {
    e?.stopPropagation();
    haptics.tap().catch(() => { });

    if (friend.groups.length === 0) return;

    // Pick first shared group that has an outstanding balance, or the first shared group
    const targetGroup = friend.groups.find((g) => g.netMinor !== 0) || friend.groups[0];
    if (!targetGroup) return;
    const groupMembers = repo.store.getGroupMembers(targetGroup.groupId);
    const currentMember = groupMembers.find((m) => m.userId === currentUserId);
    const friendMember = groupMembers.find((m) => m.id === friend.id || m.userId === friend.userId);

    const net = targetGroup.netMinor;
    let fromId = currentMember?.id;
    let toId = friendMember?.id;

    if (net > 0) {
      // Friend owes current user
      fromId = friendMember?.id;
      toId = currentMember?.id;
    }

    setSettleContext({
      groupId: targetGroup.groupId,
      currency: targetGroup.currency,
      members: groupMembers,
      fromMemberId: fromId,
      toMemberId: toId,
      amountMinor: Math.abs(net),
    });
  };

  const handleExecuteSettle = (draft: SettlementDraft) => {
    repo.addSettlement(draft, currentUserId);
    setSettleContext(null);
  };

  const handleSendPush = async () => {
    if (!reminderFriend) return;
    setIsSendingPush(true);
    setPushStatus(null);
    haptics.tap().catch(() => { });

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
        haptics.success().catch(() => { });
        setPushStatus({ success: true, message: res.message });
      } else {
        haptics.warning().catch(() => { });
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
    haptics.tap().catch(() => { });
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(reminderMessage)}`;
    window.open(url, '_blank');
  };

  const handleShareReminder = async () => {
    haptics.tap().catch(() => { });
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Settle up',
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
    haptics.tap().catch(() => { });
    await navigator.clipboard.writeText(reminderMessage);
    setCopiedReminder(true);
    setTimeout(() => setCopiedReminder(false), 2500);
  };

  // Get shared expenses for a friend
  const getSharedExpenses = (friend: FriendSummary) => {
    const list: { expense: Expense; groupName: string }[] = [];
    for (const g of friend.groups) {
      const expenses = repo.store.getGroupExpenses(g.groupId);
      for (const exp of expenses) {
        if (exp.deletedAt) continue;
        const involvesFriend = exp.splits.some(
          (s) => (s.memberId === friend.id || (friend.userId && s.memberId === friend.userId)) &&
            (s.paidMinor > 0 || s.owedMinor > 0)
        );
        if (involvesFriend) {
          list.push({ expense: exp, groupName: g.groupName });
        }
      }
    }
    return list.sort((a, b) => (b.expense.expenseDate || '').localeCompare(a.expense.expenseDate || ''));
  };

  // Filter friends list
  const filteredFriends = friends.filter((f) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = f.displayName.toLowerCase().includes(q);
      const matchGroup = f.groups.some((g) => g.groupName.toLowerCase().includes(q));
      if (!matchName && !matchGroup) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-transparent text-[#432E22] pb-28">
      <div className="max-w-xl mx-auto p-4 sm:p-5 space-y-5">
        {/* Seamless Top Header Bar labeled "Friends" */}
        <header className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#543A2A] text-[#FAF6F0] flex items-center justify-center shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m11 17 2 2a1 1 0 1 0 3-3" />
                <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
                <path d="m21 3 1 11h-2" />
                <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
                <path d="M3 4h8" />
              </svg>
            </div>
            <h1 className="text-2xl font-extrabold text-[#432E22] tracking-tight">
              Friends
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <SyncBadge manager={repo.syncManager} />
          </div>
        </header>
        {/* Top Summary Card (status + balance) */}
        <div className="bg-[#FAF6F0] rounded-3xl border border-[#E5D9CC] p-5 shadow-sm text-center">
          <div className="text-xs font-bold text-[#8D7868] uppercase tracking-wider mb-1">
            Overall Balance
          </div>
          {overallNet > 0 ? (
            <div className="space-y-1">
              <div className="text-2xl sm:text-3xl font-extrabold text-[#543A2A]">
                You are owed ₹{formatMinor(overallNet, primaryCurrency)}
              </div>
              <p className="text-xs text-[#8D7868]">
                Across {friends.filter((f) => (f.netPerCurrency[primaryCurrency] ?? 0) > 0).length} friends
              </p>
            </div>
          ) : overallNet < 0 ? (
            <div className="space-y-1">
              <div className="text-2xl sm:text-3xl font-extrabold text-[#A83232]">
                You owe ₹{formatMinor(Math.abs(overallNet), primaryCurrency)}
              </div>
              <p className="text-xs text-[#8D7868]">
                Across {friends.filter((f) => (f.netPerCurrency[primaryCurrency] ?? 0) < 0).length} friends
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-xl sm:text-2xl font-bold text-[#543A2A]">
                Relax, you are settled up
              </div>
              <p className="text-xs text-[#8D7868]">
                No pending balances with any friends
              </p>
            </div>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search friends..."
            className="w-full pl-9 pr-4 py-2.5 rounded-full border border-[#E5D9CC] bg-white text-xs font-medium text-[#432E22] placeholder:text-[#A89689] focus:outline-none focus:border-[#543A2A] shadow-xs"
          />
          <svg
            className="w-4 h-4 text-[#A89689] absolute left-3 top-3 stroke-[2.5]"
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
              className="absolute right-3 top-2.5 text-xs text-[#A89689] hover:text-[#543A2A]"
            >
              ✕
            </button>
          )}
        </div>

        {/* Friends List with Balances */}
        {filteredFriends.length === 0 ? (
          <EmptyState
            icon={
              <div className="w-12 h-12 rounded-2xl bg-[#543A2A]/10 text-[#543A2A] flex items-center justify-center">
                <svg className="w-6 h-6 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
            }
            title={friends.length === 0 ? 'No friends connected yet' : 'No friends match search'}
            description={
              friends.length === 0
                ? 'Friends appear here automatically once you share a group with them. Create a group or join with a code to start tracking balances!'
                : 'Try adjusting your search query.'
            }
            actionText={friends.length === 0 ? '+ Create A Group' : undefined}
            onAction={friends.length === 0 ? () => router.push('/') : undefined}
          />
        ) : (
          <div className="space-y-3">
            {filteredFriends.map((friend, idx) => {
              const net = friend.netPerCurrency[primaryCurrency] ?? 0;
              const isExpanded = expandedFriendId === friend.id;
              const colorBg = AVATAR_COLORS[idx % AVATAR_COLORS.length];
              const initial = (friend.displayName.trim()[0] || '?').toUpperCase();
              const sharedExpenses = isExpanded ? getSharedExpenses(friend) : [];

              return (
                <div
                  key={friend.id}
                  className="bg-white rounded-3xl border border-[#E5D9CC] shadow-xs overflow-hidden transition"
                >
                  {/* Friend Header Card */}
                  <div
                    onClick={() => setExpandedFriendId(isExpanded ? null : friend.id)}
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-[#FAF6F0] transition select-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar */}
                      <div
                        className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shrink-0 shadow-xs ${colorBg}`}
                      >
                        {initial}
                      </div>

                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-[#432E22] truncate">
                          {friend.displayName}
                        </h3>
                        <p className="text-[11px] text-[#8D7868] font-medium">
                          {friend.groups.length} shared {friend.groups.length === 1 ? 'group' : 'groups'}
                        </p>
                      </div>
                    </div>

                    {/* Balance & Caret */}
                    <div className="text-right shrink-0 flex items-center gap-3">
                      <div>
                        {net > 0 ? (
                          <div>
                            <span className="text-xs font-bold text-[#543A2A]">
                              Owes you ₹{formatMinor(net, primaryCurrency)}
                            </span>
                          </div>
                        ) : net < 0 ? (
                          <div>
                            <span className="text-xs font-bold text-[#A83232]">
                              You owe ₹{formatMinor(Math.abs(net), primaryCurrency)}
                            </span>
                          </div>
                        ) : (
                          <div>
                            <span className="text-xs font-semibold text-[#8D7868]">
                              Settled up
                            </span>
                          </div>
                        )}
                      </div>

                      <svg
                        className={`w-4 h-4 text-[#8D7868] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded Shared Expenses & Action Buttons */}
                  {isExpanded && (
                    <div className="border-t border-[#E5D9CC] bg-[#FAF6F0]/60 p-4 space-y-3">
                      <div className="text-xs font-bold text-[#6E5849] uppercase tracking-wider">
                        Shared Expenses ({sharedExpenses.length})
                      </div>

                      {sharedExpenses.length === 0 ? (
                        <div className="py-4 text-center text-xs text-[#8D7868]">
                          No shared expenses recorded yet.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {sharedExpenses.map(({ expense, groupName }) => (
                            <div
                              key={expense.id}
                              className="p-3 rounded-2xl bg-white border border-[#E5D9CC] shadow-xs flex items-center justify-between text-xs"
                            >
                              <div className="min-w-0 pr-2">
                                <div className="font-bold text-[#432E22] truncate">
                                  {expense.title}
                                </div>
                                <div className="text-[10px] text-[#8D7868] flex items-center gap-1.5 pt-0.5">
                                  <span>{groupName}</span>
                                  <span>•</span>
                                  <span>{expense.expenseDate}</span>
                                </div>
                              </div>
                              <div className="font-bold text-[#543A2A] shrink-0">
                                ₹{formatMinor(expense.amountMinor, expense.currency)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action Buttons: Settle & Remind */}
                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={(e) => handleOpenSettle(friend, e)}
                          className="flex-1 py-2.5 rounded-full bg-[#543A2A] hover:bg-[#432E20] text-[#FAF6F0] text-xs font-bold uppercase shadow-sm active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <span>⚡ Settle</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handleOpenReminder(friend, e)}
                          className="flex-1 py-2.5 rounded-full bg-[#D4B89B] hover:bg-[#C8A27A] text-[#432E22] text-xs font-bold uppercase shadow-sm active:scale-95 transition cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <span>🔔 Remind</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Settle Modal */}
      {settleContext && (
        <SettleModal
          isOpen={Boolean(settleContext)}
          onClose={() => setSettleContext(null)}
          groupId={settleContext.groupId}
          currency={settleContext.currency}
          members={settleContext.members}
          initialFromMemberId={settleContext.fromMemberId}
          initialToMemberId={settleContext.toMemberId}
          initialAmountMinor={settleContext.amountMinor}
          onSettle={handleExecuteSettle}
        />
      )}

      {/* Reminder Notification Modal */}
      {reminderFriend && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div
            className="w-full max-w-md bg-white border border-[#E5D9CC] rounded-3xl p-5 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between border-b border-[#E5D9CC] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#EFE4D6] flex items-center justify-center text-sm font-bold text-[#543A2A]">
                  🔔
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#432E22]">
                    Remind {reminderFriend.displayName}
                  </h3>
                  <p className="text-[11px] text-[#8D7868]">
                    Balance: ₹{formatMinor(reminderFriend.netPerCurrency[primaryCurrency] || 0, primaryCurrency)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setReminderFriend(null)}
                className="w-8 h-8 rounded-full border border-[#E5D9CC] bg-white hover:bg-[#EFE4D6] flex items-center justify-center text-xs text-[#543A2A] transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Recipient Account Status Indicator */}
            <div>
              {reminderFriend.userId ? (
                <div className="px-3 py-2 rounded-2xl bg-[#E8F0E4] border border-[#C5D9BE] flex items-center gap-2">
                  <span className="text-sm">🔔</span>
                  <div className="text-[11px] font-medium text-[#2E4226]">
                    Direct push notifications supported
                  </div>
                </div>
              ) : (
                <div className="px-3 py-2 rounded-2xl bg-[#FAF6F0] border border-[#E5D9CC] flex items-center gap-2">
                  <span className="text-sm">👤</span>
                  <div className="text-[11px] font-medium text-[#8D7868]">
                    Share via WhatsApp or SMS below
                  </div>
                </div>
              )}
            </div>

            {/* Push Feedback Banner */}
            {pushStatus && (
              <div
                className={`p-3 rounded-2xl text-xs font-medium flex items-center gap-2 ${pushStatus.success
                    ? 'bg-[#E8F0E4] text-[#2E4226]'
                    : 'bg-[#FCE8E6] text-[#A83232]'
                  }`}
              >
                <span>{pushStatus.success ? '✓' : '⚠️'}</span>
                <span>{pushStatus.message}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#6E5849] uppercase tracking-wider block">
                Reminder Message
              </label>
              <textarea
                rows={3}
                value={reminderMessage}
                onChange={(e) => setReminderMessage(e.target.value)}
                className="w-full p-3 rounded-2xl border border-[#E5D9CC] bg-[#FAF6F0] text-xs font-medium text-[#432E22] focus:outline-none focus:border-[#543A2A] resize-none"
              />
            </div>

            {/* Notification Actions */}
            <div className="space-y-2 pt-1">
              {reminderFriend.userId && (
                <button
                  type="button"
                  disabled={isSendingPush}
                  onClick={handleSendPush}
                  className="w-full py-3 px-4 rounded-full bg-[#543A2A] hover:bg-[#432E20] text-[#FAF6F0] text-xs font-bold uppercase shadow-sm flex items-center justify-center gap-2 active:scale-95 transition cursor-pointer disabled:opacity-50"
                >
                  <span>{isSendingPush ? 'Sending...' : '⚡ Send Push Notification'}</span>
                </button>
              )}

              {/* External Share Fallbacks */}
              <div className="pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleSendWhatsApp}
                    className="py-2.5 px-3 rounded-full bg-[#25D366] hover:bg-[#20ba5a] text-white font-bold text-xs uppercase shadow-xs flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
                  >
                    <span>💬 WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleShareReminder}
                    className="py-2.5 px-3 rounded-full bg-[#543A2A] hover:bg-[#432E20] text-[#FAF6F0] font-bold text-xs uppercase shadow-xs flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
                  >
                    <span>📲 SMS / Share</span>
                  </button>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleCopyReminder}
                    className="w-full py-2 px-3 rounded-full border border-[#E5D9CC] bg-white hover:bg-[#EFE4D6] text-[#543A2A] font-bold text-xs uppercase shadow-xs flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
                  >
                    <span>{copiedReminder ? '✓ Copied to clipboard!' : '📋 Copy Message'}</span>
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

