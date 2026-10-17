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

  // If loading auth state and on a protected route, show a skeleton layout matching the groups page
  if (isLoading && !isPublicRoute) {
    return (
      <div className="min-h-screen bg-transparent text-[#432E22] flex flex-col justify-between pb-28 animate-pulse select-none">
        <div className="max-w-xl mx-auto w-full p-4 sm:p-5 space-y-5">
          {/* Top Header Bar skeleton */}
          <header className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#543A2A]/20" />
              <div className="h-7 w-24 bg-[#543A2A]/20 rounded-xl" />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-20 h-8 rounded-full bg-[#EFE4D6]" />
              <div className="w-10 h-10 rounded-full bg-[#543A2A]/20" />
            </div>
          </header>

          {/* Top Balance Summary Card skeleton */}
          <div className="bg-white/90 rounded-3xl border border-[#E5D9CC] p-5 shadow-sm space-y-3">
            <div className="h-4 w-32 bg-[#EFE4D6] rounded-md mx-auto" />
            <div className="h-8 w-44 bg-[#EFE4D6] rounded-xl mx-auto" />
          </div>

          {/* Groups Section Header skeleton */}
          <div className="flex items-center justify-between pt-2">
            <div className="h-5 w-20 bg-[#543A2A]/20 rounded-md" />
            <div className="h-4 w-14 bg-[#EFE4D6] rounded-md" />
          </div>

          {/* Several Group Card boxes */}
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-white/90 rounded-3xl border border-[#E5D9CC] p-4 shadow-sm flex items-center justify-between"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-[#FAF6F0] border border-[#E5D9CC] flex items-center justify-center">
                    <div className="w-6 h-6 rounded-lg bg-[#EFE4D6]" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 w-32 bg-[#543A2A]/20 rounded-md" />
                    <div className="h-3 w-20 bg-[#EFE4D6] rounded-md" />
                  </div>
                </div>
                <div className="text-right space-y-1.5">
                  <div className="h-4 w-16 bg-[#EFE4D6] rounded-md ml-auto" />
                  <div className="h-3 w-10 bg-[#EFE4D6] rounded-md ml-auto" />
                </div>
              </div>
            ))}
          </div>
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
