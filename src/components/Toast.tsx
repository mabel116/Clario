'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CheckCircle2, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
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

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Floating toast viewport */}
      <div
        className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
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
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      className="pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] shadow-none select-none transition-all duration-200"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {toast.type === 'info' ? (
          <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" strokeWidth={2} />
        ) : (
          <CheckCircle2
            className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            strokeWidth={2}
          />
        )}
        <span className="text-[13px] leading-tight font-medium text-gray-900 dark:text-white truncate">
          {toast.message}
        </span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 p-0.5 rounded transition-colors shrink-0"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}
