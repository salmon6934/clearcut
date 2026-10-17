'use client';

// app/settings/page.tsx
// Profile Page with Display Name change, Hard Refresh from DB, Log Out, and Delete Account

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  useAuth,
  updateProfile,
  signOut,
  deleteAccount,
} from '../../lib/auth';
import { BottomNav } from '../../components/BottomNav';
import { SyncBadge } from '../../components/SyncBadge';
import { useRepository } from '../../lib/data/hooks';
import { showToast } from '../../lib/ui/toast';
import { haptics } from '../../lib/native/haptics';

export default function ProfilePage() {
  const router = useRouter();
  const authState = useAuth();
  const repo = useRepository(authState.user?.id);

  const [displayName, setDisplayName] = useState(authState.profile?.displayName || '');
  const [isUpdating, setIsUpdating] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Deletion modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (authState.profile) {
      setDisplayName(authState.profile.displayName);
    }
  }, [authState.profile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    setIsUpdating(true);
    setSaveSuccess(false);
    await haptics.tap().catch(() => {});

    const { error } = await updateProfile(displayName.trim());
    setIsUpdating(false);

    if (!error) {
      setSaveSuccess(true);
      showToast('Display name updated!', 'success', 2500);
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      showToast(error.message || 'Failed to update name', 'error', 3000);
    }
  };

  const handleSignOut = async () => {
    if (!window.confirm('Are you sure you want to log out?')) return;
    await signOut();
    router.push('/auth');
  };

  const handleHardRefresh = async () => {
    if (!window.confirm('Re-fetch everything from the database and reload local data?')) {
      return;
    }
    setIsRefreshing(true);
    await haptics.tap().catch(() => {});
    try {
      const snapshot = await repo.resetLocalCacheAndResync();
      if (snapshot && snapshot.status === 'error' && snapshot.lastError) {
        showToast(`Sync warning: ${snapshot.lastError}`, 'warning', 3500);
      } else {
        showToast('Successfully re-fetched all data from DB!', 'success', 2500);
      }
      router.replace('/');
    } catch (err: any) {
      showToast(err.message || 'Failed to re-fetch from database', 'error', 3000);
    } finally {
      setIsRefreshing(false);
    }
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
    <div className="min-h-screen bg-transparent text-[#432E22] pb-28">
      <div className="max-w-xl mx-auto p-4 sm:p-5 space-y-5">
        {/* Seamless Top Header Bar labeled "Profile" */}
        <header className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#543A2A] text-[#FAF6F0] flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <h1 className="text-2xl font-extrabold text-[#432E22] tracking-tight">
              Profile
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <SyncBadge manager={repo.syncManager} />
          </div>
        </header>
        {/* User Card */}
        <div className="p-5 sm:p-6 rounded-3xl bg-white border border-[#E5D9CC] shadow-sm space-y-5">
          <div className="flex items-center gap-3.5 pb-4 border-b border-[#E5D9CC]">
            <div className="w-14 h-14 rounded-full bg-[#543A2A] text-[#FAF6F0] font-bold text-2xl flex items-center justify-center shadow-xs">
              {displayName.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[#432E22] truncate">{displayName || 'User'}</h2>
              <p className="text-xs text-[#8D7868] truncate font-medium">{email}</p>
            </div>
          </div>

          {/* Change Display Name */}
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#6E5849] uppercase tracking-wider mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={60}
                required
                className="w-full px-4 py-2.5 text-sm font-medium rounded-2xl border border-[#E5D9CC] bg-white text-[#432E22] placeholder:text-[#A89689] focus:outline-none focus:border-[#543A2A] shadow-xs"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              {saveSuccess ? (
                <span className="text-xs font-bold text-[#2E4226] bg-[#E8F0E4] px-3 py-1 rounded-full border border-[#C5D9BE]">
                  ✓ Saved!
                </span>
              ) : (
                <span />
              )}

              <button
                type="submit"
                disabled={isUpdating || !displayName.trim()}
                className="px-5 py-2.5 text-xs font-bold uppercase rounded-full bg-[#543A2A] hover:bg-[#432E20] text-[#FAF6F0] shadow-sm transition active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                {isUpdating ? 'Saving...' : 'Save Name'}
              </button>
            </div>
          </form>
        </div>

        {/* Hard Refresh / Re-fetch from DB */}
        <div className="p-5 rounded-3xl bg-white border border-[#E5D9CC] shadow-sm flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[#432E22]">
              Hard Refresh
            </h3>
            <p className="text-xs text-[#8D7868] font-medium pt-0.5">
              Re-fetch everything fresh from the database
            </p>
          </div>

          <button
            type="button"
            onClick={handleHardRefresh}
            disabled={isRefreshing}
            className="px-4 py-2 text-xs font-bold uppercase rounded-full bg-[#D4B89B] hover:bg-[#C8A27A] text-[#432E22] shadow-xs active:scale-95 disabled:opacity-50 transition cursor-pointer shrink-0"
          >
            {isRefreshing ? 'Refreshing...' : '↻ Re-fetch DB'}
          </button>
        </div>

        {/* Account Actions: Logout & Delete Account */}
        <div className="p-5 rounded-3xl bg-white border border-[#E5D9CC] shadow-sm space-y-3">
          <div className="text-xs font-bold text-[#6E5849] uppercase tracking-wider">
            Account Actions
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={handleSignOut}
              className="py-3 px-4 text-xs font-bold uppercase rounded-full border border-[#E5D9CC] bg-white hover:bg-[#FAF6F0] text-[#543A2A] shadow-xs transition active:scale-95 cursor-pointer text-center"
            >
              Log Out
            </button>

            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="py-3 px-4 text-xs font-bold uppercase rounded-full bg-[#FCE8E6] hover:bg-[#F5C2C0] text-[#A83232] border border-[#F5C2C0] shadow-xs transition active:scale-95 cursor-pointer text-center"
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>

      {/* Persistent Bottom Nav */}
      <BottomNav />

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="max-w-md w-full bg-white border border-[#E5D9CC] rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="text-base font-bold text-[#A83232]">
                  Delete Account Permanently?
                </h3>
                <p className="text-xs text-[#8D7868]">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-[#432E22] leading-relaxed">
              All your personal identifiers will be permanently removed. Your expense history will be preserved as an anonymous member so other members' balances stay accurate.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#6E5849] block">
                Type <strong>DELETE</strong> to confirm:
              </label>
              <input
                type="text"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder="DELETE"
                className="w-full px-4 py-2.5 text-sm font-bold rounded-2xl border border-[#E5D9CC] bg-[#FAF6F0] text-[#432E22] focus:outline-none focus:border-[#A83232]"
              />
            </div>

            {deleteError && (
              <p className="text-xs font-bold text-[#A83232]">{deleteError}</p>
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
                className="flex-1 py-2.5 text-xs font-bold uppercase rounded-full border border-[#E5D9CC] bg-white hover:bg-[#FAF6F0] text-[#543A2A] shadow-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={isDeleting || deleteConfirmationText.trim().toUpperCase() !== 'DELETE'}
                className="flex-1 py-2.5 text-xs font-bold uppercase rounded-full bg-[#A83232] hover:bg-[#8D2525] text-white shadow-xs transition active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
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

