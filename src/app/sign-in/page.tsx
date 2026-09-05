'use client';

import React, { useState, useEffect } from 'react';
import { AuthActions } from '../../lib/auth/client';
import { UnprotectedRoute } from '../../components/UnprotectedRoute';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Mail, Lock, AlertCircle, ArrowRight } from 'lucide-react';

export default function SignInPage() {
  return (
    <UnprotectedRoute>
      <SignInForm />
    </UnprotectedRoute>
  );
}

function SignInForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setErrorMsg(decodeURIComponent(errorParam));
    }
    const messageParam = searchParams.get('message');
    if (messageParam) {
      setInfoMsg(decodeURIComponent(messageParam));
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    if (typeof window !== 'undefined' && !navigator.onLine) {
      setErrorMsg('Authentication requires an active network connection. Please check your network and try again.');
      setIsLoading(false);
      return;
    }

    try {
      await AuthActions.signInWithPassword(email, password);
    } catch (err: any) {
      setErrorMsg(err.message);
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    if (typeof window !== 'undefined' && !navigator.onLine) {
      setErrorMsg('Google Sign-In requires an active network connection. Please check your network and try again.');
      setIsLoading(false);
      return;
    }

    try {
      await AuthActions.signInWithGoogle();
    } catch (err: any) {
      setErrorMsg(err.message);
      setIsLoading(false);
    }
  };


  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-slate-950 text-slate-100">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-slate-900 bg-slate-900/50 p-8 shadow-2xl backdrop-blur-xl">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-white bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            Welcome back to Clario
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Sign in to your offline-first freelancer workspace
          </p>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-3 rounded-lg bg-red-950/50 border border-red-900/50 p-3.5 text-sm text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
            <p>{errorMsg}</p>
          </div>
        )}

        {infoMsg && (
          <div className="flex items-center gap-3 rounded-lg bg-indigo-950/50 border border-indigo-900/50 p-3.5 text-sm text-indigo-300">
            <Mail className="h-5 w-5 shrink-0 text-indigo-400" />
            <p>{infoMsg}</p>
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
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-lg border border-slate-800 bg-slate-950/80 py-3 pl-10 pr-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition"
                  placeholder="Password"
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs">
            <Link
              href="/reset-password"
              className="font-medium text-slate-400 hover:text-indigo-400 transition"
            >
              Forgot your password?
            </Link>
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
                  Sign in <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </button>
          </div>
        </form>

        <div className="relative flex py-2 items-center justify-center">
          <div className="flex-grow border-t border-slate-900"></div>
          <span className="flex-shrink mx-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Or
          </span>
          <div className="flex-grow border-t border-slate-900"></div>
        </div>

        <div>
          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="flex w-full justify-center items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-900/50 py-3 px-4 text-sm font-semibold text-white hover:bg-slate-900 transition focus:outline-none disabled:opacity-50"
          >
            {/* Google Logo */}
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.093-5.136 4.093-3.414 0-6.19-2.775-6.19-6.19s2.776-6.19 6.19-6.19c1.472 0 2.82.52 3.882 1.378l3.078-3.078C18.826 2.213 15.711 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.48 0 10.74-4.55 10.74-10.92 0-.67-.06-1.32-.18-1.943h-10.56z" />
            </svg>
            Continue with Google
          </button>
        </div>

        <div className="text-center text-sm mt-6">
          <span className="text-slate-400">Don't have an account? </span>
          <Link
            href="/sign-up"
            className="font-semibold text-indigo-400 hover:text-indigo-300 transition"
          >
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}
