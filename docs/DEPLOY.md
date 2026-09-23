# Deploying StudyFlow to Vercel

The app is a standard Next.js App Router project with no build-time
configuration: `next build` succeeds with **no environment variables at all**
(verified). Everything is validated at the point of use, so a missing key
produces an actionable message in the running app rather than a failed build.

That is convenient and also a trap — **a deployment with no keys will build
and deploy perfectly happily, and then fail to sign anyone in.** Work through
all four steps.

---

## 1. Run the migrations

Supabase SQL Editor, in order:

```
supabase/migrations/0001_auth_and_profiles.sql
supabase/migrations/0002_core_schema.sql
supabase/migrations/0003_fix_composite_fk_set_null.sql
supabase/migrations/0004_planning_window.sql
```

If the project is already live, only `0004` is outstanding. Until it runs,
**Settings → Save changes fails** with a PostgREST `PGRST204` error, because
the form writes `study_until` and `settle_minutes` and those columns do not
exist yet. Nothing else is affected — the planner falls back to 21:00.

---

## 2. Import the repo

Vercel → Add New → Project → import `AlphaMugisha/study-tracker`.

Framework preset **Next.js**, root directory `./`. Leave the build and output
settings alone; the defaults are right and there is no `vercel.json` to
override them.

---

## 3. Environment variables

Vercel → Project → Settings → Environment Variables. Set all three for
**Production, Preview and Development**:

| Name | Value | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Public — safe in the browser bundle |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the publishable / anon key | Public by design; every query it makes is still bound by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | the secret key | **Server only.** Bypasses RLS entirely |

The values are the same ones in your local `.env.local`.

Two rules that matter more than they look:

- **Never prefix the service-role key with `NEXT_PUBLIC_`.** That prefix is
  what tells Next to inline a value into the client bundle, and this key
  bypasses every Row Level Security policy in the database. A key that reaches
  a browser is a key that has to be rotated.
- The anon key being public is not an oversight. It identifies the project,
  not the user, and RLS is what constrains it.

The app reads `SUPABASE_SERVICE_ROLE_KEY` only from scripts run on your own
machine (`npm run seed`, `npm run role`, `npm run password`), never from a
request path — so strictly it is optional on Vercel. Set it anyway if you want
to run those scripts against production.

---

## 4. Tell Supabase about the new domain

**This is the step that silently breaks auth if skipped.**

Supabase → Authentication → URL Configuration:

- **Site URL** — `https://<your-project>.vercel.app`
- **Redirect URLs** — add both:
  ```
  https://<your-project>.vercel.app/**
  https://*-<your-team>.vercel.app/**
  ```

The app builds its own callback URL from the incoming request's `Host` header
(`siteOrigin()` in `lib/actions/auth.ts`), so it adapts to any domain without
configuration. But Supabase refuses to redirect to a URL that is not on its
allowlist — so without this, **confirmation and password-reset emails will
bounce the user to `localhost:3000`**, which works fine on your machine and
nowhere else.

The second pattern covers Vercel's per-deployment preview URLs. Skip it if you
do not want preview deployments to be able to complete an auth flow.

---

## After deploying

Check, in this order:

1. `/login` loads and does **not** show the amber "Supabase is not connected"
   notice. If it does, the env vars did not take — redeploy after setting them;
   Vercel does not apply new variables to an existing build.
2. Sign in. Failure here with correct credentials usually means step 4.
3. `/dashboard` renders with your data.
4. `/settings` → Save changes succeeds. Failure means `0004` has not run.
5. Add a subject, then a timetable slot, then homework.

---

## Things that are true in production and not locally

- **Timezone.** `resolve-temporary.ts` reads the *server's* clock, not
  `profiles.timezone`. On your laptop those agree; on Vercel the server is UTC.
  So "what am I doing right now" will be wrong by your UTC offset until Phase
  3B replaces that resolver. This is the single biggest reason not to treat the
  deployed dashboard as authoritative yet.
- **`demoFallback`.** The same resolver deliberately parks the current-activity
  card mid-lesson when outside school hours, so the card is never empty. That
  is a review aid, not real behaviour, and it ships.
- **Email delivery.** Supabase's built-in SMTP is rate-limited and aimed at
  development. Password resets and confirmations will be slow or throttled
  under real use; configure a custom SMTP provider in Supabase before that
  matters.

## Rolling back

Vercel → Deployments → the previous one → Promote to Production. Nothing in
this app stores state in the deployment itself; all state is in Supabase, so a
rollback is safe and instant. Migrations are the exception — they are not
reverted by a rollback, and none of `0001`–`0004` are destructive.
