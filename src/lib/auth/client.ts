import { supabase } from '../supabase';

// Utility helper to check network connectivity
function checkOnline(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('You are offline. Please connect to the internet to perform this action.');
  }
}

// Map technical database errors to human-friendly error messages
function getFriendlyError(err: any): Error {
  const message = err?.message || '';
  console.error('Supabase Auth error:', err);

  if (message.includes('Invalid login credentials') || message.includes('Email not confirmed')) {
    return new Error("That email or password isn't right.");
  }
  if (message.includes('User already registered') || message.includes('already exists')) {
    return new Error('This email address is already registered.');
  }
  if (message.includes('Password should be at least')) {
    return new Error('Password must be at least 6 characters long.');
  }
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return new Error('Too many attempts. Please wait a moment and try again.');
  }

  return new Error(message || 'An unexpected error occurred. Please try again.');
}

const getRedirectUrl = (path: string): string => {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  return `${origin}${path}`;
};

export const AuthActions = {
  async signUpWithPassword(email: string, password: string): Promise<void> {
    checkOnline();
    if (!email || !email.trim()) {
      throw new Error('Email address is required.');
    }
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getRedirectUrl('/auth/callback')
      }
    });

    if (error) {
      throw getFriendlyError(error);
    }
  },

  async signInWithPassword(email: string, password: string): Promise<void> {
    checkOnline();
    if (!email || !email.trim()) {
      throw new Error('Email address is required.');
    }
    if (!password) {
      throw new Error('Password is required.');
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      throw getFriendlyError(error);
    }
  },

  async signInWithGoogle(): Promise<void> {
    checkOnline();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getRedirectUrl('/auth/callback'),
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });

    if (error) {
      throw getFriendlyError(error);
    }
  },

  async signOut(): Promise<void> {
    // Note: Sign out should ideally work even if offline to clear local state.
    // However, if online fails, we still want to clean up our local session.
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('SignOut failed remotely, clearing local state anyway', err);
    }
  },

  async resetPassword(email: string): Promise<void> {
    checkOnline();
    if (!email || !email.trim()) {
      throw new Error('Email address is required.');
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getRedirectUrl('/auth/callback?next=/settings')
    });

    if (error) {
      throw getFriendlyError(error);
    }
  }
};

/**
 * Synchronously retrieves cached session from localStorage (sb-*-auth-token).
 * Useful for offline fast-path boot without network timeouts.
 */
export function getCachedLocalSession(): any {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          const session = parsed?.currentSession || parsed;
          if (session && (session.user || session.access_token)) {
            return session;
          }
        }
      }
    }
  } catch (e) {
    console.warn('Failed to parse cached session from localStorage:', e);
  }
  return null;
}

/**
 * Retrieve the current authenticated user's ID.
 */
export async function getAuthUserId(): Promise<string | null> {
  const session = await getAuthSession();
  return session?.user?.id || null;
}

/**
 * Retrieve the current active session.
 */
export async function getAuthSession() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return session;
  } catch (err) {
    console.warn('supabase.auth.getSession error:', err);
  }

  // Fallback to cached local session if offline
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return getCachedLocalSession();
  }
  return null;
}

/**
 * Set up a listener for auth state changes.
 */
export function onAuthStateChange(callback: (event: any, session: any) => void) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback);
  return subscription;
}

/**
 * Triggers sign out on the native Supabase client.
 */
export async function supabaseSignOut(): Promise<void> {
  await supabase.auth.signOut();
}
