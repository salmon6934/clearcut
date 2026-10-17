'use client';

import React, { useRef, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const TAB_INDEXES: Record<string, number> = {
  '/': 0,
  '/friends': 1,
  '/activity': 2,
  '/settings': 3,
};

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const prevPathRef = useRef<string>(pathname);
  const [animationClass, setAnimationClass] = useState<string>('');

  useEffect(() => {
    const prev = prevPathRef.current;
    if (prev !== pathname) {
      const prevIdx = TAB_INDEXES[prev];
      const currIdx = TAB_INDEXES[pathname];

      if (prevIdx !== undefined && currIdx !== undefined) {
        setAnimationClass(currIdx >= prevIdx ? 'animate-page-slide-right' : 'animate-page-slide-left');
      } else if (pathname.startsWith('/group') || pathname.startsWith('/join')) {
        setAnimationClass('animate-page-slide-right');
      } else {
        setAnimationClass('animate-page-fade');
      }
      prevPathRef.current = pathname;
    }
  }, [pathname]);

  return (
    <div key={pathname} className={`w-full min-h-screen ${animationClass}`}>
      {children}
    </div>
  );
}
