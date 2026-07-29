'use client';

import React, { useEffect } from 'react';
import { useAuth } from '../lib/auth/provider';
import { useRouter } from 'next/navigation';

export function UnprotectedRoute({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && session) {
      router.replace('/');
    }
  }, [session, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="relative flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-800 border-t-indigo-500"></div>
          <span className="text-sm font-medium text-slate-400 animate-pulse">Redirecting...</span>
        </div>
      </div>
    );
  }

  if (session) {
    return null; // Will redirect in useEffect
  }

  return <>{children}</>;
}
