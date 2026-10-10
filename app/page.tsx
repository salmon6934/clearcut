'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isNativePlatform, getPlatform } from '@/lib/native/platform';
import { initDeepLinkListener } from '@/lib/native/deeplink';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [platform] = useState<string>(() => (typeof window !== 'undefined' ? getPlatform() : 'web'));
  const [isNative] = useState<boolean>(() => (typeof window !== 'undefined' ? isNativePlatform() : false));

  useEffect(() => {
    const unsubscribe = initDeepLinkListener((route) => {
      router.push(route);
    });

    return () => unsubscribe();
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6">
      <div className="max-w-md mx-auto w-full space-y-6">
        <header className="pt-6 pb-2">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold tracking-widest text-emerald-400 uppercase">
                Splitwise Clone • Phase 0
              </span>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-white">
                Clearcut Shell
              </h1>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              v1.0 Spike
            </span>
          </div>
        </header>

        {/* Runtime Diagnostics Card */}
        <section className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
          <h2 className="text-sm font-semibold text-slate-300">Runtime Diagnostics</h2>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
              <span className="text-slate-400 block">Platform</span>
              <span className="font-bold text-white capitalize mt-0.5 block">{platform}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
              <span className="text-slate-400 block">Native Shell</span>
              <span className={`font-bold mt-0.5 block ${isNative ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isNative ? 'Active (Capacitor)' : 'Web Mode'}
              </span>
            </div>
          </div>
        </section>

        {/* Spike Navigation Links */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-300">Phase 0 Spike Verification Routes</h2>
          
          <Link
            href="/group?id=spike-test"
            className="flex items-center justify-between p-4 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 transition active:scale-[0.99]"
          >
            <div>
              <p className="font-semibold text-white text-sm">Query-Param Routing (/group?id=...)</p>
              <p className="text-xs text-slate-400 mt-0.5">Test query routing & hardware back button</p>
            </div>
            <span className="text-slate-500 text-sm">→</span>
          </Link>

          <Link
            href="/join?code=ALPHA77"
            className="flex items-center justify-between p-4 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 transition active:scale-[0.99]"
          >
            <div>
              <p className="font-semibold text-white text-sm">Deep Link Landing (/join?code=...)</p>
              <p className="text-xs text-slate-400 mt-0.5">Test `splitapp://join?code=...` handler</p>
            </div>
            <span className="text-slate-500 text-sm">→</span>
          </Link>
        </section>
      </div>

      <footer className="max-w-md mx-auto w-full pt-6 pb-2 text-center text-xs text-slate-500">
        Next.js 15 Static Export + Capacitor 8 Architecture Spike
      </footer>
    </div>
  );
}
