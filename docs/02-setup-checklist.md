# Study Split: setup checklist (before Phase 1)

Study Split reuses what already exists for **soni-siblings-app**: the same GitHub account and the same Google Cloud project and sign-in client.
That leaves about **20 minutes** for steps 1–6. Step 7 can wait until before you write real content.

---

## ✅ Already done (reused from soni-siblings-app)

| Item | Value | Where it's used |
|---|---|---|
| GitHub account / Pages origin | `pankajsoni22` → `https://pankajsoni22.github.io` | Site URL: `https://pankajsoni22.github.io/study-split-app/` |
| Google Cloud project | Same project as soni-siblings-app | No new project needed |
| Google Auth Platform audience | Already **In production** | Anyone with a Google account can reach sign-in |
| Authorized JavaScript origin `https://pankajsoni22.github.io` | Already registered (same origin as soni-siblings-app) | Live-site sign-in |
| Google **Client ID** (public value) | `1039316720394-gjd5fqrjf9oe9ip4vg67r64sq0hq6ers.apps.googleusercontent.com` | Already in your local `.env.local`; also needed in steps 3 and 6 |
| Local `.env.local` | Created (git-ignored), Google Client ID filled in | Only the two Supabase values are missing |

> **Branding note:** Google's sign-in popup shows the Cloud project's app name, which is probably *Soni Siblings*.
> Either rename it in **Google Auth Platform → Branding** to something neutral like *Pankaj Soni Apps*, or later give Study Split its own Cloud project.
> Switching later only changes the Client ID in three places (`.env.local`, the GitHub variable and Supabase).

---

## 1. Create the Supabase project (about 5 min)

- [ ] Go to <https://supabase.com>, choose **New project**, and pick the region nearest your readers (for example Mumbai, `ap-south-1`).
- [ ] Save the **database password** in a password manager. Backups need it.
- [ ] Open **SQL Editor**, paste all of [`supabase/migrations/20261121000000_init.sql`](../supabase/migrations/20261121000000_init.sql), and click **Run**. It should end with *Success*.
  This file has never been run against a real database, so report any error you see.
- [ ] Open **Project Settings → API** and copy the **Project URL** and the **anon / publishable key**.

## 2. Allow local sign-in in Google (about 1 min)

The live origin is already registered. Only local development needs adding.

- [ ] Go to <https://console.cloud.google.com> and select the soni-siblings project.
- [ ] Go to **Google Auth Platform → Clients** and open the web client whose ID starts with `1039316720394-gjd5…`.
- [ ] Under **Authorized JavaScript origins**, add `http://localhost:5173` and save.
  Keep the existing origins (`https://pankajsoni22.github.io`, `http://localhost:8000`) unchanged.
- [ ] *(Optional)* Under **Branding**, rename the app as described in the branding note above.

## 3. Connect Google to Supabase (about 2 min)

- [ ] In Supabase, go to **Authentication → Sign In / Providers → Google** and turn it on.
- [ ] In **Client IDs**, paste `1039316720394-gjd5fqrjf9oe9ip4vg67r64sq0hq6ers.apps.googleusercontent.com`.
- [ ] **Client secret:** Study Split never uses it, because it signs in with ID tokens. Leave it empty if the form allows that.
  If the form insists, go to the Google client page, click **Add secret**, and paste the new one. Never commit it.
