# StudyFlow

A personal academic assistant for one student. It answers four questions the
moment she opens it:

1. What am I doing right now?
2. What is next?
3. What do I need to do when I get home?
4. What homework is due?

## Status

**Phase 0 — foundation.** Design system, app shell, routing skeleton and
Supabase client structure. No features yet; every route under `(app)` is a
labelled placeholder.

## Running it

```bash
npm install
npm run dev
```

Then open **http://localhost:3000**.

> This folder sits inside `xampp/htdocs`, but Apache does not serve it. Next.js
> runs its own dev server on port 3000.

| Command             | What it does                        |
| ------------------- | ----------------------------------- |
| `npm run dev`       | Dev server on :3000                 |
| `npm run build`     | Production build                    |
| `npm run start`     | Serve the production build          |
| `npm run typecheck` | `tsc --noEmit`                      |
| `npm run lint`      | ESLint                              |

No environment variables are required to run Phase 0. See `.env.example` for
what each later phase introduces.

## Routes

| Route         | State                              |
| ------------- | ---------------------------------- |
| `/dashboard`  | Placeholder — Phases 5–7           |
| `/timetable`  | Placeholder — Phase 4              |
| `/homework`   | Placeholder — Phase 6              |
| `/plan`       | Placeholder — Phase 7              |
| `/settings`   | Placeholder — Phases 1 and 9       |
| `/styleguide` | **Live** — visual system reference |

## Layout of the code

```
src/
  app/
    (app)/            student routes, wrapped in the AppShell
    styleguide/       internal design-system reference
    globals.css       ALL design tokens live here
    layout.tsx        fonts + metadata
  components/
    layout/           AppShell, Sidebar, MobileNav, PageHeader, Logo
    ui/               shadcn primitives + EmptyState
  lib/
    env.ts            validated, lazily-read environment access
    nav.ts            navigation config
    supabase/         client.ts (browser) · server.ts (RSC) · proxy.ts (session)
    utils.ts          cn()
  types/
    database.ts       placeholder until Phase 2 generates the real types
```

## Design system

Defined once in `src/app/globals.css`, verifiable at `/styleguide`.

- **Ground** warm off-white `#faf9f6`, **ink** charcoal `#1f2328`
- **Primary** muted sage `#5e8062` — what is happening *now*
- **Secondary** soft lavender `#7b74a8` — what is *coming*
- **Supporting** warm cream `#f4eee1` — breaks and free periods
- **Type** Geist Sans, self-hosted, tabular numerals on anything that ticks
- **Radius** 6px buttons / 8px controls / 10px cards
- **Elevation** two steps; only interactive cards lift on hover
- **Motion** section entrance, hover lift, progress-bar width. Nothing else.

Components must reference semantic tokens (`bg-sage`, `text-ink-muted`), never
raw hex. That indirection is what will make a dark theme a single extra block.

## Architecture notes

- **Next.js 16** renamed the `middleware.ts` convention to `proxy.ts`. The
  Supabase session helper is at `src/lib/supabase/proxy.ts`; `src/proxy.ts`
  itself is wired up in Phase 1.
- **Authorization lives in the database.** Row Level Security is the boundary
  (Phase 2), not the client and not the route guard.
- **Timetable extraction is behind an interface.** `TimetableExtractor` has a
  `mock` implementation by default, so no AI provider or API key is needed
  during development. The real provider is connected in Phase 8.
