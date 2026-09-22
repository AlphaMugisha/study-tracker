# StudyFlow

A personal academic assistant for one student. It answers four questions the
moment she opens it:

1. What am I doing right now?
2. What is next?
3. What do I need to do when I get home?
4. What homework is due?

## Status

**Phase 1 — accounts.** Sign up, sign in, sign out, session persistence and
route guarding, on Supabase Auth. The feature pages (`/timetable`,
`/homework`, `/plan`, `/settings`) are still labelled placeholders, and
`/dashboard` is a placeholder that only proves authentication works.

## Setup

### 1. Create a Supabase project

<https://supabase.com/dashboard> → **New project**. Any region; note the
database password somewhere safe.

### 2. Run the migration

Copy `supabase/migrations/0001_auth_and_profiles.sql` into the Supabase
dashboard's **SQL Editor** and run it. (Or `supabase db push` if you use the
CLI.) It is idempotent — re-running is safe.

This creates the `user_role` enum, the `profiles` table, its RLS policies, the
column grants that stop a user editing their own role, and the trigger that
creates a profile for every new account.

### 3. Configure the environment

```bash
cp .env.example .env.local
```

Fill in from **Project Settings → API**:

| Variable | Where | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project API keys → `anon` `public` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Project API keys → `service_role` | Not yet (Phase 2) |

`NEXT_PUBLIC_*` values are inlined at build time — restart the dev server after
editing `.env.local`.

### 4. Decide about email confirmation

**Authentication → Sign In / Providers → Email**, in the Supabase dashboard.

- **Confirm email OFF** — signup logs you straight in and lands on
  `/dashboard`. Simplest for development.
- **Confirm email ON** (the default) — signup shows a *"Check your email"*
  screen instead. The emailed link returns to `/auth/callback`, which
  exchanges it for a session. Both paths are implemented.

If it is on, add `http://localhost:3000/auth/callback` under
**Authentication → URL Configuration → Redirect URLs**.

### 5. Run it

```bash
npm install
npm run dev
```

<http://localhost:3000>

> This folder lives under `xampp/htdocs`, but Apache does not serve it — Next
> runs its own server. **Port 3000 was occupied on this machine**; use
> `npm run dev -- -p 4400` if you hit `EADDRINUSE`.

| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## Routes

| Route | Access | State |
|---|---|---|
| `/` | any | Redirects by session |
| `/login` | signed out | **Live** |
| `/signup` | signed out | **Live** |
| `/forgot-password` | signed out | **Live** |
| `/reset-password` | recovery link | **Live** |
| `/auth/callback` | any | **Live** — email link handler |
| `/dashboard` | signed in | Placeholder — Phases 5–7 |
| `/timetable` | signed in | Placeholder — Phase 4 |
| `/homework` | signed in | Placeholder — Phase 6 |
| `/plan` | signed in | Placeholder — Phase 7 |
| `/settings` | signed in | Placeholder — Phases 1 and 9 |
| `/styleguide` | any | **Live** — design reference |

## Layout of the code

```
supabase/migrations/   SQL, run against your project
src/
  proxy.ts             session refresh + route guarding (Next 16 renamed
                       middleware.ts to proxy.ts)
  app/
    (auth)/            login, signup, forgot-password, reset-password
    (app)/             signed-in routes, wrapped in the AppShell
    auth/callback/     exchanges emailed links for a session
    styleguide/        design-system reference
    globals.css        ALL design tokens
  components/
    auth/              shell, forms, fields, password toggle
    layout/            AppShell, Sidebar, MobileNav, PageHeader, Logo
    ui/                shadcn primitives + EmptyState
  lib/
    actions/auth.ts    server actions: sign up / in / out, password reset
    auth.ts            getUser, getSessionContext, requireSessionContext
    auth-redirect.ts   route classification + open-redirect sanitiser
    env.ts             lazily-validated environment access
    supabase/          client.ts (browser) · server.ts (RSC) · proxy.ts
  types/database.ts    hand-written until the schema grows
```

## Security model

Four layers, in order of authority:

1. **Row Level Security** is the boundary. Both the browser client and the
   server client use the anon key and are equally constrained by it.
2. **Column grants** stop privilege escalation. RLS lets a user update their
   own profile row, which without `grant update (full_name, timezone)` would
   include `role` — any student could make themselves an admin. Changing a
   role requires the service role key.
3. **`requireSessionContext()`** on each protected page, so a page is never one
   config edit away from leaking.
4. **`src/proxy.ts`** for the redirects. Convenience, not security.

Also: `getUser()` everywhere on the server, never `getSession()` — only the
former revalidates the JWT rather than trusting the cookie. And `?next=` is
sanitised to same-origin paths so the login page cannot be turned into an open
redirect.

## Design system

Defined once in `src/app/globals.css`, verifiable at `/styleguide`.

- **Ground** warm off-white `#faf9f6`, **ink** charcoal `#1f2328`
- **Primary** muted sage `#5e8062` — what is happening *now*
- **Secondary** soft lavender `#7b74a8` — what is *coming*
- **Supporting** warm cream `#f4eee1` — breaks, and the auth card footer
- **Type** Geist Sans, self-hosted, tabular numerals on anything that ticks
- **Radius** 6px buttons / 8px controls / 10px cards
- **Elevation** two steps; only interactive cards lift on hover
- **Motion** section entrance, hover lift, progress-bar width. Nothing else.

Components reference semantic tokens (`bg-sage`, `text-ink-muted`), never raw
hex, so a dark theme stays a single extra block.
