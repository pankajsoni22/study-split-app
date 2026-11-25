// Shared helpers for the local-development scripts (docs/04-local-development.md).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const root = resolve(import.meta.dirname, '..');
export const path = p => resolve(root, p);
export const LOCAL_ENV = '.env.development.local';

export function readEnvFile(file) {
  const full = path(file);
  if (!existsSync(full)) return {};
  return Object.fromEntries(readFileSync(full, 'utf8').split('\n')
    .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^["']|["']$/g, '')]));
}

export function writeEnvFile(file, header, values) {
  writeFileSync(path(file), `${header}\n${Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n')}\n`);
}

/** Runs the project's Supabase CLI (node_modules/.bin/supabase). */
export function supabase(args, { capture = false, allowFail = false } = {}) {
  const r = spawnSync(path('node_modules/.bin/supabase'), args, { cwd: root, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', encoding: 'utf8' });
  if (r.status !== 0 && !allowFail) {
    if (capture) process.stderr.write(r.stderr || r.stdout || '');
    fail(`supabase ${args.join(' ')} failed`);
  }
  return r;
}

export function dockerRunning() {
  try { execFileSync('docker', ['info'], { stdio: 'ignore' }); return true; } catch { return false; }
}

/** Local stack status as env vars (API_URL, ANON_KEY, …), or null when it isn't running. */
export function localStatus() {
  const r = supabase(['status', '-o', 'env'], { capture: true, allowFail: true });
  if (r.status !== 0) return null;
  return Object.fromEntries(r.stdout.split('\n').map(l => l.match(/^([A-Z0-9_]+)="?(.*?)"?$/)).filter(Boolean).map(([, k, v]) => [k, v]));
}

export const c = { bold: s => `\x1b[1m${s}\x1b[0m`, green: s => `\x1b[32m${s}\x1b[0m`, red: s => `\x1b[31m${s}\x1b[0m`, dim: s => `\x1b[2m${s}\x1b[0m` };
export function fail(msg) { console.error(`\n${c.red('✗')} ${msg}\n`); process.exit(1); }
export const ok = msg => console.log(`${c.green('✓')} ${msg}`);
