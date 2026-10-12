'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithOtp, verifyOtp, updateProfile, getAuthState, subscribeAuth, signInWithGoogle } from '@/lib/auth';
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

  // Check if user is already authenticated
  useEffect(() => {
    return subscribeAuth((state) => {
      if (state.user && step !== 'profile') {
        if (!state.profile?.displayName || state.profile.displayName === 'User') {
          setDisplayName(state.profile?.displayName || state.user.email?.split('@')[0] || '');
          setStep('profile');
        } else {
          router.replace(redirectUrl);
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
      router.replace(redirectUrl);
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

    const { error } = await signInWithOtp(email);
    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message);
      haptics.error();
    } else {
      setStep('otp');
      setCooldown(30);
      haptics.success();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = otpCode.trim();
    if (cleanCode.length !== 6) {
      setErrorMessage('Please enter the 6-digit code');
      haptics.warning();
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    haptics.tap();

    const { session, error } = await verifyOtp(email, cleanCode);
    setIsLoading(false);

    if (error || !session) {
      setErrorMessage(error?.message || 'Invalid or expired code (AUTH_INVALID_CODE)');
      haptics.error();
    } else {
      haptics.success();
      const state = getAuthState();
      if (!state.profile?.displayName || state.profile.displayName === 'User') {
        setDisplayName(session.user.email?.split('@')[0] || '');
        setStep('profile');
      } else {
        router.replace(redirectUrl);
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
      router.replace(redirectUrl);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto p-6 flex flex-col justify-center min-h-[80vh]">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-4 shadow-lg shadow-emerald-500/5">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Clearcut</h1>
        <p className="text-sm text-slate-400 mt-1">Split expenses effortlessly with friends</p>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="mb-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-start space-x-2.5 animate-in fade-in slide-in-from-top-1">
          <svg className="w-5 h-5 flex-shrink-0 text-rose-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="leading-tight">{errorMessage}</span>
        </div>
      )}

      {/* STEP 1: Enter Email or Google Sign-In */}
      {step === 'email' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-slate-100 active:scale-95 disabled:opacity-50 text-slate-900 font-semibold text-sm transition-all shadow-md flex items-center justify-center gap-3 border border-slate-200 cursor-pointer"
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="relative flex items-center justify-center my-4">
            <div className="border-t border-slate-800 w-full" />
            <span className="bg-slate-950 px-3 text-[11px] font-semibold uppercase text-slate-500 tracking-wider absolute">
              or with email
            </span>
          </div>

          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
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
                className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-base"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !email}
              className="w-full py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-50 disabled:pointer-events-none text-slate-950 font-semibold text-base transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center"
            >
              {isLoading ? (
                <span className="inline-block w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                'Send 6-digit Code'
              )}
            </button>
          </form>
        </div>
      )}

      {/* STEP 2: Magic Link / OTP */}
      {step === 'otp' && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div className="text-center p-4 rounded-xl bg-slate-900/60 border border-slate-800 mb-2">
            <div className="inline-flex p-2.5 rounded-full bg-emerald-500/10 text-emerald-400 mb-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-white">Check your email</h2>
            <p className="text-xs text-slate-400 mt-1">
              We sent a login link to <span className="text-emerald-400 font-medium">{email}</span>. Click the link to log in directly, or enter your code below:
            </p>
          </div>

          <div>
            <label htmlFor="otp" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 text-center">
              Verification Code (if provided)
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
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-white tracking-[0.5em] text-center text-2xl font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || otpCode.length !== 6}
            className="w-full py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-50 disabled:pointer-events-none text-slate-950 font-semibold text-base transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center"
          >
            {isLoading ? (
              <span className="inline-block w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              'Verify Code'
            )}
          </button>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setOtpCode('');
                setErrorMessage(null);
              }}
              className="hover:text-slate-200 transition-colors"
            >
              Change Email
            </button>

            <button
              type="button"
              disabled={cooldown > 0 || isLoading}
              onClick={handleSendOtp}
              className="text-emerald-400 hover:text-emerald-300 disabled:text-slate-600 transition-colors font-medium"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend Code'}
            </button>
          </div>
        </form>
      )}

      {/* STEP 3: Profile Onboarding (First launch) */}
      {step === 'profile' && (
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="text-center mb-2">
            <h2 className="text-lg font-semibold text-white">What should friends call you?</h2>
            <p className="text-xs text-slate-400 mt-0.5">Your display name for expenses and groups</p>
          </div>

          <div>
            <label htmlFor="displayName" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
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
              placeholder="e.g. Alex"
              className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-base"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !displayName.trim()}
            className="w-full py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-50 disabled:pointer-events-none text-slate-950 font-semibold text-base transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center"
          >
            {isLoading ? (
              <span className="inline-block w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              'Start Splitting'
            )}
          </button>
        </form>
      )}
    </div>
  );
}
