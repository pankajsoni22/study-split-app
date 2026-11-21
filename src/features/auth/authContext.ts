import { createContext } from 'react';
import type { Profile } from '../../domain/types.ts';
import type { AuthSession } from '../../data/ports.ts';

/**
 * loading   – checking the saved session
 * signedOut – reading as a visitor
 * signingIn – Google returned a token; exchanging it for a session
 * signedIn  – session + profile loaded
 */
export type AuthStatus = 'loading' | 'signedOut' | 'signingIn' | 'signedIn';

export interface AuthContextValue {
  status: AuthStatus;
  session: AuthSession | null;
  profile: Profile | null;
  gsiReady: boolean;
  error: string;
  /** Shows Google One Tap (used on the sign-in page only — readers aren't nagged). */
  promptOneTap: () => void;
  setProfile: (profile: Profile) => void;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
