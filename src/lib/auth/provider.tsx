'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../supabase';
import { AuthActions, getCachedLocalSession } from './client';
import { Session, User } from '@supabase/supabase-js';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(() => {
    return getCachedLocalSession();
  });
  const [user, setUser] = useState<User | null>(() => {
    const cached = getCachedLocalSession();
    return cached?.user ?? null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    // If a valid cached session already exists in localStorage, do not start in a loading state
    const cached = getCachedLocalSession();
    return !cached;
  });
  const [error, setError] = useState<Error | null>(null);
  const currentSessionRef = useRef<Session | null>(session);

  useEffect(() => {
    // Check initial session from local cache (synchronous or async)
    const checkInitialSession = async () => {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

      // 1. Offline fast-path: immediately restore cached session from localStorage without awaiting network timeouts
      if (isOffline) {
        const cached = getCachedLocalSession();
        if (cached) {
          currentSessionRef.current = cached;
          setSession(cached);
          setUser(cached.user);
          setIsLoading(false);
          return;
        }
      }

      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const initialSession = data?.session;
        if (initialSession) {
          currentSessionRef.current = initialSession;
          setSession(initialSession);
          setUser(initialSession.user);
        } else if (typeof navigator !== 'undefined' && !navigator.onLine) {
          // If offline and getSession returns null, fallback to cached localStorage session
          const cached = currentSessionRef.current || getCachedLocalSession();
          if (cached) {
            currentSessionRef.current = cached;
            setSession(cached);
            setUser(cached.user);
          }
        }
      } catch (err: any) {
        console.error('Failed to get initial session:', err);
        // When supabase.auth.getSession() fails due to a network error or offline status,
        // retain the cached session and user rather than setting them to null.
        const cached = currentSessionRef.current || getCachedLocalSession();
        if (cached) {
          currentSessionRef.current = cached;
          setSession(cached);
          setUser(cached.user);
        } else if (typeof navigator !== 'undefined' && navigator.onLine) {
          setError(err);
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkInitialSession();

    // Set up auth state change subscription
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      console.log('Auth state changed event:', event);

      // In onAuthStateChange, ignore TOKEN_REFRESHED events with null sessions if !navigator.onLine
      if (event === 'TOKEN_REFRESHED') {
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        if (!currentSession && isOffline) {
          console.warn('Ignoring TOKEN_REFRESHED with null session while offline to preserve local session');
          return;
        }

        if (currentSession) {
          const tokenChanged = currentSessionRef.current?.access_token !== currentSession?.access_token;
          const userChanged = currentSessionRef.current?.user?.id !== currentSession?.user?.id;

          if (tokenChanged || userChanged) {
            currentSessionRef.current = currentSession;
            setSession(currentSession);
            setUser(currentSession.user ?? null);
          }
        }
        setIsLoading(false);
      } else if (event === 'SIGNED_IN') {
        const tokenChanged = currentSessionRef.current?.access_token !== currentSession?.access_token;
        const userChanged = currentSessionRef.current?.user?.id !== currentSession?.user?.id;

        if (tokenChanged || userChanged) {
          currentSessionRef.current = currentSession;
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
        }
        setIsLoading(false);
      } else if (event === 'SIGNED_OUT') {
        currentSessionRef.current = null;
        setSession(null);
        setUser(null);
        setIsLoading(false);
      } else if (event === 'USER_UPDATED') {
        currentSessionRef.current = currentSession;
        setUser(currentSession?.user ?? null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    setIsLoading(true);
    try {
      await AuthActions.signOut();
    } catch (err: any) {
      console.error('Sign out failed:', err);
    } finally {
      setSession(null);
      setUser(null);
      setIsLoading(false);
    }
  }, []);

  const contextValue = useMemo(() => ({
    session,
    user,
    isLoading,
    error,
    signOut: handleSignOut
  }), [session, user, isLoading, error, handleSignOut]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
