'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle2, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  description?: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    // Graceful no-op fallback when rendered outside ToastProvider (e.g. isolated unit tests)
    return {
      showToast: () => {},
    };
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'success', description?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setToasts((prev) => [...prev, { id, message, type, description }]);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Top-Center Fixed Container */}
      <div
        className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2.5 w-full pointer-events-none px-4"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: () => void;
}) {
  const [isPaused, setIsPaused] = useState(false);
  const remainingRef = useRef(4500);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (isPaused) return;

    startTimeRef.current = Date.now();
    const timer = setTimeout(() => {
      onDismiss();
    }, remainingRef.current);

    return () => {
      clearTimeout(timer);
      const elapsed = Date.now() - startTimeRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    };
  }, [isPaused, onDismiss]);

  const handleMouseEnter = () => setIsPaused(true);
  const handleMouseLeave = () => setIsPaused(false);

  return (
    <div
      role="status"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="pointer-events-auto w-fit max-w-[calc(100vw-2rem)] sm:max-w-md flex items-center gap-3 px-4 py-3 rounded-2xl bg-white dark:bg-[#18181b] border border-gray-200 dark:border-[#27272a] shadow-lg transition-all duration-200 animate-in fade-in slide-in-from-top-3"
    >
      {/* Left Status Pill Badge */}
      {toast.type === 'info' ? (
        <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 border border-blue-200/60 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/25 flex items-center justify-center shrink-0">
          <Info className="h-4 w-4" strokeWidth={2} />
        </div>
      ) : (
        <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200/60 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/25 flex items-center justify-center shrink-0">
          <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
        </div>
      )}

      {/* Center Typography (Single-line intentional) */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] leading-[18px] font-semibold text-gray-900 dark:text-white">
          {toast.message}
        </p>
        {toast.description && (
          <p className="text-[11px] leading-tight font-normal text-gray-500 dark:text-zinc-400 mt-0.5">
            {toast.description}
          </p>
        )}
      </div>

      {/* Right Close Button */}
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 p-1 -mr-1 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-zinc-200 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}
