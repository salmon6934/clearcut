'use client';

// components/AuthForm.tsx
// Stitch Neo-Brutalist Authentication Form

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithOtp, verifyOtp, updateProfile, subscribeAuth, signInWithGoogle } from '@/lib/auth';
import { haptics } from '@/lib/native/haptics';

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '/';

  const [step, setStep] = useState<'email' | 'otp' | 'profile'>('email');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => c - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const finishAuth = () => {
    const pendingCode =
      typeof window !== 'undefined' ? localStorage.getItem('pending_join_code') : null;
    if (pendingCode) {
      localStorage.removeItem('pending_join_code');
      router.replace(`/join?code=${encodeURIComponent(pendingCode)}`);
    } else {
      router.replace(redirectUrl);
    }
  };

  // Check if user is already authenticated
  useEffect(() => {
    return subscribeAuth((state) => {
      if (state.user && step !== 'profile') {
        if (!state.profile?.displayName || state.profile.displayName === 'User') {
          setDisplayName(state.profile?.displayName || state.user.email?.split('@')[0] || '');
          setStep('profile');
        } else {
          finishAuth();
        }
      }
    });
  }, [router, redirectUrl, step]);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    haptics.tap();

    const { session, error } = await signInWithGoogle();
    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message);
      haptics.error();
    } else if (session) {
      haptics.success();
      finishAuth();
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address');
      haptics.warning();
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    haptics.tap();

    const { error } = await signInWithOtp(email.trim());
    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message);
      haptics.error();
    } else {
      haptics.success();
      setStep('otp');
      setCooldown(60);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOtp = otpCode.trim();
    if (!cleanOtp || cleanOtp.length !== 6) {
      setErrorMessage('Please enter the 6-digit OTP code');
      haptics.warning();
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    haptics.tap();

    const { session, error } = await verifyOtp(email.trim(), otpCode.trim());
    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message);
      haptics.error();
    } else if (session) {
      haptics.success();
      const user = session.user;
      const metadata = user.user_metadata || {};
      if (!metadata.display_name) {
        setDisplayName(user.email?.split('@')[0] || '');
        setStep('profile');
      } else {
        finishAuth();
      }
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setErrorMessage('Display name cannot be empty');
      haptics.warning();
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    haptics.tap();

    const { error } = await updateProfile(displayName.trim());
    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message);
      haptics.error();
    } else {
      haptics.success();
      finishAuth();
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto my-auto p-6 sm:p-8 rounded-3xl bg-white border border-[#E5D9CC] shadow-xl relative">
      {/* Brand Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-3 shadow-md overflow-hidden border border-[#E5D9CC]/80 bg-[#FAF6F0]">
          <img src="/icon.png?v=2" alt="Clearcut Logo" className="w-full h-full object-cover" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[#432E22]">Clearcut</h1>
        <p className="text-xs font-semibold text-[#8D7868] mt-1">
          Shared Expenses & Settlements
        </p>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="mb-4 p-3 rounded-2xl bg-[#FCE8E6] border border-[#F5C2C0] text-[#A83232] text-xs font-semibold">
          {errorMessage}
        </div>
      )}

      {/* STEP 1: Enter Email or Google Sign-In */}
      {step === 'email' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-full bg-[#FAF6F0] hover:bg-[#EFE4D6] active:scale-95 disabled:opacity-50 text-[#432E22] font-bold text-xs uppercase tracking-wider transition-all shadow-xs flex items-center justify-center gap-2 border border-[#E5D9CC] cursor-pointer"
          >
            <span>Continue with Google</span>
          </button>

          <div className="relative flex items-center justify-center my-4">
            <div className="border-t border-[#E5D9CC] w-full" />
            <span className="bg-white px-3 text-[11px] font-semibold text-[#8D7868] absolute">
              or with email
            </span>
          </div>

          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-bold text-[#432E22] mb-1.5">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-2xl bg-[#FAF6F0] border border-[#E5D9CC] text-[#432E22] placeholder:text-[#8D7868]/60 focus:outline-none focus:border-[#543A2A] text-sm font-medium transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !email}
              className="w-full py-3.5 px-4 rounded-full bg-[#543A2A] hover:bg-[#432E20] active:scale-95 disabled:opacity-50 disabled:pointer-events-none text-[#FAF6F0] font-bold text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center cursor-pointer"
            >
              {isLoading ? 'Sending code...' : 'Send OTP Code →'}
            </button>
          </form>
        </div>
      )}

      {/* STEP 2: Magic Link / OTP */}
      {step === 'otp' && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div className="text-center p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#E5D9CC] mb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#432E22]">Check Your Email</h2>
            <p className="text-xs text-[#8D7868] mt-1 font-medium">
              Code sent to <span className="font-bold text-[#432E22]">{email}</span>.
            </p>
          </div>

          <div>
            <label htmlFor="otp" className="block text-xs font-bold uppercase tracking-wider text-[#432E22] mb-1.5 text-center">
              Enter OTP Code
            </label>
            <input
              id="otp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              autoFocus
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="w-full px-4 py-3 rounded-2xl bg-[#FAF6F0] border border-[#E5D9CC] text-[#432E22] tracking-[0.3em] text-center text-2xl font-bold focus:outline-none focus:border-[#543A2A] shadow-xs transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || otpCode.length !== 6}
            className="w-full py-3.5 px-4 rounded-full bg-[#543A2A] hover:bg-[#432E20] active:scale-95 disabled:opacity-50 disabled:pointer-events-none text-[#FAF6F0] font-bold text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center cursor-pointer"
          >
            {isLoading ? 'Verifying...' : 'Verify Code →'}
          </button>

          <div className="flex items-center justify-between text-xs font-semibold text-[#8D7868] pt-1">
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setOtpCode('');
                setErrorMessage(null);
              }}
              className="hover:text-[#432E22] underline cursor-pointer"
            >
              Change Email
            </button>

            <button
              type="button"
              disabled={cooldown > 0 || isLoading}
              onClick={handleSendOtp}
              className="text-[#432E22] hover:underline disabled:text-[#8D7868]/40 font-bold cursor-pointer"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend Code'}
            </button>
          </div>
        </form>
      )}

      {/* STEP 3: Profile Onboarding */}
      {step === 'profile' && (
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="text-center mb-2">
            <h2 className="text-base font-bold text-[#432E22]">What should friends call you?</h2>
            <p className="text-xs text-[#8D7868] mt-0.5 font-medium">Your display name for shared expenses</p>
          </div>

          <div>
            <label htmlFor="displayName" className="block text-xs font-bold text-[#432E22] mb-1.5">
              Your Name
            </label>
            <input
              id="displayName"
              type="text"
              required
              autoFocus
              maxLength={60}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Rahul, Sneha, Aditya"
              className="w-full px-4 py-3 rounded-2xl bg-[#FAF6F0] border border-[#E5D9CC] text-[#432E22] placeholder:text-[#8D7868]/60 focus:outline-none focus:border-[#543A2A] text-base font-semibold shadow-xs transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !displayName.trim()}
            className="w-full py-3.5 px-4 rounded-full bg-[#543A2A] hover:bg-[#432E20] active:scale-95 disabled:opacity-50 disabled:pointer-events-none text-[#FAF6F0] font-bold text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center cursor-pointer"
          >
            {isLoading ? 'Saving...' : 'Start Splitting →'}
          </button>
        </form>
      )}
    </div>
  );
}
