'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useHardwareBackButton } from '@/lib/native/back-button';

function GroupDetailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const groupId = searchParams.get('id') || 'Unknown Group';
  const [isModalOpen, setIsModalOpen] = useState(false);

  useHardwareBackButton(isModalOpen, () => setIsModalOpen(false));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex flex-col justify-between">
      <div>
        <header className="flex items-center justify-between pb-6 border-b border-slate-800">
          <button
            onClick={() => router.back()}
            className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-medium transition"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold tracking-tight">Group Details</h1>
          <div className="w-12" />
        </header>

        <main className="mt-8 space-y-6">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Active Group</span>
            <p className="mt-2 text-2xl font-extrabold text-white">ID: {groupId}</p>
            <p className="mt-1 text-sm text-slate-400">
              Query-param routing verified for static export. Loaded without 404 or white-screen.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <h2 className="text-sm font-semibold text-slate-300">Spike T-0.1 Verification</h2>
            <ul className="mt-3 space-y-2 text-xs text-slate-400">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Static export trailingSlash & export config</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Query-param URL parsing (`?id={groupId}`)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Hardware back button closes modal before navigating back</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-white shadow-lg transition active:scale-[0.98]"
          >
            Test Hardware Back Interceptor (Open Modal)
          </button>
        </main>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm p-6 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl text-center space-y-4">
            <h3 className="text-lg font-bold text-white">Test Modal Active</h3>
            <p className="text-sm text-slate-300">
              Press your device’s hardware back button. It will intercept and close this modal without exiting or navigating away from the page!
            </p>
            <button
              onClick={() => setIsModalOpen(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition"
            >
              Dismiss Modal Manually
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GroupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center">
          Loading group...
        </div>
      }
    >
      <GroupDetailContent />
    </Suspense>
  );
}
