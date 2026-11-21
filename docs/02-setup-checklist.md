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

## 4. Run the app locally (about 3 min)

- [ ] Open `.env.local`, which already exists, and fill in the two empty values from step 1:
  - `VITE_SUPABASE_URL=https://<your-ref>.supabase.co`
  - `VITE_SUPABASE_ANON_KEY=<anon / publishable key>`
- [ ] Run `npm run dev` and open <http://localhost:5173/study-split-app/>.
- [ ] Sign in with Google, then accept or change your username.

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

- [ ] At <https://cron-job.org>, create a job that runs **every 3 days** with these settings:
  - Method: **POST**
  - URL: `https://<your-ref>.supabase.co/rest/v1/rpc/ping`
  - Headers: `apikey: <anon key>` and `Content-Type: application/json`

**Weekly encrypted backups.** Supabase Free has no automatic backups.

- [ ] Run `sudo apt install age && age-keygen -o ~/study-split-backup.key`.
  Keep that key file private and copy it somewhere safe off this machine. Without it, backups can't be read.
- [ ] In GitHub, add the **variable** `BACKUP_AGE_RECIPIENT` with the `age1…` public key that the keygen command printed.
- [ ] Add the **secret** `SUPABASE_DB_URL` with the *Session pooler* connection string from Supabase → **Connect**, with your database password filled in.
- [ ] Test it: **Actions → Backup database → Run workflow**.
- [ ] To restore a backup: `age -d -i ~/study-split-backup.key study-split-db-DATE.tar.gz.age | tar -xz`

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
