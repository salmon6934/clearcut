'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function JoinContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const inviteCode = searchParams.get('code') || '';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex flex-col justify-between">
      <div>
        <header className="flex items-center justify-between pb-6 border-b border-slate-800">
          <button
            onClick={() => router.push('/')}
            className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-medium transition"
          >
            ← Home
          </button>
          <h1 className="text-xl font-bold tracking-tight">Join Group</h1>
          <div className="w-12" />
        </header>

        <main className="mt-8 space-y-6">
          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Deep Link Verified</span>
            <p className="mt-2 text-2xl font-extrabold text-white">Code: {inviteCode || 'None'}</p>
            <p className="mt-1 text-sm text-slate-400">
              Triggered via deep link scheme `splitapp://join?code={inviteCode || '...'}`
            </p>
          </div>
        </main>
      </div>

      <button
        onClick={() => router.push(`/group?id=${encodeURIComponent(inviteCode || 'demo')}`)}
        className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-white shadow-lg transition active:scale-[0.98]"
      >
        Confirm & Enter Group
      </button>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center">
          Loading invitation...
        </div>
      }
    >
      <JoinContent />
    </Suspense>
  );
}
