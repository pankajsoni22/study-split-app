# Study Split

Write study notes and engineering articles with **text on the left and hand-drawn diagrams on the right**. You can publish them under your own `@username`, revise them in Brief mode, and read them on any screen.

- Design & requirements: [`docs/01-product-and-architecture.md`](docs/01-product-and-architecture.md)
- **Setup checklist (start here):** [`docs/02-setup-checklist.md`](docs/02-setup-checklist.md)
- Live site: `https://pankajsoni22.github.io/study-split-app/`

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router, plain CSS (same design system as soni-siblings-app), lucide icons, Inter |
| Sign-in | Google Identity Services (button + One Tap) → Supabase `signInWithIdToken` |
| Backend | Supabase Free: Postgres + Row-Level Security, Storage, (Edge Functions in Phase 1) |
| Hosting | GitHub Pages (static), deployed by GitHub Actions |
| Ops | GitHub Actions: deploy, keep-alive ping every 3 days, weekly encrypted DB backup |

## Project layout

```
src/
  app/            routes, shell (sidebar / phone tab bar), error boundary
  features/       auth, home, account, articles, editor, admin
  domain/         pure rules and types (unit-tested)
  data/
    ports.ts      backend-agnostic interfaces
    adapters/supabase/   the ONLY code that imports Supabase (lint-enforced)
    services.ts   picks the adapter; useQuery.ts = small cached data hook
  ui/             Logo, Brand, Avatar, states, theme switch
  lib/            storage, theme, formatting, view counter
supabase/migrations/   SQL schema, RLS policies, RPC functions
public/                favicon.svg (the logo), PNG icons, manifest, theme-init.js
```

## Setup (one time)

### 1. Supabase project
1. Create a project at [supabase.com](https://supabase.com) (Free plan; pick the region nearest your readers, for example Mumbai).
2. **SQL Editor** → paste and run [`supabase/migrations/20261121000000_init.sql`](supabase/migrations/20261121000000_init.sql).
   (Or use the CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`.)
3. **Project Settings → API**: copy the *Project URL* and the *anon / publishable* key.

### 2. Google sign-in (same as soni-siblings-app)
1. [Google Cloud Console](https://console.cloud.google.com) → *Google Auth Platform* → **Clients → Create client → Web application**.
2. **Authorized JavaScript origins:** `http://localhost:5173` and `https://pankajsoni22.github.io`.
   No redirect URIs are needed (ID-token flow).
3. **Audience:** to let anyone sign in, set the publishing status to *In production*. The basic `openid email profile` scopes need no Google verification. While it stays in *Testing*, only listed test users can sign in.
4. Supabase → **Authentication → Sign In / Providers → Google**: enable it, paste the **Client ID** (and the client secret Google showed you). Leave *Skip nonce check* **off**.

### 3. Run locally
```bash
cp .env.example .env.local     # fill in the three values
npm install
npm run dev                    # http://localhost:5173/study-split-app/
```

### 4. Make yourself admin
Sign in once (this creates your profile as a *reader*), then run in the Supabase SQL Editor:
```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'YOUR_GMAIL@gmail.com');
```
Reload the app: the **Admin** section appears. Under **Admin → App settings** you choose whether new users start as *Reader* (default) or *Writer*.

### 5. Deploy (GitHub Pages)
1. Repo **Settings → Pages → Source: GitHub Actions**.
2. Repo **Settings → Secrets and variables → Actions → Variables**: add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_GOOGLE_CLIENT_ID`. These are public values, so use *variables*, not secrets.
3. Push to `main`. The workflow runs lint, tests and the build, then deploys.

### 6. Keep the free database awake + backups
- **Keep-alive:** `.github/workflows/keepalive.yml` calls `ping()` every 3 days. GitHub turns off scheduled workflows after 60 days with no commits, so also add a free second pinger. At [cron-job.org](https://cron-job.org), create a job that POSTs every 3 days to `https://<ref>.supabase.co/rest/v1/rpc/ping` with the headers `apikey: <anon key>` and `Content-Type: application/json`.
- **Backups:** `.github/workflows/backup.yml` dumps the database weekly and **encrypts** it with [age](https://age-encryption.org). This matters because anyone signed in to GitHub can download a public repo's artifacts.
  1. `age-keygen -o study-split-backup.key`: keep this file **private and offline**. Its `# public key: age1…` line is the recipient.
  2. Add the variable `BACKUP_AGE_RECIPIENT` = `age1…`.
  3. Add the **secret** `SUPABASE_DB_URL` = Supabase → *Connect* → *Session pooler* connection string, with your DB password filled in.
  4. To restore: `age -d -i study-split-backup.key study-split-db-DATE.tar.gz.age | tar -xz`.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server on :5173 |
| `npm run build` | Type-check + production build (`dist/`, includes `404.html` for deep links) |
| `npm run lint` / `npm test` | ESLint / Vitest |
| `npm run icons` | Re-render PNG icons from `public/favicon.svg` |

## Migrating off Supabase later
Write `src/data/adapters/<new>/` implementing `src/data/ports.ts` and switch one line in `src/data/services.ts`. Then run the SQL migrations on RDS or Cloud SQL and copy the Storage buckets to S3 or GCS. See docs §11.4.
