// Runs before `npm run dev`: makes sure the app points at the LOCAL database and that it is up.
// (Without .env.development.local, Vite would fall back to .env.local = production data.)
import { c, dockerRunning, fail, LOCAL_ENV, localStatus, readEnvFile, supabase } from './dev-lib.mjs';

const env = readEnvFile(LOCAL_ENV);
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(env.VITE_SUPABASE_URL ?? '')) {
  fail(`${LOCAL_ENV} is missing or doesn't point at the local database.\n  Run ${c.bold('npm run setup')} first (or ${c.bold('npm run dev:prod')} to use the hosted data).`);
}
if (!dockerRunning()) fail('Docker is not running. Start it, then `npm run dev` again.');
if (!localStatus()) {
  console.log(c.dim('Local Supabase is stopped — starting it…'));
  supabase(['start']);
}
console.log(`${c.green('✓')} Using the ${c.bold('LOCAL')} database (${env.VITE_SUPABASE_URL})`);
