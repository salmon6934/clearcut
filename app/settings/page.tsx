'use client';

// app/settings/page.tsx
// Stitch Neo-Brutalist Account Settings Screen

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useAuth,
  updateProfile,
  signOut,
  deleteAccount,
} from '../../lib/auth';
import { BottomNav } from '../../components/BottomNav';
import { SyncBadge } from '../../components/SyncBadge';
import { useRepository } from '../../lib/data/hooks';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'JPY'];

export default function SettingsPage() {
  const router = useRouter();
  const authState = useAuth();
  const repo = useRepository(authState.user?.id);

  const [displayName, setDisplayName] = useState(authState.profile?.displayName || '');
  const [currency, setCurrency] = useState(authState.profile?.defaultCurrency || 'INR');
  const [isUpdating, setIsUpdating] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Deletion modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (authState.profile) {
      setDisplayName(authState.profile.displayName);
      setCurrency(authState.profile.defaultCurrency || 'INR');
    }
  }, [authState.profile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    setIsUpdating(true);
    setSaveSuccess(false);

    const { error } = await updateProfile(displayName.trim());
    setIsUpdating(false);

    if (!error) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth');
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmationText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm.');
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    const { error } = await deleteAccount();
    if (error) {
      setDeleteError(error.message);
      setIsDeleting(false);
    } else {
      router.push('/auth');
    }
  };

  const email = authState.user?.email || 'Offline Account';

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-black pb-28">
      {/* Top Header matching Dashboard/Friends/Activity */}
      <header className="sticky top-0 z-30 bg-[#f5f5f0] border-b-2 border-black px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#ffd600] border-2 border-black flex items-center justify-center font-mono font-black text-sm shadow-[2px_2px_0px_0px_#000]">
              ⚙️
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight uppercase leading-none">
                SETTINGS
              </h1>
            </div>
          </div>

          <SyncBadge manager={repo.syncManager} />
        </div>
      </header>

      <div className="max-w-xl mx-auto p-4 sm:p-5 space-y-4">
        {/* Profile Details Card */}
        <div className="p-5 rounded-2xl bg-white border-2 border-black shadow-[4px_4px_0px_0px_#000] space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b-2 border-black">
            <div className="w-12 h-12 rounded-xl bg-[#ccff00] border-2 border-black text-black font-black font-mono text-xl flex items-center justify-center shadow-[2px_2px_0px_0px_#000]">
              {displayName.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-black truncate uppercase font-mono">{displayName || 'User'}</h2>
              <p className="text-xs text-black/60 truncate font-mono">{email}</p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4 pt-1">
            <div>
              <label className="block text-xs font-mono font-black text-black uppercase tracking-wider mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={60}
                required
                className="w-full px-3.5 py-2.5 text-sm font-bold rounded-xl border-2 border-black bg-white text-black shadow-[2px_2px_0px_0px_#000] focus:outline-none focus:bg-[#faffea]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono font-black text-black uppercase tracking-wider mb-1.5">
                Default Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-mono font-bold rounded-xl border-2 border-black bg-white text-black shadow-[2px_2px_0px_0px_#000] focus:outline-none"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between pt-2">
              {saveSuccess ? (
                <span className="text-xs font-mono font-black text-black bg-[#ccff00] px-2 py-0.5 rounded border border-black shadow-[1px_1px_0px_0px_#000]">
                  ✓ PROFILE SAVED!
                </span>
              ) : (
                <span />
              )}

              <button
                type="submit"
                disabled={isUpdating || !displayName.trim()}
                className="px-5 py-2.5 text-xs font-mono font-black uppercase rounded-xl bg-[#ccff00] hover:bg-[#bbf000] text-black border-2 border-black shadow-[3px_3px_0px_0px_#000] transition active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 cursor-pointer"
              >
                {isUpdating ? 'SAVING...' : 'SAVE PROFILE →'}
              </button>
            </div>
          </form>
        </div>

        {/* Sync & Diagnostics Section */}
        <div className="p-4 rounded-xl bg-white border-2 border-black shadow-[3px_3px_0px_0px_#000]">
          <Link
            href="/settings/sync"
            className="flex items-center justify-between group p-1"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg border-2 border-black bg-[#00e5ff] text-black flex items-center justify-center text-sm shadow-[1.5px_1.5px_0px_0px_#000]">
                🔄
              </div>
              <div>
                <p className="text-xs font-mono font-black text-black uppercase">
                  Sync & Conflict Diagnostics
                </p>
                <p className="text-[11px] font-mono text-black/60 font-bold">
                  Inspect queue, sync status, and storage
                </p>
              </div>
            </div>
            <span className="text-sm font-black">→</span>
          </Link>
        </div>

        {/* Account Actions: Logout & Delete Account */}
        <div className="p-4 rounded-xl bg-white border-2 border-black shadow-[3px_3px_0px_0px_#000] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-black text-black uppercase">
              ACCOUNT ACTIONS
            </span>
            <span className="text-[11px] font-mono text-black/60 font-bold">
              {authState.user ? authState.user.email : 'Offline Mode'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={handleSignOut}
              className="py-2.5 px-3 text-xs font-mono font-black uppercase rounded-xl border-2 border-black bg-white hover:bg-[#ffd600] text-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-0.5 active:translate-y-0.5 cursor-pointer text-center"
            >
              LOGOUT
            </button>

            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="py-2.5 px-3 text-xs font-mono font-black uppercase rounded-xl border-2 border-black bg-[#ff8a80] hover:bg-[#ff7060] text-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-0.5 active:translate-y-0.5 cursor-pointer text-center"
            >
              DELETE ACCOUNT
            </button>
          </div>
        </div>
      </div>

      {/* Persistent Bottom Nav */}
      <BottomNav />

      {/* Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border-2 border-black rounded-2xl p-6 shadow-[5px_5px_0px_0px_#000] space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="text-base font-black uppercase font-mono text-black">
                  DELETE ACCOUNT PERMANENTLY?
                </h3>
                <p className="text-xs text-black/60 font-mono">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-black font-mono leading-relaxed">
              All your personal identifiers will be permanently removed. Your ledger history will be converted to an anonymous member so other group members' balances remain balanced.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-mono font-black text-black">
                Type <strong>DELETE</strong> to confirm:
              </label>
              <input
                type="text"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder="DELETE"
                className="w-full px-3.5 py-2 text-sm font-mono font-bold rounded-xl border-2 border-black bg-white text-black shadow-[2px_2px_0px_0px_#000] focus:outline-none"
              />
            </div>

            {deleteError && (
              <p className="text-xs font-mono font-bold text-rose-600">{deleteError}</p>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmationText('');
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="flex-1 py-2.5 text-xs font-mono font-bold uppercase rounded-xl border-2 border-black bg-white hover:bg-[#ffd600] shadow-[2px_2px_0px_0px_#000] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={isDeleting || deleteConfirmationText.trim().toUpperCase() !== 'DELETE'}
                className="flex-1 py-2.5 text-xs font-mono font-black uppercase rounded-xl bg-[#ff8a80] hover:bg-[#ff7060] text-black border-2 border-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
