import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { config } from '../../config.ts';
import type { Profile } from '../../domain/types.ts';
import { errorMessage } from '../../data/errors.ts';
import type { AuthSession } from '../../data/ports.ts';
import { getServices } from '../../data/services.ts';
import { invalidate } from '../../data/useQuery.ts';
import { AuthContext, type AuthContextValue, type AuthStatus } from './authContext.ts';
import { createNonce, getGsi, waitForGsi } from './gsi.ts';

// Google Identity Services must be initialized once per page, even under StrictMode's double effects.
let gsiInitialized = false;
let onCredential: (response: google.accounts.id.CredentialResponse) => void = () => {};
let rawNonce = '';

/**
 * Sign-in flow (same shape as soni-siblings-app, with Supabase as the session store):
 * 1. Supabase restores a saved session from localStorage → the profile is loaded → signed in.
 * 2. Otherwise Google Identity Services (button or One Tap) returns a Google ID token, which
 *    Supabase verifies (with a nonce) and swaps for a long-lived, auto-refreshing session.
 * 3. A sign-out in one tab signs out every tab (Supabase broadcasts it through storage).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const services = getServices();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [gsiReady, setGsiReady] = useState(false);
  const [error, setError] = useState('');
  const userRef = useRef<string | null>(null);

  // Session changes (initial restore, sign-in, sign-out, other tabs) drive everything.
  useEffect(() => services.auth.onChange(next => {
    setSession(next);
    if (!next) {
      userRef.current = null;
      setProfile(null);
      setStatus('signedOut');
      return;
    }
    if (userRef.current === next.userId) return;     // token refresh: nothing to reload
    userRef.current = next.userId;
    services.profiles.getMine().then(
      p => {
        if (userRef.current !== next.userId) return;
        setProfile(p);
        setStatus('signedIn');
        setError('');
      },
      (err: unknown) => {
        setError(`Signed in, but your profile could not be loaded: ${errorMessage(err)}`);
        setStatus('signedIn');
      }
    );
  }), [services]);

  const handleCredential = useCallback(async ({ credential }: google.accounts.id.CredentialResponse) => {
    setError('');
    setStatus('signingIn');
    try {
      await services.auth.signInWithGoogleIdToken(credential, rawNonce);
      invalidate('');                                  // cached lists may depend on who is signed in
      // onChange takes it from here (loads the profile).
    } catch (err) {
      setError(`Sign-in failed: ${errorMessage(err)}`);
      setStatus('signedOut');
    }
  }, [services]);

  useEffect(() => {
    onCredential = response => { void handleCredential(response); };
  }, [handleCredential]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([waitForGsi(), createNonce()])
      .then(([gsi, nonce]) => {
        if (cancelled) return;
        if (!gsiInitialized) {
          rawNonce = nonce.raw;
          gsi.initialize({
            client_id: config.googleClientId,
            nonce: nonce.hashed,
            auto_select: true,               // silent sign-in for returning users
            cancel_on_tap_outside: true,
            use_fedcm_for_prompt: true,
            callback: response => onCredential(response)
          });
          gsiInitialized = true;
        }
        setGsiReady(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Google sign-in did not load';
        setError(`${message}. Disable blockers for accounts.google.com or try another browser.`);
      });
    return () => { cancelled = true; };
  }, []);

  const promptOneTap = useCallback(() => {
    if (gsiReady && status === 'signedOut') getGsi()?.prompt();
  }, [gsiReady, status]);

  const signOut = useCallback(async () => {
    getGsi()?.disableAutoSelect();
    try { await services.auth.signOut(); } finally { invalidate(''); }
  }, [services]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, profile, gsiReady, error, promptOneTap, setProfile, signOut }),
    [status, session, profile, gsiReady, error, promptOneTap, signOut]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
