// npm run db:refresh-samples [-- <slug> …]
// Updates the sample articles' text and slides in the LOCAL database in place (no reset: your other local data
// stays). Overwrites any local edits to those sample articles. docs/04-local-development.md §5.
import { spawnSync } from 'node:child_process';
import { articles, buildArticle } from './seed/data.mjs';
import { articleContentSql } from './build-seed.mjs';
import { fail, localStatus, ok } from './dev-lib.mjs';

const only = process.argv.slice(2);
const chosen = articles.filter(a => a.state !== 'trash' && (!only.length || only.includes(a.slug)));
if (!chosen.length) fail(`No sample article matches: ${only.join(', ')}. Known: ${articles.map(a => a.slug).join(', ')}`);
if (!localStatus()) fail('Local Supabase is not running. Start it with `npm run db:start`.');

const sql = `begin;\n${chosen.map(a => articleContentSql(a, buildArticle(a))).join('\n')}commit;\n`;
const r = spawnSync('docker', ['exec', '-i', 'supabase_db_study-split-app', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'],
  { input: sql, encoding: 'utf8' });
if (r.status !== 0) fail(`psql failed:\n${r.stderr || r.stdout}`);
ok(`Updated in the local database: ${chosen.map(a => a.slug).join(', ')} (reload the editor to see it)`);
