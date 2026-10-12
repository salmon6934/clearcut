'use client';

// components/SyncBadge.tsx
// Visual Sync Status Pill with Real-Time Updates & Diagnostics Link

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { SyncStateSnapshot, SyncLifecycleManager } from '../lib/sync/lifecycle';

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
  const [state, setState] = useState<SyncStateSnapshot>({
    status: 'idle',
    pendingCount: 0,
    conflictCount: 0,
    deadCount: 0,
    lastSyncedAt: null,
    lastError: null,
  });

  useEffect(() => {
    if (!manager) return;
    const unsubscribe = manager.subscribe((snapshot) => {
      setState(snapshot);
    });
    return unsubscribe;
  }, [manager]);

  const { status, pendingCount, conflictCount, deadCount } = state;

  // Render badge content based on state
  let badgeContent = null;
  let badgeColorClass = 'bg-[#ffd600] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]';

  if (status === 'offline') {
    badgeColorClass = 'bg-[#e0e0d8] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]';
    badgeContent = (
      <>
        <span className="w-2 h-2 rounded-full bg-black/40 border border-black" />
        <span className="font-mono font-black text-[11px] tracking-wide">OFFLINE</span>
      </>
    );
  } else if (status === 'syncing') {
    badgeColorClass = 'bg-[#00e5ff] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]';
    badgeContent = (
      <>
        <span className="w-2 h-2 rounded-full bg-black animate-ping" />
        <span className="font-mono font-black text-[11px] tracking-wide">SYNCING</span>
      </>
    );
  } else if (conflictCount > 0) {
    badgeColorClass = 'bg-[#ff5c5c] text-white border-2 border-black shadow-[2px_2px_0px_0px_#000]';
    badgeContent = (
      <>
        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
        <span className="font-mono font-black text-[11px] tracking-wide">{conflictCount} CONFLICT</span>
      </>
    );
  } else if (deadCount > 0) {
    badgeColorClass = 'bg-[#ff5c5c] text-white border-2 border-black shadow-[2px_2px_0px_0px_#000]';
    badgeContent = (
      <>
        <span className="w-2 h-2 rounded-full bg-white" />
        <span className="font-mono font-black text-[11px] tracking-wide">ERROR</span>
      </>
    );
  } else if (pendingCount > 0) {
    badgeColorClass = 'bg-[#ffd600] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]';
    badgeContent = (
      <>
        <span className="w-2 h-2 rounded-full bg-black animate-pulse" />
        <span className="font-mono font-black text-[11px] tracking-wide">{pendingCount} PENDING</span>
      </>
    );
  } else {
    // Default LIVE state matching Stitch design
    badgeColorClass = 'bg-[#ffd600] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000]';
    badgeContent = (
      <>
        <span className="w-2.5 h-2.5 rounded-full bg-black" />
        <span className="font-mono font-black text-[11px] tracking-wider">LIVE</span>
      </>
    );
  }

  const badgeElement = (
    <div
      onClick={onClickKick}
      role="status"
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all select-none ${
        onClickKick ? 'cursor-pointer active:translate-x-0.5 active:translate-y-0.5' : ''
      } ${badgeColorClass}`}
      title={state.lastSyncedAt ? `Last synced: ${new Date(state.lastSyncedAt).toLocaleTimeString()}` : 'Real-time ledger sync active'}
    >
      {badgeContent}
    </div>
  );

  if (showLinkToDiagnostics && (conflictCount > 0 || deadCount > 0)) {
    return <Link href="/settings/sync">{badgeElement}</Link>;
  }

  return badgeElement;
}
