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
| Update the sample articles in the local database **without** a reset | `npm run db:refresh-samples` (or `-- consistent-hashing` for one) |
| Apply new migrations to **production** | `npm run db:prod -- push` (see [§7](#7-applying-migrations-to-production)) |
| Production backups: download, check, restore, capacity | `docs/02-setup-checklist.md` step 7 |
| Run the **browser tests** (real Chromium, local data) | `npm run test:e2e` (or `-- reader` / `-- editor` for some; see [§13](#13-browser-tests)) |
| Checks before pushing | `npm run lint && npm test && npm run test:db && npm run build`, plus `npm run test:e2e` for UI changes |

**Test users** (local only, password `study-split-dev`). The sign-in page has a button for each:

| Button | Username | Role | Owns |
|---|---|---|---|
| Admin | `dev-admin` | admin | "Welcome to Study Split" (published) |
| Writer | `dev-writer` | writer | URL Shortener (published), **Consistent Hashing** (draft; complete 11-section article with drawings and tables), **Telemetry ETL pipeline** (published; 9-split high-level design with Unfold), Old notes (in Trash) |
| Reader | `dev-reader` | reader | nothing; can read published articles only |

Sample articles have **fixed ids** (local only), so their links stay the same across resets: Consistent Hashing
`/read/CnsHashing01`, Telemetry ETL `/read/EtlPipeline1`, URL Shortener `/read/UrlShort3ner`, Welcome
`/read/WelcomeStudy` (editor: `/write/<id>`). Samples have no slug; `db:refresh-samples` also clears one set while testing.

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

- **Source of truth:** `scripts/seed/`, as JavaScript, so the documents and drawings are always valid:
  - `data.mjs`: test users, the short sample articles, and `buildArticle()`, which turns an article definition into a
    TipTap document plus Excalidraw drawings (one frame per split, i.e. per H2 section; stable ids);
  - `draw.mjs`: helpers for the **text** (`P`, `H3`, `UL`, `OL`, `NOTE` highlight box, `MORE` collapsible, `CODE`,
    `TABLE`, with **bold**/`code`/*italic* inline) and the **drawings** (`box`, `rect`, `ellipse`, `text`, `arrow`,
    `line`, `arc`, ring `node`/`key`, colour tones `C.teal` …). Coordinates are relative to the split's drawing (40:60 drawings are
    1600 × 1200);
  - one file per long article, e.g. `consistent-hashing.mjs` (each section has `title`, `body` and a `draw(k)` function).
- **Generated file:** `supabase/seed.sql`, committed. **Don't edit it by hand.**
- **Loaded:** on the first `supabase start`, and on every `npm run db:reset` (which wipes everything else locally).
- **To change a sample article:** edit `scripts/seed/…`, then
  - `npm run db:refresh-samples` updates the sample articles' text, drawings and metadata **in place**. Other local data
    stays; local edits to those sample articles are overwritten. Use `npm run db:refresh-samples -- consistent-hashing`
    for just one. Then reload the editor.
  - Commit `scripts/seed/` and `supabase/seed.sql` together.
- **Unfold in sample articles (experimental branch):** set `unfold: true` on the article and call
  `k.step('start of a paragraph')` in a `draw(k)` function: everything drawn after it appears with that paragraph
  (`k.step(null)` = always visible). Unknown text throws, so typos are caught by `npm run db:seed`.
- **Writing style for sample articles:** one idea per paragraph, short sub-headings (H3), and in every split an
  **"In the drawing"** paragraph that walks through the drawing using the same names and numbers as the drawing.
- **Check drawings visually:** open the article in the editor and click each split heading. The drawing you get is
  exactly what readers see. Keep text ≥ 24 px, and remember that the hand-drawn font has no `¼ ½ ¾`-style
  characters (write `1/4`).
- **Test password:** `study-split-dev`. Fixed user IDs: `00000000-0000-4000-a000-00000000000{1,2,3}`.
- **When the schema changes**, for example a new required column, update the seed in the same branch, or
  `db:reset` fails.

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
6. **Production is automatic (since 2026-11-26):** merging to `main` runs the deploy workflow's **Migrate
   database** job, which applies every new migration to production **before** the new site is published. If a
   migration fails, the site is not deployed (red run in Actions, with the reason).
   - **Rule:** a migration must keep the *currently live* site working, because it runs about a minute before the
     new site goes up. Add before you remove: add columns/functions first, and drop old ones in a later release.
   - Manual alternatives still work: the SQL Editor, or `npm run db:prod -- push` (§7). The workflow then sees
     them as already applied only if they were recorded, so prefer the automatic path.

---

## 7. Applying migrations to production

Normally you do nothing: the deploy workflow applies them (§6, step 6). It uses the GitHub secret
`SUPABASE_DB_URL` (the same one the backup uses) and the Supabase CLI pinned in the workflow. Sample data
(`seed.sql`) is **never** sent to production; `db push` only applies migrations.

The commands below are for running it yourself from the terminal.

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

**Status:** baselined on 2026-11-26 (the five hand-applied migrations are recorded), so the deploy workflow and
`npm run db:prod -- push` apply only new migrations. The Supabase CLI refuses hosted changes from an agent without
`--yes`; `db:prod` passes it only after you have typed `yes, production`.

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
| A test user or sample article | `scripts/seed/` → `npm run db:refresh-samples` (or `db:reset`) → commit `scripts/seed/` and `seed.sql`; table in §0 |
| A user-facing feature or a UI fix | A check in `tests/e2e/` (an existing file, or a new one: §13); run `npm run test:e2e` |

---

## 12. Files that make up the local setup

| File | Purpose |
|---|---|
| `supabase/config.jsonc` | Local stack settings: ports, enabled services, Auth (site URL, Google provider) |
| `supabase/seed.sql` | Generated sample data (don't edit) |
| `scripts/seed/` | Sample data source: users, articles, drawing and text helpers |
| `scripts/build-seed.mjs` | `scripts/seed/` → `supabase/seed.sql` |
| `scripts/db-refresh-samples.mjs` | `npm run db:refresh-samples`: update sample articles in place |
| `scripts/dev-setup.mjs` | `npm run setup` |
| `scripts/dev-check.mjs` | Runs before `npm run dev` (local-only guard) |
| `scripts/db-studio.mjs` | `npm run db:studio` |
| `scripts/db-prod.mjs` | `npm run db:prod -- status / baseline / push` |
| `scripts/dev-lib.mjs` | Shared helpers for the scripts above |
| `src/dev/DevQuickSignIn.tsx`, `src/dev/DevBadge.tsx` | Dev-only UI (stripped from production builds) |
| `src/config.ts` | `devBackend` / `devQuickSignIn` flags |

---

## 13. Browser tests

`npm run test:e2e` drives a real (headless) Chromium through the app, against the **local** database and its sample
articles. It checks the things unit tests cannot see: the reading pointer and keys, steady Unfold drawings, menus,
toolbar alignment, the editor matching the reader, navigation, links, theme. About 5 minutes; 85 checks.

**Needs:** the local database running (`npm run db:start`) and a Chromium. `playwright-core` is a dev dependency but does
not download a browser; install one once with `npx playwright-core install chromium-headless-shell` (or set
`PW_CHROMIUM=/path/to/chrome`).

**What the runner (`scripts/e2e.mjs`) does:** resets the two sample articles (`consistent-hashing`,
`telemetry-etl-pipeline`), starts its own dev server on port **5199** (your `npm run dev` on 5173 is untouched), runs
each `tests/e2e/*.mjs` file, resets the samples again (tests may switch modes in the editor, which autosaves) and prints
a summary. `npm run test:e2e -- editor` runs only files whose name contains "editor". Screenshots go to
`<temp>/study-split-e2e/`.

| File | Covers |
|---|---|
| `reader.mjs` | pointer stepping, Enter on collapsibles and split buttons, going back to a split's end, resume after refresh, split links, Copy link, breadcrumb |
| `reader-drawing.mjs` | Unfold drawings stay steady: nothing vanishes, no text waits on a font, no font loads while stepping |
| `menus.mjs` | reader and editor top bars (Layout, Mode, ⋯), toolbars same height in all layouts, Insert menu not clipped |
| `editor-nav.mjs` | breadcrumb + Contents, sub-section jump + flash, drawing follows the split in view, full-screen sidebar, split panel preview |
| `editor-preview.mjs` | editor text = reader text (margins, size, line wrapping) |
| `editor-spotlight.mjs` | Unfold spotlight both ways |
| `links.mjs` | `/read/{id}`, `/write/{id}`, optional slug link + uniqueness, old links gone, unknown ids |
| `theme.mjs` | the chosen theme survives a refresh |

**Writing a test:** copy an existing file. `tests/e2e/lib.mjs` gives `run(name, body)`, `check(ok, message)`, `BASE`,
`IDS` (sample article ids by slug), `page()`, `signIn(page)`, `shot()`, and helpers for the bar menus. Click like a
person (`clickAt`, mouse coordinates) where it matters: Playwright's `locator.click()` scrolls things into view first,
which has hidden real bugs before (a menu clipped off-screen still "worked" in a test). Not run in CI (it needs Docker
and the local stack).

---

## 14. Change log

| Date | Change |
|---|---|
| 2026-11-26 | Production baselined; `db:prod` passes `--yes` after its own confirmation. |
| 2026-11-26 | Deploy workflow applies migrations to production automatically (job **Migrate database**, before deploy); production must be baselined once. |
| 2026-11-26 | Brief/Detailed removed (sample data, seed, migration `20261126000000_remove_brief.sql`; locally applied with `npx supabase migration up`). Slides are called **splits** in the app. |
| 2026-11-26 | Consistent Hashing rewritten (article structure, "In the drawing" walkthroughs, slides 2/9/11 extended); writing-style rule. |
| 2026-11-25 | Seed split into `scripts/seed/` (drawing + text helpers, one file per long article); `npm run db:refresh-samples`; complete Consistent Hashing sample article. |
| 2026-11-25 | Quick reference links to the backup guide (setup checklist step 7). |
| 2026-11-25 | Production Postgres verified as 17.12 (matches local). `.env.prod-db.local` created; `db:prod status` works; baseline pending. CLI v4 flag note. |
| 2026-11-25 | First version: Supabase CLI local stack (Postgres 17, API, Auth, Storage, Studio), `npm run setup`, `dev` / `dev:prod`, seed with three test users and four articles, quick sign-in, LOCAL/PROD badge, `db:*` scripts, `db:prod` push with baseline. |
| 2026-11-27 | New sample `telemetry-etl-pipeline` (scripts/seed/telemetry-etl.mjs): "A Distributed ETL Pipeline for Storage Telemetry", 9 splits told as one file's journey, Unfold on. An existing local database gets it without a reset by inserting it once (see the commit). |
| 2026-11-28 | Browser tests in the repo: `tests/e2e/*.mjs` + `npm run test:e2e` (`scripts/e2e.mjs`, own dev server on port 5199, resets the samples before and after); `playwright-core` dev dependency; §13. |
| 2026-11-28 | Article links by short id: migration `20261128000000_article_ids.sql` (`public_id`, optional site-unique slug, retired ids); samples get fixed ids (`publicId` in `scripts/seed/`), found by id instead of slug; `links.mjs` browser test. Apply locally with `npx supabase migration up` (or `npm run db:reset`). |
