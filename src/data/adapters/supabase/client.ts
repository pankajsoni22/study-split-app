import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function createSupabase(url: string, anonKey: string): SupabaseClient {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- untyped schema; rows are typed in mappers.ts
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,        // stays signed in across visits and tabs (localStorage)
      autoRefreshToken: true,
      detectSessionInUrl: false,   // we sign in with Google ID tokens, never via URL redirects
      storageKey: 'ss.auth'
    }
  });
}
