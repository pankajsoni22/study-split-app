/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_BASE_PATH?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** Local development only (written by `npm run setup`): show test-user sign-in buttons. */
  readonly VITE_DEV_QUICK_SIGNIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
