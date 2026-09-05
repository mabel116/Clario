'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../supabase';
import { AuthActions } from './client';
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
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const currentSessionRef = useRef<Session | null>(null);

  useEffect(() => {
    // Check initial session from local cache (synchronous or async)
    const checkInitialSession = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (initialSession) {
          currentSessionRef.current = initialSession;
          setSession(initialSession);
          setUser(initialSession.user);
        }
      } catch (err: any) {
        console.error('Failed to get initial session:', err);
        // Do not sign out/clear session on transient network error during boot
        if (typeof navigator !== 'undefined' && navigator.onLine) {
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

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
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
