// Public values from .env.local / GitHub repository variables (VITE_ prefix).
// None are secret: the database enforces access with Row-Level Security.
export const config = {
  appName: import.meta.env.VITE_APP_NAME ?? 'Study Split',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
} as const;

/**
 * Which backend the dev server talks to (docs/04-local-development.md). Both flags are false in production builds,
 * so everything behind them is removed from the bundle.
 */
const isLocalUrl = /^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(config.supabaseUrl);
export const devBackend: 'local' | 'hosted' | null = import.meta.env.DEV ? (isLocalUrl ? 'local' : 'hosted') : null;
/** Test-user sign-in buttons: dev server + local database + enabled by `npm run setup`. */
export const devQuickSignIn = import.meta.env.DEV && isLocalUrl && import.meta.env.VITE_DEV_QUICK_SIGNIN === 'true';

/** Which required settings are missing (shown on a setup screen instead of a broken app). */
export const missingConfig: string[] = [
  ['VITE_SUPABASE_URL', config.supabaseUrl],
  ['VITE_SUPABASE_ANON_KEY', config.supabaseAnonKey],
  ['VITE_GOOGLE_CLIENT_ID', config.googleClientId]
].filter(([, value]) => !value).map(([name]) => name as string);
