'use client';

// components/SyncBadge.tsx
// Interactive Warm Cafe Sync/Refresh Button fetching authoritative state from Supabase

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SyncStateSnapshot, SyncLifecycleManager } from '../lib/sync/lifecycle';
import { isDeviceOnline } from '../lib/sync/lifecycle';
import { resetBackoff } from '../lib/sync/push';
import { showToast } from '../lib/ui/toast';
import { haptics } from '../lib/native/haptics';
import type { RealtimeStatus } from '../lib/sync/realtime';

interface SyncBadgeProps {
  manager?: SyncLifecycleManager;
  realtimeStatus?: RealtimeStatus;
  onClickKick?: () => void;
  showLinkToDiagnostics?: boolean;
}

export function SyncBadge({
  manager,
  realtimeStatus,
  onClickKick,
  showLinkToDiagnostics = true,
}: SyncBadgeProps) {
  const router = useRouter();
  const [state, setState] = useState<SyncStateSnapshot>({
    status: 'idle',
    pendingCount: 0,
    conflictCount: 0,
    deadCount: 0,
    lastSyncedAt: null,
    lastError: null,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);

  useEffect(() => {
    if (!manager) return;
    const unsubscribe = manager.subscribe((snapshot) => {
      setState(snapshot);
    });
    return unsubscribe;
  }, [manager]);

  const { status, conflictCount, deadCount } = state;
  const isSyncActive = status === 'syncing' || isRefreshing;
  const isOffline = status === 'offline' || !isDeviceOnline();
  const hasIssues = conflictCount > 0 || deadCount > 0;

  const handleRefresh = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // If there are conflicts or dead-letter mutations, tapping routes to diagnostics
    if (hasIssues && showLinkToDiagnostics) {
      await haptics.tap().catch(() => {});
      router.push('/settings/sync');
      return;
    }

    if (isSyncActive) return;

    await haptics.tap().catch(() => {});
    setIsRefreshing(true);

    try {
      if (manager) {
        resetBackoff();
        // Kick full refresh (clears cursor so all tables are freshly pulled)
        const snapshot = await manager.kick('manual_refresh', true);
        if (snapshot.status === 'error' && snapshot.lastError) {
          showToast(snapshot.lastError, 'error', 3000);
        } else if (snapshot.status === 'offline') {
          showToast('Device is offline. Connect to internet to sync.', 'warning', 3000);
        }
      }
      onClickKick?.();

      setJustSynced(true);
      setTimeout(() => {
        setJustSynced(false);
      }, 2000);
    } catch (err: any) {
      showToast(err.message || 'Refresh failed', 'error', 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Badge content
  let buttonContent = null;

  if (isSyncActive) {
    buttonContent = (
      <svg
        className="w-4 h-4 animate-spin shrink-0 stroke-[2.5]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    );
  } else if (justSynced) {
    buttonContent = (
      <svg
        className="w-4 h-4 shrink-0 stroke-[2.5] text-[#4E6B48]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  } else if (hasIssues) {
    buttonContent = (
      <div className="relative flex items-center justify-center">
        <svg
          className="w-4 h-4 shrink-0 stroke-[2.5]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#A84A3B] border border-white animate-pulse" />
      </div>
    );
  } else if (isOffline) {
    buttonContent = (
      <div className="relative flex items-center justify-center text-[#8D7868]/50">
        <svg
          className="w-4 h-4 shrink-0 stroke-[2.5]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        <span className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full bg-[#8D7868]/40 border border-white" />
      </div>
    );
  } else {
    // Default interactive state: circular arrow icon
    buttonContent = (
      <svg
        className="w-4 h-4 shrink-0 stroke-[2.5]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    );
  }

  const buttonElement = (
    <button
      type="button"
      onClick={handleRefresh}
      aria-label={isOffline ? 'Offline - tap to check connection' : 'Online - tap to refresh from Supabase'}
      className="relative w-10 h-10 bg-[#FAF6F0] hover:bg-[#EFE4D6] text-[#543A2A] border border-[#E5D9CC] rounded-full shadow-sm flex items-center justify-center active:scale-95 transition-all select-none cursor-pointer"
      title={
        isOffline
          ? 'Offline — changes are saved locally. Connect to internet to sync.'
          : hasIssues
          ? 'Sync issues detected. Tap to inspect and resolve.'
          : state.lastSyncedAt
          ? `Online (synced ${new Date(state.lastSyncedAt).toLocaleTimeString()}). Tap to refresh.`
          : 'Online — tap to fetch fresh data from Supabase'
      }
    >
      {buttonContent}
      {/* Online / Offline indicator dot */}
      <span
        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-white shadow-sm ${
          isOffline
            ? 'bg-[#A84A3B] animate-pulse'
            : 'bg-[#4E6B48]'
        }`}
        title={isOffline ? 'Offline' : 'Online'}
      />
    </button>
  );

  return buttonElement;
}
