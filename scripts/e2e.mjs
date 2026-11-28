// npm run test:e2e [-- <name> …]
// Browser tests (tests/e2e/*.mjs) against the LOCAL stack: checks the local database is running and a browser is
// installed, resets the sample articles, starts a dev server on its own port, runs every test (or those whose file
// name contains one of the given words), resets the samples again, and prints a summary. docs/04 §14.
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { c, dockerRunning, fail, localStatus, ok, path } from './dev-lib.mjs';
import { chromiumPath } from '../tests/e2e/lib.mjs';

const PORT = 5199;
const BASE = `http://localhost:${PORT}/study-split-app`;
const SAMPLES = ['consistent-hashing', 'telemetry-etl-pipeline'];
const DB = 'supabase_db_study-split-app';

const words = process.argv.slice(2);
const files = readdirSync(path('tests/e2e')).filter(f => f.endsWith('.mjs') && f !== 'lib.mjs' && (!words.length || words.some(w => f.includes(w)))).sort();
if (!files.length) fail(`No test matches: ${words.join(', ')}. Tests: ${readdirSync(path('tests/e2e')).filter(f => f !== 'lib.mjs').join(', ')}`);

if (!dockerRunning() || !localStatus()) fail('The local database is not running. Start it with `npm run db:start` (or `npm run setup` the first time).');
if (!chromiumPath()) fail('No Chromium for the browser tests. Install one once with:\n  npx playwright-core install chromium-headless-shell\n(or point PW_CHROMIUM at a Chrome/Chromium executable).');

const resetSamples = () => {
  const r = spawnSync('node', [path('scripts/db-refresh-samples.mjs'), ...SAMPLES], { encoding: 'utf8' });
  if (r.status !== 0) fail(`Could not reset the sample articles:\n${r.stderr || r.stdout}`);
};
resetSamples();
// Sample articles by name → their fixed short ids (scripts/seed), checked to exist in the local database.
const { articles: samples } = await import('./seed/data.mjs');
const ids = Object.fromEntries(samples.filter(a => SAMPLES.includes(a.slug)).map(a => [a.slug, a.publicId]));
const q = spawnSync('docker', ['exec', DB, 'psql', '-U', 'postgres', '-tA', '-c',
  `select public_id from public.articles where public_id in (${Object.values(ids).map(id => `'${id}'`).join(',')})`], { encoding: 'utf8' });
const present = new Set(q.stdout.trim().split('\n').filter(Boolean));
const missing = SAMPLES.filter(s => !present.has(ids[s]));
if (missing.length) fail(`Sample article(s) missing in the local database: ${missing.join(', ')}. Run \`npm run db:reset\` (wipes local data) to load them.`);

// Dev server on its own port, so it never clashes with your `npm run dev`. Started directly (not through npx), so
// stopping it really stops it; a leftover server on the port is refused rather than silently reused.
if (await fetch(BASE + '/').then(() => true, () => false)) fail(`Port ${PORT} is already in use (a leftover test server?). Stop it, then try again.`);
const server = spawn(process.execPath, [path('node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: path('.'), stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', d => { serverLog += d; });
server.stderr.on('data', d => { serverLog += d; });
const stop = () => { if (!server.killed) server.kill(); };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });
let up = false;
for (let i = 0; i < 120 && !up; i++) {
  up = await fetch(BASE + '/').then(r => r.ok, () => false);
  if (!up) await new Promise(r => setTimeout(r, 500));
}
if (!up) { stop(); fail(`The dev server did not start on port ${PORT}:\n${serverLog.slice(-1500)}`); }

const shots = join(tmpdir(), 'study-split-e2e');
console.log(c.dim(`\nBrowser tests: ${files.join(', ')}\nServer ${BASE} · screenshots in ${shots}\n`));
const results = [];
for (const f of files) {
  console.log(c.bold(`── ${f}`));
  const t0 = Date.now();
  const r = spawnSync('node', [path(`tests/e2e/${f}`)], {
    stdio: 'inherit', timeout: 10 * 60_000,
    env: { ...process.env, E2E_BASE: BASE, E2E_IDS: JSON.stringify(ids), E2E_SHOTS: shots }
  });
  results.push({ f, ok: r.status === 0, s: Math.round((Date.now() - t0) / 1000) });
  console.log('');
}
stop();
resetSamples();   // tests may switch modes in the editor (autosaved): put the samples back

console.log(c.bold('Summary'));
for (const { f, ok: passed, s } of results) console.log(`  ${passed ? c.green('✓') : c.red('✗')} ${f} ${c.dim(`(${s}s)`)}`);
const failed = results.filter(r => !r.ok).length;
if (failed) fail(`${failed} of ${results.length} browser test file(s) failed.`);
ok(`All ${results.length} browser test files passed. Sample articles reset.`);
