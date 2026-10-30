'use client';

import { Suspense } from 'react';
import { AuthForm } from '@/components/AuthForm';

export default function AuthPage() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 py-8 sm:py-12">
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="w-8 h-8 border-2 border-[#543A2A] border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <AuthForm />
      </Suspense>
    </div>
  );
}
