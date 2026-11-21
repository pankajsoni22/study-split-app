# Study Split: setup checklist (before Phase 1)

Do these in order. Steps 1–6 take about 30 minutes. Step 7 can wait until before you write real content.
Tick each box as you go.

---

## 1. Create the Supabase project (about 5 min)

- [ ] Go to <https://supabase.com>, choose **New project**, and pick the region nearest your readers (for example Mumbai, `ap-south-1`).
- [ ] Save the **database password** in a password manager. Backups need it.
- [ ] Open **SQL Editor**, paste all of [`supabase/migrations/20261121000000_init.sql`](../supabase/migrations/20261121000000_init.sql), and click **Run**. It should end with *Success*.
  This file has never been run against a real database, so report any error you see.
- [ ] Open **Project Settings → API** and copy the **Project URL** and the **anon / publishable key**.

## 2. Create the Google sign-in client (about 10 min)

- [ ] Go to <https://console.cloud.google.com>. You can reuse the soni-siblings Google Cloud project or create a new one.
- [ ] Go to **Google Auth Platform → Clients → Create client → Web application** and name it `Study Split`.
- [ ] Under **Authorized JavaScript origins**, add:
  - `http://localhost:5173`
  - `https://pankajsoni22.github.io`

  You don't need any redirect URIs.
- [ ] Copy the **Client ID** and **Client secret**.
- [ ] Under **Audience**, click **Publish app** so the status is *In production*. Otherwise only listed test users can sign in.
  The basic email and profile scopes don't need Google verification.

## 3. Connect Google to Supabase (about 2 min)

- [ ] In Supabase, go to **Authentication → Sign In / Providers → Google** and turn it on.
- [ ] Paste the **Client ID** into the client IDs field and the **Client secret** into the secret field.
- [ ] Leave **Skip nonce check** turned **off**, then save.

## 4. Run the app locally (about 3 min)

```bash
cd ~/projects/study-split-app
cp .env.example .env.local
```

- [ ] Edit `.env.local` and fill in `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_GOOGLE_CLIENT_ID`.
- [ ] Run `npm run dev` and open <http://localhost:5173/study-split-app/>.
- [ ] Sign in with Google, then accept or change your username.

## 5. Make yourself admin (1 min)

- [ ] In the Supabase SQL Editor, run this with your Gmail address:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'YOUR_GMAIL@gmail.com');
```

- [ ] Reload the app. The **Admin** section (Users and App settings) should appear in the sidebar.

## 6. Deploy to GitHub Pages (about 5 min)

- [ ] In the GitHub repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
- [ ] Go to **Settings → Secrets and variables → Actions → Variables** and add these. They are *Variables*, not secrets, because they're public anyway:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_GOOGLE_CLIENT_ID`
- [ ] Merge the `phase-0-foundation` branch into `main`, through a pull request. That triggers the deploy.
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

## Done?

When steps 1–6 work, Phase 1 starts: the split editor with Excalidraw, sections linked to canvas frames, save with Ctrl+S, and publish.
Note any error you hit along the way.
