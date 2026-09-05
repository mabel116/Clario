'use client';

import React, { useState } from 'react';
import { AuthActions } from '../../lib/auth/client';
import { UnprotectedRoute } from '../../components/UnprotectedRoute';
import Link from 'next/link';
import { Mail, AlertCircle, ArrowLeft, CheckCircle2, ArrowRight } from 'lucide-react';

export default function ResetPasswordPage() {
  return (
    <UnprotectedRoute>
      <ResetPasswordForm />
    </UnprotectedRoute>
  );
}

function ResetPasswordForm() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    if (typeof window !== 'undefined' && !navigator.onLine) {
      setErrorMsg('Password reset requests require an active network connection. Please check your network and try again.');
      setIsLoading(false);
      return;
    }

    try {
      await AuthActions.resetPassword(email);
      setSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.message);
      setIsLoading(false);
    }
  };


  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-slate-950 text-slate-100">
        <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-900 bg-slate-900/50 p-8 text-center shadow-2xl backdrop-blur-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-950/50 border border-emerald-800/30 text-emerald-400">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-extrabold text-white">Verification Link Sent</h2>
          <p className="text-sm text-slate-400 leading-relaxed font-medium">
            We sent a password reset instructions link to <strong className="text-indigo-300">{email}</strong>.
            Please verify it to update your password.
          </p>
          <div className="pt-2">
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-1.5 font-semibold text-indigo-400 hover:text-indigo-300 transition text-sm"
            >
              Back to sign in <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-slate-950 text-slate-100">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-slate-900 bg-slate-900/50 p-8 shadow-2xl backdrop-blur-xl">
        <div>
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-300 transition"
          >
            <ArrowLeft className="h-4.5 w-4.5" /> Back to sign in
          </Link>
          <div className="text-center mt-4">
            <h2 className="text-3xl font-extrabold tracking-tight text-white bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              Reset your password
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              We'll send you instructions to choose a new password
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="flex items-center gap-3 rounded-lg bg-red-950/50 border border-red-900/50 p-3.5 text-sm text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
            <p>{errorMsg}</p>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
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
            <button
              type="submit"
              disabled={isLoading}
              className="group relative flex w-full justify-center rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950 transition disabled:opacity-50"
            >
              {isLoading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-white"></div>
              ) : (
                <span className="flex items-center gap-1">
                  Send reset email <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
