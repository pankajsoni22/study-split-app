// npm run db:prod -- <status|baseline|push>   (docs/04-local-development.md §7)
// Applies migrations to the HOSTED (production) database from the terminal instead of the SQL Editor.
// Needs SUPABASE_DB_URL in .env.prod-db.local (git-ignored). Every change asks for a typed confirmation.
import { createInterface } from 'node:readline/promises';
import { readdirSync } from 'node:fs';
import { c, fail, ok, path, readEnvFile, supabase } from './dev-lib.mjs';

const FILE = '.env.prod-db.local';
const cmd = process.argv[2];
const dbUrl = readEnvFile(FILE).SUPABASE_DB_URL;
if (!['status', 'baseline', 'push'].includes(cmd ?? '')) fail('Usage: npm run db:prod -- status | baseline | push');
if (!dbUrl) fail(`${FILE} with SUPABASE_DB_URL=… is missing. See docs/04-local-development.md §7.`);
if (/127\.0\.0\.1|localhost/.test(dbUrl)) fail(`${FILE} points at a local database; it must be the hosted one.`);

async function confirm(what) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\n${c.red(c.bold('PRODUCTION'))}: ${what}\nType exactly ${c.bold('"yes, production"')} (without the quotes) to continue: `);
  rl.close();
  if (answer.trim() !== 'yes, production') fail('Cancelled — nothing was changed. (The answer must be exactly: yes, production)');
}

console.log(c.dim('\nMigrations (Local = files in supabase/migrations, Remote = recorded on production):\n'));
supabase(['migration', 'list', '--db-url', dbUrl]);

if (cmd === 'baseline') {
  // One-time: production's migrations were applied by hand in the SQL Editor, so the CLI has no record of them.
  // This records the given ones as applied WITHOUT running them.
  const versions = process.argv.slice(3);
  const all = readdirSync(path('supabase/migrations')).map(f => f.split('_')[0]).filter(v => /^\d{14}$/.test(v));
  if (!versions.length) fail(`Name the migrations already applied by hand, e.g.\n  npm run db:prod -- baseline ${all.join(' ')}`);
  const unknown = versions.filter(v => !all.includes(v));
  if (unknown.length) fail(`Not migration versions in supabase/migrations: ${unknown.join(', ')}`);
  await confirm(`mark ${versions.length} migration(s) as already applied (nothing is run): ${versions.join(', ')}`);
  supabase(['migration', 'repair', '--status', 'applied', ...versions, '--db-url', dbUrl, '--yes']);   // --yes: confirmed above
  ok('Recorded. `npm run db:prod -- status` should now show them on both sides.');
}

if (cmd === 'push') {
  console.log(c.dim('\nDry run — what would be applied:\n'));
  supabase(['db', 'push', '--dry-run', '--db-url', dbUrl]);
  await confirm('apply the pending migrations listed above');
  supabase(['db', 'push', '--db-url', dbUrl, '--yes']);   // --yes: confirmed above
  ok('Applied. The API reloads its schema cache automatically within a few seconds.');
}
