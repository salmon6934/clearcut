'use client';

// app/error.tsx
// Route segment error boundary for Clearcut (App Router)

import React, { useEffect } from 'react';
import { AlertTriangle, RotateCw, Home } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Clearcut ErrorBoundary]:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-transparent p-6 flex flex-col items-center justify-center text-center font-sans">
      <div className="w-full max-w-sm bg-white border border-[#E5D9CC] rounded-3xl p-6 shadow-xl space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-[#FCE8E6] text-[#A83232] border border-[#F5C2C0] flex items-center justify-center mx-auto shadow-xs">
          <AlertTriangle className="w-6 h-6 text-[#A83232]" />
        </div>

        <div className="space-y-1">
          <h1 className="text-base font-bold text-[#432E22]">Something went wrong</h1>
          <p className="text-xs text-[#8D7868] font-medium leading-relaxed">
            An unexpected error occurred while loading this view. You can retry or head back to the dashboard.
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={() => reset()}
            className="w-full py-2.5 px-4 text-xs font-bold uppercase tracking-wider rounded-full bg-[#543A2A] text-[#FAF6F0] hover:bg-[#432E20] shadow-sm active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>

          <button
            onClick={() => {
              window.location.href = '/';
            }}
            className="w-full py-2.5 px-4 text-xs font-bold uppercase tracking-wider rounded-full border border-[#E5D9CC] bg-[#FAF6F0] text-[#543A2A] hover:bg-[#EFE4D6] shadow-xs active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </button>
        </div>
      </div>
    </div>
  );
}

