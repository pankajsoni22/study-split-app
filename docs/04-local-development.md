# Study Split — Local development guide

The reference for running Study Split on your own machine: the UI **and** a private copy of the database, with
one command to set up and a flag to choose local or production data.

> **Keep this document current.** Whenever the scripts, ports, env files, seed data or database workflow change,
> update the matching section here and add a line to the [change log](#13-change-log) at the bottom.

---

## 0. Quick reference

| I want to… | Command |
|---|---|
| Set up everything (first time, or after a fresh clone) | `npm install` then `npm run setup` |
| Run the app on the **local** database | `npm run dev` → <http://localhost:5173/study-split-app/> |
| Run the app on the **production** database | `npm run dev:prod` (red **PROD DATA** badge) |
| Open the database UI (Supabase Studio) | `npm run db:studio` → <http://127.0.0.1:54323> |
| Start / stop the local database | `npm run db:start` · `npm run db:stop` |
| See local URLs and keys | `npm run db:status` |
| Wipe local data and rebuild it (migrations + sample data) | `npm run db:reset` |
| Create a new migration file | `npm run db:new <short_name>` |
| Regenerate sample data after editing it | `npm run db:seed` (then `npm run db:reset`) |
| Apply new migrations to **production** | `npm run db:prod -- push` (see [§7](#7-applying-migrations-to-production)) |
| Production backups: download, check, restore, capacity | `docs/02-setup-checklist.md` step 7 |
| Checks before pushing | `npm run lint && npm test && npm run test:db && npm run build` |

**Test users** (local only, password `study-split-dev`). The sign-in page has a button for each:

| Button | Username | Role | Owns |
|---|---|---|---|
| Admin | `dev-admin` | admin | "Welcome to Study Split" (published) |
| Writer | `dev-writer` | writer | URL Shortener (published), Consistent Hashing (draft), Old notes (in Trash) |
| Reader | `dev-reader` | reader | nothing; can read published articles only |

---

## 1. How it fits together

```
 Browser ──► Vite dev server (localhost:5173)  ──►  Supabase API
              src/ hot-reloads                        │
                                                      ├─ npm run dev       → LOCAL stack in Docker (127.0.0.1:54321)
                                                      │                       Postgres 17 · API · Auth · Storage · Studio
                                                      └─ npm run dev:prod  → HOSTED project (zomiawpvdgazykrwkgjl.supabase.co)
```

- **Why not just a Postgres container?** The app never talks to Postgres directly. It uses Supabase's API
  (tables and functions over HTTP), Auth (sign-in, login tokens) and row-level security based on the signed-in
  user. The Supabase CLI runs that same stack locally in Docker. The database inside it **is** a normal Postgres
  container (port 54322), so any Postgres tool works too.
- **Same schema as production.** The local database is built from the same files in `supabase/migrations/`
  that production runs, then filled with sample data from `supabase/seed.sql`.
- **The CLI is a dev dependency** (`supabase` in `package.json`), so nothing needs installing globally. Its
  settings live in `supabase/config.jsonc`, which is committed.
- **What runs locally:** Postgres, API (PostgREST), Auth, Storage and Studio. **Turned off** to keep it light:
  realtime, analytics, edge functions and the mail catcher. Turn edge functions on when the link-preview
  function arrives (increment 1c).

---

## 2. First-time setup

**Prerequisites**
- **Node.js** (current LTS; developed on v24).
- **Docker**, running. On Windows + WSL, either Docker Desktop with WSL integration, or Docker Engine inside WSL
  (`sudo service docker start`).
- About **2 GB** of disk for the Docker images (downloaded once).

**Steps**
1. `npm install`
2. `npm run setup`. It:
   - checks that Docker is running;
   - writes `supabase/.env` with your Google client ID, so local Google sign-in works;
   - starts the local stack. The **first** run downloads the images (a few minutes). It then applies every
     migration and loads the sample data;
   - writes `.env.development.local`, pointing the app at the local database, with the local keys filled in.
3. `npm run dev` and open <http://localhost:5173/study-split-app/>.
4. Sign in with a **test-user button**, or with Google (see [§4](#4-signing-in-locally)).

`npm run setup` is **safe to re-run** at any time. It never touches production and keeps your local data. Use
`npm run db:reset` to start the data over.

---

## 3. Dev or prod: which data am I using?

| Command | Vite mode | Env files loaded (later wins) | Data |
|---|---|---|---|
| `npm run dev` | `development` | `.env.local` → `.env.development.local` | **Local** Docker database |
| `npm run dev:prod` | `hosted` | `.env.local` | **Production** (real articles!) |
| `npm run build` / CI deploy | `production` | `.env.local` locally; GitHub *variables* in CI | Production |

Safety rails:
- **`npm run dev` refuses to start** if `.env.development.local` is missing or doesn't point at `127.0.0.1` or
  `localhost` (`scripts/dev-check.mjs`). Without that check, Vite would silently fall back to `.env.local`,
  which is production. It also starts the local stack if Docker is up but the stack is stopped.
- **Badge** (bottom-left, dev server only): teal **LOCAL DB** or red **PROD DATA**. It is never in production
  builds.
- **Test-user buttons** only appear on the dev server **and** with a local database **and**
  `VITE_DEV_QUICK_SIGNIN=true`. They are removed from production builds (checked: no test password, badge text or
  button text in `dist/`).

### Env files

| File | Committed? | Written by | Contains |
|---|---|---|---|
| `.env.example` | yes | hand | Template with every app variable and its meaning |
| `.env.local` | **no** | you | **Hosted** values: production Supabase URL and public key, Google client ID. All public. |
| `.env.development.local` | **no** | `npm run setup` | **Local** Supabase URL and key (standard local demo keys), `VITE_DEV_QUICK_SIGNIN=true` |
| `supabase/.env` | **no** | `npm run setup` | Google client ID for local Auth |
| `.env.prod-db.local` | **no** | you (optional) | `SUPABASE_DB_URL`, the **production database password**. **Secret.** See §7. |
| GitHub repo variables | n/a | you | `VITE_*` values the deploy workflow builds with |

All `VITE_*` values end up in the browser bundle, so they must never be secret. Access is enforced by
row-level security in Postgres. `SUPABASE_DB_URL` has no `VITE_` prefix, so Vite never exposes it.

---

## 4. Signing in locally

- **Test-user buttons**: instant sign-in as admin, writer or reader. This uses e-mail and password against the
  **local** Auth only (`src/dev/DevQuickSignIn.tsx`).
- **Google**: works locally too. Local Auth checks Google's login tokens against the same client ID. Needs
  `http://localhost:5173` in the Google client's **Authorized JavaScript origins** (setup checklist step 2,
  already done). Signing in with Google creates a new local user with the default *reader* role. Make it admin
  in Studio (`profiles.role`) or with the SQL from the setup checklist step 5, run in the local Studio.
- Google One Tap may log `FedCM … NetworkError` in the console on localhost. That's harmless.

---

## 5. Sample data (seed)

- **Source of truth:** `scripts/build-seed.mjs`. It holds the users and articles as JavaScript (TipTap
  documents plus Excalidraw slides), so the JSON is always valid.
- **Generated file:** `supabase/seed.sql`, committed. **Don't edit it by hand.**
- **Loaded:** on the first `supabase start`, and on every `npm run db:reset`.
- **To change the sample data:** edit `scripts/build-seed.mjs`, run `npm run db:reset` (it regenerates and
  reloads), then commit both files.
- **Test password:** `study-split-dev`. Fixed user IDs: `00000000-0000-4000-a000-00000000000{1,2,3}`.
- **When the schema changes**, for example a new required column, update the seed in the same branch, or
  `db:reset` fails.

---

## 6. Changing the database (migration workflow)

1. **Create the file:** `npm run db:new add_comments`. This creates
   `supabase/migrations/<timestamp>_add_comments.sql`.
2. **Write the SQL.** House rules:
   - Never edit a migration that production has already run. Add a new one.
   - Make it safe to run twice where possible (`if not exists`, `create or replace`).
   - Functions: `security definer` plus `set search_path = ''`, with schema-qualified names
     (`public.x`, `extensions.citext`).
   - New tables need RLS policies **and** explicit `grant`s (new Supabase projects don't grant automatically).
     See `20261121010000_api_grants.sql`.
   - End with `notify pgrst, 'reload schema';` if the API should see the change at once.
3. **Test it locally:** `npm run db:reset` rebuilds from scratch and must succeed. Then try the feature in
   `npm run dev`.
4. **Strict test:** `npm run test:db`. It runs the migrations in PGlite **without** Supabase's default grants,
   which catches missing grants. Add checks to `supabase/tests/db.test.mjs` for new rules.
5. **Commit** the migration together with the app code that needs it.
6. **Apply it to production BEFORE merging to main** ("make it live"). The live site deploys straight away and
   will break if it expects a column that isn't there yet. Two ways:
   - **SQL Editor** (as today): paste the file into the Supabase SQL Editor and run it.
   - **Terminal:** `npm run db:prod -- push` (§7).

---

## 7. Applying migrations to production

Optional; the SQL Editor keeps working. This replaces copy-paste with a checked, recorded push.

**One-time setup**
1. Supabase dashboard → **Connect** (top bar) → **Session pooler** → copy the URI. It looks like
   `postgresql://postgres.zomiawpvdgazykrwkgjl:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`.
   Use the **session pooler**, not the "direct connection": the direct host is IPv6-only, and WSL and many
   networks only have IPv4.
2. Create `.env.prod-db.local` in the project root (git-ignored), with your database password in place of
   `[YOUR-PASSWORD]`:
   ```
   SUPABASE_DB_URL=postgresql://postgres.zomiawpvdgazykrwkgjl:YOUR-PASSWORD@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
   This is the same value the backup workflow needs as the `SUPABASE_DB_URL` GitHub secret (setup checklist
   step 7).
3. **Baseline, once.** Production's first five migrations were run by hand, so the CLI has no record of them.
   Record them as applied **without running them**:
   ```bash
   npm run db:prod -- baseline 20261121000000 20261121010000 20261122000000 20261122010000 20261124000000
   ```

**Every time after that**
- `npm run db:prod -- status`: lists migrations, local vs. production.
- `npm run db:prod -- push`: shows a dry run, asks you to type `yes, production`, then applies only the pending
  ones and records them.

Never point `db:prod` at a local URL; the script refuses. Keep the file out of chats, screenshots and commits.

**Status (2026-11-25):** `.env.prod-db.local` exists and `npm run db:prod -- status` connects. The **baseline has
not been run yet**, so production's "Remote" column is still empty. Run the baseline command above once before
the first `push`.

**CLI upgrade note:** Supabase CLI 3.x warns that `--db-url` will be replaced by `--remote=<db-url>` in v4. The
project pins 3.4.0 (`package.json` and `.github/workflows/backup.yml`). When upgrading to v4, change the flag in
`scripts/db-prod.mjs` and the backup workflow.

---

## 8. Local services and ports

| Service | Address | Notes |
|---|---|---|
| App (Vite) | <http://localhost:5173/study-split-app/> | Fixed port (`strictPort`); Google allows this origin |
| Supabase API | <http://127.0.0.1:54321> | What the app calls |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` | Any SQL client works. `docker exec -it supabase_db_study-split-app psql -U postgres` |
| Studio | <http://127.0.0.1:54323> | Tables, SQL editor, auth users, storage |

The keys printed by `npm run db:status` are Supabase's **standard local demo keys**. They are the same on every
machine and only work against the local stack, so they're fine to have in files.

Data persists in Docker volumes between `db:stop` and `db:start`. `npm run db:reset` wipes it.

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `Docker is not running` | Start Docker Desktop, or in WSL `sudo service docker start`, then retry. |
| `npm run dev` says `.env.development.local is missing` | Run `npm run setup`. |
| `Port 5173 is already in use` | Another dev server is running (another terminal or editor). Stop it, or use that one. |
| Page shows **"Failed to fetch dynamically imported module"** | The dev server re-bundled dependencies (after `npm install` or env/config changes). Reload the page; if it persists, restart `npm run dev`. |
| `supabase start` fails on a migration | Read the SQL error; fix the migration; `npm run db:reset`. Storage must stay enabled (the init migration creates buckets). |
| Port 54321/54322/54323 in use | Another Supabase project is running: `npx supabase stop --project-id <other>`, or stop all Supabase containers in Docker. |
| Test-user button: "Invalid login credentials" | Local data was wiped or changed: `npm run db:reset`. |
| Google sign-in fails locally | Check that `supabase/.env` has the client ID (`npm run setup` rewrites it), then `npm run db:stop && npm run db:start`. Check that `http://localhost:5173` is an authorized origin in Google Cloud. |
| Start completely fresh | `npx supabase stop --no-backup` (deletes local data), then `npm run setup`. |
| Disk space | `npx supabase stop --no-backup` and `docker image prune`. Images re-download on next setup. |

---

## 10. Local vs. production differences

- **Postgres version:** local is **17** (`db.major_version` in `supabase/config.jsonc`). It must match
  production, which was **verified as 17.12 on 2026-11-25**. If Supabase upgrades production, check with
  `show server_version;` in the SQL Editor and update the config.
- **Content-Security-Policy** is added only in production builds (`vite.config.ts`). Something that works on the
  dev server can still be blocked live. `npm run build && npm run preview` tests the production bundle.
- **E-mail sign-in:** enabled locally (for the test users). In **production it must be OFF** (Google only). See
  the setup checklist, step 3.
- No backups, keep-alive pings or e-mail sending locally.
- Realtime, analytics and edge functions are off locally.

---

## 11. When you add something new: keep these in sync

| You add… | Also update |
|---|---|
| A `VITE_*` variable | `src/vite-env.d.ts`, `.env.example`, GitHub repo variables, `scripts/dev-setup.mjs` if local needs a value, this doc §3 |
| A migration | Seed (if needed), `supabase/tests/db.test.mjs`, apply to production **before** "make it live" (§6) |
| A table | RLS **and** grants, seed rows, PGlite test |
| A Supabase feature (edge function, storage use, realtime) | Enable it in `supabase/config.jsonc`, note it in §1 and §10 |
| An npm script | Quick reference (§0) |
| A test user or sample article | `scripts/build-seed.mjs` → `npm run db:reset` → commit both files; table in §0 |

---

## 12. Files that make up the local setup

| File | Purpose |
|---|---|
| `supabase/config.jsonc` | Local stack settings: ports, enabled services, Auth (site URL, Google provider) |
| `supabase/seed.sql` | Generated sample data (don't edit) |
| `scripts/build-seed.mjs` | Sample data source → `seed.sql` |
| `scripts/dev-setup.mjs` | `npm run setup` |
| `scripts/dev-check.mjs` | Runs before `npm run dev` (local-only guard) |
| `scripts/db-studio.mjs` | `npm run db:studio` |
| `scripts/db-prod.mjs` | `npm run db:prod -- status / baseline / push` |
| `scripts/dev-lib.mjs` | Shared helpers for the scripts above |
| `src/dev/DevQuickSignIn.tsx`, `src/dev/DevBadge.tsx` | Dev-only UI (stripped from production builds) |
| `src/config.ts` | `devBackend` / `devQuickSignIn` flags |

---

## 13. Change log

| Date | Change |
|---|---|
| 2026-11-25 | Quick reference links to the backup guide (setup checklist step 7). |
| 2026-11-25 | Production Postgres verified as 17.12 (matches local). `.env.prod-db.local` created; `db:prod status` works; baseline pending. CLI v4 flag note. |
| 2026-11-25 | First version: Supabase CLI local stack (Postgres 17, API, Auth, Storage, Studio), `npm run setup`, `dev` / `dev:prod`, seed with three test users and four articles, quick sign-in, LOCAL/PROD badge, `db:*` scripts, `db:prod` push with baseline. |
