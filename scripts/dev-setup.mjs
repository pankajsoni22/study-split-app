// npm run setup — one command for a working local environment (docs/04-local-development.md §2).
// Safe to run again at any time: it never touches production and keeps your local data
// (use `npm run db:reset` to start the local database over).
import { existsSync } from 'node:fs';
import { c, dockerRunning, fail, LOCAL_ENV, localStatus, ok, path, readEnvFile, supabase, writeEnvFile } from './dev-lib.mjs';

console.log(c.bold('\nStudy Split — local development setup\n'));

if (!existsSync(path('node_modules/.bin/supabase'))) fail('Dependencies are missing. Run `npm install` first.');
if (!dockerRunning()) fail('Docker is not running. Start Docker Desktop (or `sudo service docker start` in WSL) and run `npm run setup` again.');
ok('Docker is running');

// Google sign-in for local Auth: the same public client id the app uses.
const hosted = readEnvFile('.env.local');
const googleClientId = readEnvFile(LOCAL_ENV).VITE_GOOGLE_CLIENT_ID || hosted.VITE_GOOGLE_CLIENT_ID || '';
writeEnvFile('supabase/.env', '# Written by `npm run setup` — local Auth settings (git-ignored).', {
  SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: googleClientId || 'not-configured',
  SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET: 'not-used-by-id-token-sign-in'
});
ok(googleClientId ? 'Local Google sign-in uses your client id from .env.local' : 'No Google client id found: use the quick test-user sign-in locally');

let status = localStatus();
if (status) ok('Local Supabase is already running (data kept)');
else {
  console.log(c.dim('\nStarting local Supabase (first run downloads ~1.5 GB of images; later starts take seconds)…\n'));
  supabase(['start']);
  status = localStatus();
  if (!status) fail('Local Supabase did not start. See the output above, then `npm run db:status`.');
  ok('Local Supabase started: migrations and sample data loaded');
}

const anonKey = status.ANON_KEY || status.PUBLISHABLE_KEY;
writeEnvFile(LOCAL_ENV, [
  '# Written by `npm run setup` — LOCAL database for `npm run dev` (git-ignored).',
  '# Overrides .env.local (hosted values) in development mode. Delete it and `npm run dev` refuses to start.'
].join('\n'), {
  VITE_SUPABASE_URL: status.API_URL,
  VITE_SUPABASE_ANON_KEY: anonKey,
  VITE_GOOGLE_CLIENT_ID: googleClientId || 'not-configured.apps.googleusercontent.com',
  VITE_DEV_QUICK_SIGNIN: 'true'
});
ok(`${LOCAL_ENV} points the app at ${status.API_URL}`);

console.log(`
${c.bold('Ready.')}
  npm run dev          app on http://localhost:5173/study-split-app/  (local database)
  npm run db:studio    database UI on ${status.STUDIO_URL || 'http://127.0.0.1:54323'}
  Test users           dev-admin · dev-writer · dev-reader  (buttons on the sign-in page)
  More                 docs/04-local-development.md
`);
