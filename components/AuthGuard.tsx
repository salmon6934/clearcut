'use client';

// components/AuthGuard.tsx
// Global authentication routing guard and session protector

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const PUBLIC_ROUTES = ['/auth', '/join'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, isLoading } = useAuth();

  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname?.startsWith(route));

  useEffect(() => {
    if (isLoading) return;

    if (!user && !isPublicRoute) {
      // User is not authenticated and trying to access a protected route
      const redirectUrl =
        pathname && pathname !== '/' ? `?redirect=${encodeURIComponent(pathname)}` : '';
      router.replace(`/auth${redirectUrl}`);
    } else if (user && pathname === '/auth') {
      // If user still needs to pick their initial display name, let AuthForm show the profile step
      const needsProfile = !profile?.displayName || profile.displayName === 'User';
      if (!needsProfile) {
        router.replace('/');
      }
    }
  }, [user, profile, isLoading, isPublicRoute, pathname, router]);

  // If loading auth state and on a protected route, show a branded splash/loading screen
  if (isLoading && !isPublicRoute) {
    return (
      <div className="min-h-screen bg-[#f5f5f0] flex flex-col items-center justify-center p-6 text-black select-none">
        <div className="w-16 h-16 rounded-2xl bg-[#ccff00] border-2 border-black flex items-center justify-center font-mono font-black text-3xl shadow-[4px_4px_0px_0px_#000] mb-4 animate-bounce">
          C
        </div>
        <h1 className="text-xl font-black font-mono tracking-tight uppercase">CLEARCUT</h1>
        <p className="text-xs font-mono font-bold text-black/60 uppercase tracking-wider mt-1">
          P2P LEDGER V2.4
        </p>
        <div className="mt-6 flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-black animate-ping" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#ccff00] border border-black animate-pulse" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#ffd600] border border-black animate-pulse" />
        </div>
      </div>
    );
  }

  // If not authenticated and trying to view a protected route, prevent rendering protected UI
  if (!user && !isPublicRoute) {
    return null;
  }

  return <>{children}</>;
}
