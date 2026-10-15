'use client';

// components/SplashScreen.tsx
// Neo-Brutalist App Splash Screen for Web & Native Capacitor

import React, { useState, useEffect } from 'react';

export function SplashScreen({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(true);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // Hide native splash screen if running in Capacitor
    try {
      import('@capacitor/splash-screen').then(({ SplashScreen: CapSplash }) => {
        CapSplash.hide().catch(() => {});
      }).catch(() => {});
    } catch {
      // Non-capacitor environment
    }

    // Keep splash visible briefly to allow state & local store to initialize
    const timer = setTimeout(() => {
      setIsFading(true);
      const removeTimer = setTimeout(() => {
        setShowSplash(false);
      }, 350); // duration of fade transition

      return () => clearTimeout(removeTimer);
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      {showSplash && (
        <div
          className={`fixed inset-0 z-[9999] bg-[#f5f5f0] flex flex-col items-center justify-center p-6 select-none transition-opacity duration-300 ${
            isFading ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <div className="flex flex-col items-center text-center space-y-5 animate-fadeIn">
            {/* Logo in Neo-Brutalist Card */}
            <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-3xl border-3 border-black bg-white shadow-[6px_6px_0px_0px_#000] p-2 flex items-center justify-center overflow-hidden">
              <img
                src="/icon.png"
                alt="Clearcut Logo"
                className="w-full h-full object-contain rounded-2xl"
              />
            </div>

            {/* App Brand */}
            <div className="space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-black uppercase">
                CLEARCUT
              </h1>
              <p className="text-[11px] font-mono font-bold tracking-widest uppercase text-black/60">
                P2P EXPENSE SHARING
              </p>
            </div>

            {/* Neo-brutalist Loading Indicator */}
            <div className="pt-2 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-black animate-bounce [animation-delay:-0.3s]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#ccff00] border border-black animate-bounce [animation-delay:-0.15s]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#00e5ff] border border-black animate-bounce" />
            </div>
          </div>
        </div>
      )}
      {children}
    </>
  );
}
