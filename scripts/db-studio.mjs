// npm run db:studio — opens the local Supabase Studio (database UI).
import { spawn, spawnSync } from 'node:child_process';
import { fail, localStatus } from './dev-lib.mjs';

const status = localStatus();
if (!status) fail('Local Supabase is not running. Start it with `npm run db:start`.');
const url = status.STUDIO_URL || 'http://127.0.0.1:54323';
console.log(`Supabase Studio: ${url}`);
// Open it in the browser when an opener exists (WSL: wslview; Linux: xdg-open; macOS: open).
const opener = ['wslview', 'xdg-open', 'open'].find(cmd => spawnSync('which', [cmd], { stdio: 'ignore' }).status === 0);
if (opener) spawn(opener, [url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
