# My Journal ai

This project was inspired by my move to Boston, MA, to pursue my master’s in Computer Science. Since moving, I’ve realized how many memories and experiences I want to capture, but I don’t always have the time or energy to write them down. It’s much easier for me to talk about my day and express my thoughts out loud. I want this app to feel like a friend, someone I can talk to, share my experiences with, and preserve the little moments that make life meaningful.

Record a voice note. The browser transcribes it and Claude turns it into a diary entry: bullet points of what happened, places, people and a feeling emoji. The Journal page groups entries by day.

Dependencies: React only. Supabase is called with plain `fetch`.

## How it works

1. **Record** (`src/pages/Record.tsx`): `MediaRecorder` captures audio while the browser's speech recognition transcribes it live (Chrome, Edge, Safari; not Firefox).
2. On stop, the audio goes to the private Storage bucket `recordings`. A row goes to `entries` with the metadata: time, duration, format, size, language and transcript.
3. The edge function `smart-responder` (`supabase/functions/smart-responder/index.ts`) runs on Supabase's servers:
   - sends the transcript to **Claude** (`claude-opus-5-5`), which returns `bullets`, `places`, `people`, `feeling_emoji` and `feeling_label`;
   - saves everything on the row.
4. **Journal** (`src/pages/Journal.tsx`) shows each day with its places, people and emojis, then each note with its time, bullets and transcript.

The Anthropic key only lives inside the edge function. They never reach the browser.

## Setup

You need 3 values: 2 public Supabase values for the browser, and the Anthropic key stored as a Supabase secret.

| Value | Where it goes | Public? |
|---|---|---|
| Project URL | `.env` | yes |
| Publishable key | `.env` | yes |
| Anthropic API key | Supabase secret `ANTHROPIC_API_KEY` | **no** |

### 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) (the free plan is enough) and click **New project**.
2. Pick a name, a database password (save it, though this app doesn't use it) and a region near you. Wait about 2 minutes while it starts.

### 2. Create the table and the audio bucket

1. In the left sidebar, open **SQL Editor** and click **New query**.
2. Paste the whole content of `supabase/schema.sql` and click **Run**. It should say "Success. No rows returned".
3. To check: **Table Editor** should list `entries`, and **Storage** should list a `recordings` bucket.

### 3. Get the Supabase URL and publishable key

1. Create a `.env` file in the project root (it is git-ignored) with `VITE_SUPABASE_URL=` and `VITE_SUPABASE_PUBLISHABLE_KEY=`.
2. **Project URL:** click **Connect** in the top bar of the dashboard, or go to **Project Settings** (gear icon at the bottom of the sidebar), then **Data API**. Copy the URL, which looks like `https://abcdefghij.supabase.co`, into `VITE_SUPABASE_URL`.
3. **Publishable key:** go to **Project Settings → API Keys** and copy the **Publishable key** (`sb_publishable_...`) into `VITE_SUPABASE_PUBLISHABLE_KEY`.
   - Older projects can use the **anon public** key from the **Legacy API Keys** tab instead.
   - Never use the **secret** (`sb_secret_...`) or **service_role** key in the app: it skips all security rules. The edge function gets that key automatically, so you never copy it anywhere.
4. The part between `https://` and `.supabase.co` is your **project ref**. You'll need it in step 4. (It also appears in **Project Settings → General → Project ID**.)

### 4. Get the Anthropic key and deploy the edge function

**Get the key:** [platform.claude.com](https://platform.claude.com), then **API Keys → Create Key**. Add credit under Billing. The key is shown only once, so paste it straight into the next step.

**Option A: dashboard (no install)**

1. Sidebar → **Edge Functions → Secrets**. Add `ANTHROPIC_API_KEY` with its value.
2. **Edge Functions → Deploy a new function → Via Editor**. Name it exactly `smart-responder`, paste the content of `supabase/functions/smart-responder/index.ts` and click **Deploy**.
3. Open the function → **Details** (or Settings) and turn **off** "Verify JWT with legacy secret" (also called "Enforce JWT verification"). The app has no login, so requests carry no user token.

**Option B: Supabase CLI**

```bash
brew install supabase/tap/supabase
supabase login                                  # opens the browser to authorize
supabase link --project-ref <your-project-ref>
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy smart-responder --no-verify-jwt
```

### 5. Accounts: you and the hiring-manager demo

1. **Turn off public sign-ups** so nobody else can create accounts and spend your AI credit: **Authentication → Sign In / Providers → Email**, turn off **Allow new users to sign up**, then save.
2. **Create the two users** in **Authentication → Users → Add user → Create new user**, ticking **Auto Confirm User** each time:
   - **You:** your email and a password.
   - **Hiring managers:** email `demo@myjournalai.com` (or another name + `@myjournalai.com`) and a password you share with them. They sign in with just the username (`demo`); the app adds `@myjournalai.com`.
3. Open `supabase/auth.sql`, replace the two emails at the top with these, then paste the file in **SQL Editor** and click **Run**.

The SQL script:
- links every recording to its user, so each account only sees its own (existing recordings go to you);
- marks the demo account: at most **2 recordings at a time**, and no audio is stored for it, only the transcript and the AI results;
- schedules an hourly job (`pg_cron`) that deletes demo recordings older than **7 days**, which also frees up their 2 slots.

### 6. Run

```bash
npm install
npm run dev
```

Open http://localhost:5173 in Chrome, Edge or Safari, allow the microphone and record.

**If something fails:** the error appears under the mic button. The function's own logs are under **Edge Functions → smart-responder → Logs**.

## Important

- Only the accounts you create can sign in, as long as sign-ups stay off (step 5).
- The 2-recording limit is enforced by the database itself (row-level security), not just hidden in the app.
- Changing the limit means changing `2` in `supabase/auth.sql` (`can_add_entry`) and `DEMO_LIMIT` in `src/lib/supabase.ts`.
