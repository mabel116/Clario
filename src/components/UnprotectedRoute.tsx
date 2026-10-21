'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth/provider';
import { useRouter } from 'next/navigation';

export function UnprotectedRoute({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [showIndicator, setShowIndicator] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const timer = setTimeout(() => setShowIndicator(true), 200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isMounted && !isLoading && session) {
      router.replace('/');
    }
  }, [isMounted, session, isLoading, router]);

  if (!isMounted || isLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#09090b] flex flex-col items-center justify-center gap-3">
        {showIndicator && (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-500" />
            <p className="text-[13px] text-gray-500 dark:text-zinc-400 font-medium">Loading Clario...</p>
          </>
        )}
      </div>
    );
  }

  if (session) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#09090b] flex flex-col items-center justify-center gap-3">
        {showIndicator && (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-500" />
            <p className="text-[13px] text-gray-500 dark:text-zinc-400 font-medium">Redirecting...</p>
          </>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
