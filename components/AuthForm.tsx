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
    if (!cleanOtp || cleanOtp.length < 6 || cleanOtp.length > 8) {
      setErrorMessage('Please enter the OTP code (6-8 digits)');
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
    <div className="w-full max-w-sm mx-auto my-auto p-6 sm:p-8 rounded-2xl bg-white border-2 border-black shadow-[5px_5px_0px_0px_#000] relative">
      {/* Brand Header matching Stitch */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-[#ccff00] border-2 border-black mb-3 shadow-[2px_2px_0px_0px_#000]">
          <span className="text-black font-black text-2xl font-mono leading-none">C</span>
        </div>
        <h1 className="text-2xl font-black tracking-tight text-black uppercase font-mono">CLEARCUT</h1>
        <p className="text-xs font-mono font-bold text-black/60 mt-0.5 uppercase tracking-wider">
          P2P LEDGER V2.4 • ZERO-FLOAT
        </p>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="mb-4 p-3 rounded-xl bg-[#ff8a80] border-2 border-black text-black text-xs font-mono font-bold shadow-[2px_2px_0px_0px_#000]">
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
            className="w-full py-3.5 px-4 rounded-xl bg-white hover:bg-[#ffd600] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 text-black font-black font-mono text-xs uppercase transition-all shadow-[3px_3px_0px_0px_#000] flex items-center justify-center gap-3 border-2 border-black cursor-pointer"
          >
            <span>CONTINUE WITH GOOGLE</span>
          </button>

          <div className="relative flex items-center justify-center my-4">
            <div className="border-t-2 border-black w-full" />
            <span className="bg-white px-2 text-[10px] font-mono font-black uppercase text-black/60 tracking-wider absolute">
              OR WITH EMAIL
            </span>
          </div>

          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-mono font-black uppercase tracking-wider text-black mb-1.5">
                EMAIL ADDRESS
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl bg-white border-2 border-black text-black placeholder:text-black/40 focus:outline-none focus:bg-[#faffea] text-sm font-semibold shadow-[2px_2px_0px_0px_#000]"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !email}
              className="w-full py-3.5 px-4 rounded-xl bg-[#ccff00] hover:bg-[#bbf000] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none text-black font-black font-mono text-xs uppercase transition-all border-2 border-black shadow-[3px_3px_0px_0px_#000] flex items-center justify-center cursor-pointer"
            >
              {isLoading ? 'SENDING CODE...' : 'SEND OTP CODE →'}
            </button>
          </form>
        </div>
      )}

      {/* STEP 2: Magic Link / OTP */}
      {step === 'otp' && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div className="text-center p-3.5 rounded-xl bg-[#f0f0ea] border-2 border-black mb-2">
            <h2 className="text-xs font-mono font-black uppercase text-black">CHECK YOUR EMAIL</h2>
            <p className="text-xs text-black/60 mt-1 font-mono">
              Code sent to <span className="font-bold text-black">{email}</span>.
            </p>
          </div>

          <div>
            <label htmlFor="otp" className="block text-xs font-mono font-black uppercase tracking-wider text-black mb-1.5 text-center">
              ENTER OTP CODE
            </label>
            <input
              id="otp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              autoComplete="one-time-code"
              autoFocus
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter code"
              className="w-full px-4 py-3 rounded-xl bg-white border-2 border-black text-black tracking-[0.25em] text-center text-xl font-mono font-black focus:outline-none focus:bg-[#faffea] shadow-[2px_2px_0px_0px_#000]"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || otpCode.length < 6 || otpCode.length > 8}
            className="w-full py-3.5 px-4 rounded-xl bg-[#ccff00] hover:bg-[#bbf000] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none text-black font-black font-mono text-xs uppercase transition-all border-2 border-black shadow-[3px_3px_0px_0px_#000] flex items-center justify-center cursor-pointer"
          >
            {isLoading ? 'VERIFYING...' : 'VERIFY CODE →'}
          </button>

          <div className="flex items-center justify-between text-xs font-mono font-bold text-black/60 pt-1">
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setOtpCode('');
                setErrorMessage(null);
              }}
              className="hover:text-black underline"
            >
              Change Email
            </button>

            <button
              type="button"
              disabled={cooldown > 0 || isLoading}
              onClick={handleSendOtp}
              className="text-black hover:underline disabled:text-black/40 font-bold"
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
            <h2 className="text-base font-black font-mono uppercase text-black">WHAT SHOULD FRIENDS CALL YOU?</h2>
            <p className="text-xs text-black/60 mt-0.5 font-mono">Your display name for ledger expenses</p>
          </div>

          <div>
            <label htmlFor="displayName" className="block text-xs font-mono font-black uppercase tracking-wider text-black mb-1.5">
              YOUR NAME
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
              className="w-full px-4 py-3 rounded-xl bg-white border-2 border-black text-black placeholder:text-black/40 focus:outline-none focus:bg-[#faffea] text-base font-bold shadow-[2px_2px_0px_0px_#000]"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !displayName.trim()}
            className="w-full py-3.5 px-4 rounded-xl bg-[#ccff00] hover:bg-[#bbf000] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none text-black font-black font-mono text-xs uppercase transition-all border-2 border-black shadow-[3px_3px_0px_0px_#000] flex items-center justify-center cursor-pointer"
          >
            {isLoading ? 'SAVING...' : 'START SPLITTING →'}
          </button>
        </form>
      )}
    </div>
  );
}
