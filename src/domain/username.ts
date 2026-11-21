// Username rules. Must match public.username_is_valid() in supabase/migrations (keep in sync).

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

export type UsernameProblem = 'empty' | 'too-short' | 'too-long' | 'start' | 'chars' | 'double-hyphen' | 'end-hyphen';

/** First rule the name breaks, or null when the format is valid. Availability is checked by the server. */
export function usernameProblem(raw: string): UsernameProblem | null {
  const name = raw.trim().toLowerCase();
  if (!name) return 'empty';
  if (!/^[a-z]/.test(name)) return 'start';
  if (/[^a-z0-9-]/.test(name)) return 'chars';
  if (name.length < USERNAME_MIN) return 'too-short';
  if (name.length > USERNAME_MAX) return 'too-long';
  if (name.includes('--')) return 'double-hyphen';
  if (name.endsWith('-')) return 'end-hyphen';
  return null;
}

export const usernameProblemText: Record<UsernameProblem, string> = {
  empty: 'Pick a username.',
  'too-short': `Use at least ${USERNAME_MIN} characters.`,
  'too-long': `Use at most ${USERNAME_MAX} characters.`,
  start: 'Start with a letter.',
  chars: 'Use only lowercase letters, numbers and hyphens.',
  'double-hyphen': 'Avoid two hyphens in a row.',
  'end-hyphen': "Don't end with a hyphen."
};

/** Turns typed text into the canonical form while typing: lowercase, spaces/underscores → hyphens. */
export function normalizeUsernameInput(raw: string): string {
  return raw.toLowerCase().replace(/[\s_.]+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, USERNAME_MAX);
}