- [ ] Leave **Skip nonce check** turned **off**, then save.
- [x] **Turn e-mail sign-in OFF** (added 2026-11-25): **Authentication → Sign In / Providers → Email** → disable it and save.
  Supabase enables it by default, which lets anyone create an account through the API with an e-mail and password,
  bypassing Google. Study Split is Google-only in production. (Local development uses e-mail sign-in for its test
  users; that's the separate local database, unaffected by this switch.)
  *Done 2026-11-25: verified `/auth/v1/settings` shows `"email": false`, `"google": true`.*

## 4. Run the app locally (about 3 min)

- [ ] Open `.env.local`, which already exists, and fill in the two empty values from step 1. These are the **hosted**
  (production) values; `npm run dev:prod` and builds use them:
  - `VITE_SUPABASE_URL=https://<your-ref>.supabase.co`
  - `VITE_SUPABASE_ANON_KEY=<anon / publishable key>`
- [ ] For day-to-day development use the **local** database (added 2026-11-25): `npm run setup` once, then
  `npm run dev`. The full guide is [04-local-development.md](04-local-development.md).
- [ ] To work against production data instead: `npm run dev:prod`, open <http://localhost:5173/study-split-app/>, sign in
  with Google, then accept or change your username.

## 5. Make yourself admin (1 min)

- [ ] In the Supabase SQL Editor, run this with the Gmail address you signed in with:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'YOUR_GMAIL@gmail.com');
```

- [ ] Reload the app. The **Admin** section (Users and App settings) should appear in the sidebar.

## 6. Deploy to GitHub Pages (about 5 min)

- [ ] In the `study-split-app` repo on GitHub, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
- [ ] Go to **Settings → Secrets and variables → Actions → Variables** and add these. They are *Variables*, not secrets, because they're public anyway:
  - `VITE_SUPABASE_URL`: the same value as in `.env.local`
  - `VITE_SUPABASE_ANON_KEY`: the same value as in `.env.local`
  - `VITE_GOOGLE_CLIENT_ID`: `1039316720394-gjd5fqrjf9oe9ip4vg67r64sq0hq6ers.apps.googleusercontent.com`
- [ ] Merge the `phase-0-foundation` branch into `main` through a pull request. That triggers the deploy:
  <https://github.com/pankajsoni22/study-split-app/pull/new/phase-0-foundation>
- [ ] Open <https://pankajsoni22.github.io/study-split-app/> and sign in on the live site.

## 7. Keep-alive and backups (before you write real content)

**Second keep-alive pinger.** GitHub turns off scheduled jobs after 60 days without commits, so add a second one.

- [ ] At <https://cron-job.org>, create a job that runs **every day** (any time) with these settings:
  - Method: **GET**, and leave the request body **empty**
  - URL: `https://zomiawpvdgazykrwkgjl.supabase.co/rest/v1/rpc/ping`
  - Header: `apikey` = the publishable key (`VITE_SUPABASE_ANON_KEY` in `.env.local`, starts `sb_publishable_`)
  - **Test run** must show **200** and `"ok:1"`. A **400 "Bad request"** means the body isn't valid JSON (e.g. backticks
    or curly quotes pasted in): use GET with no body. **401** means the key is wrong.

**Weekly encrypted backups.** Supabase Free has no automatic backups.

- [ ] Run `sudo apt install age && age-keygen -o ~/study-split-backup.key`.
  Keep that key file private and copy it somewhere safe off this machine. Without it, backups can't be read.
