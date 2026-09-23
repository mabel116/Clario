'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth/provider';
import { useRouter } from 'next/navigation';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShowSpinner(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowSpinner(true);
    }, 150);
    return () => clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    // Only redirect when loading has completely settled and no authenticated user exists.
    // This prevents transient offline token validation states from triggering router.replace('/sign-in').
    if (!isLoading && !user) {
      router.replace('/sign-in');
    }
  }, [user, isLoading, router]);

  if (isLoading && !showSpinner) {
    return <div className="min-h-screen bg-slate-950" />;
  }

  if (isLoading && showSpinner) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="relative flex flex-col items-center gap-4 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <p className="text-sm font-medium">Checking credentials...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect in useEffect
  }

  return <>{children}</>;
}
