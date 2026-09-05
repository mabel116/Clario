'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, RotateCcw, RefreshCw } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console for development troubleshooting
    console.error('Unhandled app-level error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 p-6 text-center">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-900 bg-slate-900/50 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-950/50 border border-red-900/30 text-red-400">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold text-white">Something went wrong</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            An unexpected error occurred in the workspace. Your local offline database is safe.
          </p>
        </div>

        {error.message && (
          <div className="rounded-lg bg-slate-950/60 border border-slate-900 p-3 text-xs text-slate-500 font-mono break-all max-h-24 overflow-y-auto">
            {error.message}
          </div>
        )}

        <div className="flex flex-col gap-3 pt-2">
          <button
            onClick={() => reset()}
            className="inline-flex justify-center items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 transition shadow-lg shadow-indigo-600/20 cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" /> Try Again / Recover
          </button>
          
          <button
            onClick={() => window.location.reload()}
            className="inline-flex justify-center items-center gap-1.5 rounded-lg bg-slate-900 border border-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" /> Reload Entire App
          </button>
        </div>
      </div>
    </div>
  );
}