- [ ] In GitHub, add the **variable** `BACKUP_AGE_RECIPIENT` with the `age1…` public key that the keygen command printed.
- [ ] Add the **secret** `SUPABASE_DB_URL` with the *Session pooler* connection string from Supabase → **Connect**, with your database password filled in.
  Common mistakes (the workflow's first step now names each one in plain words):
  - `[YOUR-PASSWORD]` replaced but the **square brackets left** in;
  - a password with symbols: `@` must be written `%40`, `#` → `%23`, `/` → `%2F`, `:` → `%3A`, `?` → `%3F`.
    Easiest: reset the password to letters and numbers only (Project Settings → Database);
  - the **Direct connection** string (`db.<ref>.supabase.co`, IPv6-only, which GitHub can't reach) or the
    **Transaction** pooler (port 6543). Use the **Session** pooler (port 5432, user `postgres.<ref>`).
- [ ] Test it: **Actions → Backup database → Run workflow**. If it fails, open the run: the red annotation at the
  top says what to fix. (A yellow "Node.js 20 is deprecated" note was only a warning, and is gone since 2026-11-25.)
- [x] First backup succeeded (2026-11-25, 32 KB). Backups now run **every Sunday 02:41 UTC** and are kept **90 days**.

### Where the backups are, and how to check one

1. GitHub → **Actions** → **Backup database** → open a green run.
2. Scroll to the **bottom** of the run page → **Artifacts** → click **db-backup**. It downloads as `db-backup.zip`.
   You must be signed in to GitHub to see it. Anyone signed in can download it, which is why it's encrypted.
3. In WSL (replace `<you>` with your Windows user name):
   ```bash
   cd /mnt/c/Users/<you>/Downloads
   unzip db-backup.zip
   age -d -i ~/study-split-backup.key study-split-db-*.tar.gz.age | tar -tz     # list only
   ```
   Expected: `backup/roles.sql`, `backup/schema.sql`, `backup/data.sql`. If `age` says "no identity matched any of
   the recipients", the key file doesn't belong to this backup (check `BACKUP_AGE_RECIPIENT`).
4. To unpack the files: `age -d -i ~/study-split-backup.key study-split-db-*.tar.gz.age | tar -xz`. This creates
   `backup/` with the three `.sql` files (roles, schema and data). They contain all user data, so delete them when
   done.

### Restoring (only after a disaster)

Restore into a **new, empty Supabase project**, never over a live one. This follows Supabase's documented restore
procedure and has **not been rehearsed** yet.
1. Create a new Supabase project. Copy its **Session pooler** connection string (as in Part D of this step).
2. In WSL, once: `sudo apt install postgresql-client`.
3. Unpack the backup (step 4 above), then:
   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file backup/roles.sql --file backup/schema.sql \
     --command 'SET session_replication_role = replica' \
     --file backup/data.sql \
     --dbname "postgresql://postgres.<new-ref>:<password>@<pooler-host>:5432/postgres"
   ```
4. Point the app at the new project: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in GitHub variables and
   `.env.local`; Google provider settings (step 3); e-mail sign-in off.
5. **Not in the backup:** files in Supabase **Storage** (images, once uploads exist in increment 1c). Today there are
   none. When uploads arrive, the backup must be extended to include them.

### How much the free plans can hold

Measured 2026-11-25: production holds **4 articles, 12 published versions, 728 KB** of app data (12 MB with
Postgres's own overhead). A backup is **32 KB**.

| Limit | Free allowance | What it means for us |
|---|---|---|
| **Supabase database size** | 500 MB per project | The real ceiling. One article is about 5 KB (draft) plus about 7 KB per published version (up to 20 kept), so 15–150 KB. That's roughly **3,000 heavily-revised to 30,000+ lightly-revised articles**. |
| **GitHub artifact storage** | 500 MB on GitHub Free (shared with Packages). GitHub's docs don't clearly say whether public repos are exempt, so we assume the 500 MB applies. | 13 weekly backups are kept (90 days). They fit while each backup stays **under ~38 MB**, i.e. until roughly **150 MB** of app data. |
| **GitHub Actions minutes** | Free for public repositories (standard runners) | Unlimited for this job (it takes about 1 minute). |
| **Supabase Storage (files)** | 1 GB | Not used yet; not included in backups (see Restoring, point 5). |

**When to act:** when a backup passes **~30 MB** (it shows on the run page next to **db-backup**), lower
`retention-days` in `.github/workflows/backup.yml` from 90 to 30 (keeps about 5 backups). If the database nears
500 MB, the options are Supabase Pro or moving old published versions out.

---

## What only you can provide

| Needed | Why I can't fill it |
|---|---|
| Supabase Project URL + anon key | The project doesn't exist yet. Create it in step 1. |
| Supabase database password | Created by you in step 1, and it should never be in the repo |
| Your sign-in Gmail (for the admin SQL) | Personal data. It stays in the SQL Editor only, never in the repo. |
| Google console access | Needs your Google login (step 2) |
| GitHub repo settings | Needs your GitHub login (step 6) |
| age backup key | Must be generated and kept only by you (step 7) |

## Done?

When steps 1–6 work, Phase 1 starts: the split editor with Excalidraw, sections linked to canvas frames, save with Ctrl+S, and publish.
Note any error you hit along the way.
