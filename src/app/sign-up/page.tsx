'use client';

import React, { useState } from 'react';
import { AuthActions } from '../../lib/auth/client';
import { UnprotectedRoute } from '../../components/UnprotectedRoute';
import Link from 'next/link';
import { Mail, Lock, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function SignUpPage() {
  return (
    <UnprotectedRoute>
      <SignUpForm />
    </UnprotectedRoute>
  );
}

function SignUpForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    if (typeof window !== 'undefined' && !navigator.onLine) {
      setErrorMsg('Account registration requires an active network connection. Please check your network and try again.');
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      setIsLoading(false);
      return;
    }

    try {
      await AuthActions.signUpWithPassword(email, password);
      setSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.message);
      setIsLoading(false);
    }
  };


  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-slate-950 text-slate-100">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-900 bg-slate-900/50 p-8 text-center shadow-2xl backdrop-blur-xl animate-fade-in">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-950/50 border border-emerald-800/30 text-emerald-400">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-extrabold text-white">Check your email</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            We sent a verification link to <strong className="text-indigo-300">{email}</strong>.<br />
            Please click the link to confirm your account and log in.
          </p>
          <div className="pt-2">
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-1.5 font-semibold text-indigo-400 hover:text-indigo-300 transition text-sm"
            >
              Go to sign in <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-slate-950 text-slate-100">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-slate-900 bg-slate-900/50 p-8 shadow-2xl backdrop-blur-xl">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-white bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            Create your account
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Join Clario to track your freelance finances
          </p>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-3 rounded-lg bg-red-950/50 border border-red-900/50 p-3.5 text-sm text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
            <p>{errorMsg}</p>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-lg border border-slate-800 bg-slate-950/80 py-3 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition"
                  placeholder="Email address"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-lg border border-slate-800 bg-slate-950/80 py-3 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition"
                  placeholder="Password (min 6 characters)"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirm-password" className="sr-only">
                Confirm Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full rounded-lg border border-slate-800 bg-slate-950/80 py-3 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition"
                  placeholder="Confirm password"
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative flex w-full justify-center rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950 transition disabled:opacity-50"
            >
              {isLoading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-white"></div>
              ) : (
                <span className="flex items-center gap-1">
                  Create account <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </button>
          </div>
        </form>

        <div className="text-center text-sm mt-6">
          <span className="text-slate-400">Already have an account? </span>
          <Link
            href="/sign-in"
            className="font-semibold text-indigo-400 hover:text-indigo-300 transition"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
