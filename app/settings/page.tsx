'use client';

// app/settings/page.tsx
// Stitch Neo-Brutalist Account Settings Screen

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getAuthState,
  subscribeAuth,
  updateProfile,
  signOut,
  deleteAccount,
  type AuthState,
} from '../../lib/auth';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'JPY'];

export default function SettingsPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>(getAuthState());

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
    const unsub = subscribeAuth((state) => {
      setAuthState(state);
      if (state.profile) {
        setDisplayName(state.profile.displayName);
        setCurrency(state.profile.defaultCurrency || 'INR');
      }
    });
    return unsub;
  }, []);

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
    <div className="min-h-screen bg-[#f5f5f0] text-black p-4 sm:p-6 pb-20">
      <div className="max-w-lg mx-auto space-y-5">
        {/* Header */}
        <header className="flex items-center justify-between pt-1">
          <Link
            href="/"
            className="w-10 h-10 rounded-lg border-2 border-black bg-white flex items-center justify-center text-black hover:bg-[#ffd600] transition active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_0px_#000]"
          >
            <svg className="w-4 h-4 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-base sm:text-lg font-black uppercase font-mono tracking-tight">SETTINGS & PROFILE</h1>
          <div className="w-10" />
        </header>

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

        {/* Session Management */}
        <div className="p-4 rounded-xl bg-white border-2 border-black shadow-[3px_3px_0px_0px_#000] flex items-center justify-between">
          <div>
            <p className="text-xs font-mono font-black text-black uppercase">Session</p>
            <p className="text-[11px] text-black/60 font-mono font-bold">Log out and clear session</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="px-4 py-2 text-xs font-mono font-black uppercase rounded-lg border-2 border-black bg-white hover:bg-[#ffd600] text-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          >
            Sign Out
          </button>
        </div>

        {/* Danger Zone: Account Deletion */}
        <div className="p-5 rounded-2xl border-2 border-black bg-[#ffebee] shadow-[4px_4px_0px_0px_#000] space-y-3">
          <h3 className="text-xs font-mono font-black uppercase tracking-wider text-black">
            ⚠️ DANGER ZONE
          </h3>
          <p className="text-xs text-black font-mono leading-relaxed">
            Deleting your account will permanently wipe your profile, login credentials, and notification tokens. Your historical group expenses and balances will be anonymized to maintain financial consistency.
          </p>
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="px-4 py-2.5 text-xs font-mono font-black uppercase rounded-xl bg-[#ff8a80] hover:bg-[#ff7060] text-black border-2 border-black shadow-[3px_3px_0px_0px_#000] transition active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          >
            Delete Account
          </button>
        </div>
      </div>

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
