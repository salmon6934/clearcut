'use client';

// components/SyncBadge.tsx
// Visual Sync Status Pill with Real-Time Updates & Diagnostics Link

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { SyncStateSnapshot, SyncLifecycleManager } from '../lib/sync/lifecycle';

interface SyncBadgeProps {
  manager?: SyncLifecycleManager;
  onClickKick?: () => void;
  showLinkToDiagnostics?: boolean;
}

export function SyncBadge({
  manager,
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
  let badgeColorClass = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';

  if (status === 'offline') {
    badgeColorClass = 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20';
    badgeContent = (
      <>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 3l18 18M9.88 9.88A3 3 0 1014.12 14.12M6.5 17.5H4a4 4 0 01-1.38-7.75 5 5 0 019.57-2.88"
          />
        </svg>
        <span>Offline</span>
      </>
    );
  } else if (status === 'syncing') {
    badgeColorClass = 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20';
    badgeContent = (
      <>
        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          ></path>
        </svg>
        <span>Syncing...</span>
      </>
    );
  } else if (conflictCount > 0) {
    badgeColorClass = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    badgeContent = (
      <>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span>{conflictCount} conflict{conflictCount > 1 ? 's' : ''}</span>
      </>
    );
  } else if (deadCount > 0) {
    badgeColorClass = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
    badgeContent = (
      <>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>Sync issue</span>
      </>
    );
  } else if (pendingCount > 0) {
    badgeColorClass = 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
    badgeContent = (
      <>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>{pendingCount} pending</span>
      </>
    );
  } else {
    badgeContent = (
      <>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span>Synced</span>
      </>
    );
  }

  const badgeElement = (
    <div
      onClick={onClickKick}
      role="status"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-all select-none ${
        onClickKick ? 'cursor-pointer active:scale-95' : ''
      } ${badgeColorClass}`}
      title={state.lastSyncedAt ? `Last synced: ${new Date(state.lastSyncedAt).toLocaleTimeString()}` : 'Offline-first sync active'}
    >
      {badgeContent}
    </div>
  );

  if (showLinkToDiagnostics && (conflictCount > 0 || deadCount > 0)) {
    return <Link href="/settings/sync">{badgeElement}</Link>;
  }

  return badgeElement;
}
