// Public values from .env.local / GitHub repository variables (VITE_ prefix).
// None are secret: the database enforces access with Row-Level Security.
export const config = {
  appName: import.meta.env.VITE_APP_NAME ?? 'Study Split',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
} as const;

/** Which required settings are missing (shown on a setup screen instead of a broken app). */
export const missingConfig: string[] = [
  ['VITE_SUPABASE_URL', config.supabaseUrl],
  ['VITE_SUPABASE_ANON_KEY', config.supabaseAnonKey],
  ['VITE_GOOGLE_CLIENT_ID', config.googleClientId]
].filter(([, value]) => !value).map(([name]) => name as string);
