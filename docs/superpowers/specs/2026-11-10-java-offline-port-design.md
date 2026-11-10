# StudyFlow on the desktop: a Java port that works offline

*Design, 2026-11-10.*

## The problem

StudyFlow is a Next.js app against Supabase. Every page is a server component
and every write is a server action, so the product is unusable without a
network. The student needs it in the evening, at home, on a connection that is
not always there — which is exactly when the evening planner is the whole point
of the product.

## What we are building

A JavaFX desktop application. It keeps a full local copy of the student's
academic data in an embedded database, works with no network at all,
and pushes the evening's work up to Supabase when one returns.

A shortcut on the Desktop launches it. No terminal, no `next dev`, no
localhost.

### Decisions taken, and why

| Decision | Why |
|---|---|
| **JavaFX desktop app**, not a local web server | The operator asked for an icon to click. A browser pointed at localhost is not that. |
| **Student side only.** `/admin` and reports stay on the web | The parent is on another machine and generally online. Porting their side would mean two offline writers on the same rows, which turns sync from an outbox into a distributed-systems problem. |
| **PostgREST + GoTrue over HTTP**, never JDBC to Postgres | Keeps the entire RLS model enforced server-side, unchanged. A direct database connection would need the service password and would bypass every policy in 0001–0009. |
| **Outbox of intents**, not row-level last-write-wins | Intents preserve meaning. "Complete assignment X" is idempotent and touches one column; shipping a whole row would clobber fields the student never edited — including a linked adult's timetable edit, the one cross-account write the product allows. |
| **Full-snapshot pull**, except `activity_logs` | The dataset is a few hundred rows. A full pull is cheaper than tracking tombstones and makes cloud deletes resolve for free. `activity_logs` is append-only and unbounded, so it pulls incrementally by `created_at`. |
| **Push before pull, always** | Pulling first would overwrite local rows whose intents have not been sent. |
| **H2 embedded, unencrypted** | Pure Java, no per-platform native library to ship. Encryption and the passphrase that went with it were **removed after review** — see the amendment at the foot of this document. |
| **Zero new cloud migrations** | The outbox and sync state are local-only. Push uses tables that already exist; pull is a read. Nothing to apply by hand. |

### Not in scope

- `/admin`, `/admin/reports`, the support-access request flow. Web only.
- AI timetable extraction. Vision models need a network; offline the upload
  screen says so, and typed entry still works because parsing is pure.
- Changing anything in the Next.js app or the SQL migrations.

## Architecture

Four Gradle modules, layered so the valuable part is testable with no UI and
no network:

```
studyflow-java/
  domain/   pure Java 23. No JavaFX, no JDBC, no HTTP.
  store/    H2, schema, outbox, repositories.
  sync/     GoTrue + PostgREST clients, SyncEngine, connectivity.
  ui/       JavaFX. Views, theme, school-day ticker, desktop packaging.
```

`domain` depends on nothing. `ui` never speaks HTTP; it reads `store` and asks
`sync` to run.

### domain

The TypeScript discriminated unions become **sealed interfaces over records**,
which makes every `switch` exhaustive at compile time — stronger than the
original.

Ported, module by module:

| TypeScript | Java | Notes |
|---|---|---|
| `timetable/types.ts` | `ResolvedEntry`, `TimetableState`, `Times` | |
| `timetable/resolve.ts` | `TimetableResolver`, `SchoolClock` | `ZonedDateTime` replaces `Intl`; natively DST-correct |
| `presence/describe.ts` | `PresenceDescriber` | Every string stays an **expectation**, never an observation |
| `tasks/ordering.ts` | `TaskOrdering` | `byUrgency` is the shared sort; the planner does not invent its own |
| `planner/build-plan.ts` | `EveningPlanner` | Cutoff, splitting, earned breaks, deferral |
| `planner/suggest-study.ts` | `StudySuggester` | Weights and reasons carried over verbatim |
| `planner/catchup.ts` | `CatchupPlanner` | Before-the-deadline rule; `LocalDate` replaces UTC date arithmetic |
| `report/daily.ts` | `DailyReportBuilder` | Day keys in **her** timezone |
| `format.ts` | `Display` | Fixed month/weekday tables, as in the original |

Two invariants move out of Postgres and into `domain`, because H2 has no
`btree_gist`: **no two entries overlap** and **no two active versions cover the
same day**. They become validators — which is where the UI needed them anyway,
to report the clash nicely rather than as a constraint violation.

### Parity testing

This is what makes the port safe rather than hopeful. The existing
`scripts/test-*.mjs` files already encode the behaviour. Their fixtures move to
shared JSON, both implementations run over them, and the outputs are diffed. A
Java planner that disagrees with the TypeScript one fails the build.

### store

H2, file mode. Tables mirror the Postgres ones minus RLS — meaningless in a
single-user file — plus three local-only:

| Table | Purpose |
|---|---|
| `outbox` | `seq`, `entity_type`, `entity_id`, `kind`, `payload` (JSON), `status`, `attempts`, `last_error` |
| `sync_state` | pull watermark per table |
| `auth_state` | user id, email, Supabase refresh token, last online auth. Its presence is also what decides setup versus straight-to-the-app |

`activity_logs` stays append-only locally too, via a `BEFORE UPDATE` trigger
that raises. Same reasoning as 0002: not something anyone gets to do by
accident.

### sync

- **`GoTrueClient`** — `grant_type=password` on first run,
  `grant_type=refresh_token` thereafter.
- **`PostgrestClient`** — bearer JWT plus the anon apikey, asking for the
  representation back.
- **`SyncEngine`** — push then pull, in that order.
  - Push drains `outbox` by `seq`, grouped by entity so order holds where it
    matters. A rejection (RLS refused, row gone, constraint failed) marks that
    intent rejected, keeps it, surfaces it, and does not block the rest.
  - Pull replaces local with cloud truth. Since push already landed, the
    evening's work *is* cloud truth. A rejected intent is corrected by the
    pull, and the student is told rather than left with a local lie.
- **`Connectivity`** — an authenticated probe on a schedule plus manual retry.
  Not `InetAddress.isReachable`, which lies.

### ui

Five student views, Settings, and school mode. The school-day lock stays: it is
a product rule about not spending a lesson in the app, not a web artifact.

A JavaFX `Timeline` ticking each second drives the resolver through an
observable property — a better fit than the React `use-tick` hook, since the
countdown updates without re-rendering a tree.

**Settings keeps the oversight disclosure.** `docs/DATABASE.md` is explicit
that access which cannot be *discovered* is a different thing entirely, and
that the disclosure is schema-enforced rather than UI-trusted. Offline it shows
the last pulled answer together with when it was pulled — never a blank, which
would read as "nobody".

Design tokens come across from `globals.css` to a JavaFX stylesheet. Built
single-column-friendly, per the operator's viewport.

### Packaging

`jpackage --type app-image` so no WiX or Inno Setup is needed, then a shortcut
on the Desktop via WScript.Shell. The Desktop is OneDrive-redirected on this
machine, so the path is read from the shell rather than assumed.

## Phasing

Six phases. Packaging is brought forward to phase 4 so there is an icon to
click as early as there is a window to show.

| # | Phase | Proves |
|---|---|---|
| 1 | domain + parity tests | the brain is correct in Java |
| 2 | store, schema, outbox, passphrase | it persists and it locks |
| 3 | sync against real Supabase | an offline evening lands in the cloud |
| 4 | JavaFX shell + Today + **desktop icon** | the product's promise, clickable |
| 5 | Homework, Plan, Timetable, Stuck on, Settings | feature parity |
| 6 | Trimmed runtime, installer polish | it runs on a machine with no JDK |

## Risks

| Risk | Mitigation |
|---|---|
| Ported planner silently disagrees with the original | Parity fixtures, phase 1, before any UI exists |
| Lost passphrase | Data is a cache, not the record. Re-login online re-downloads it. Said plainly in the UI. |
| Clock skew on the laptop | Intents carry no timestamps that decide outcomes; the server sets `updated_at`. A direct consequence of choosing intents over last-write-wins. |
| `0009_school_catchup.sql` may not be applied in the cloud | Catch-up code degrades gracefully, exactly as the TypeScript does — the feature goes quiet rather than erroring |
| H2 AES is not SQLCipher | Documented. Switchable later; nothing above depends on the cipher choice. |


---

## Amendment, 2026-11-10: no passphrase

The design above specified an encrypted local copy unlocked by a passphrase,
and it was built that way. On seeing it, the operator asked what a passphrase
was — which is itself the finding: a second password with no explanation reads
as the app being broken, and this one would have been typed every single
launch.

Offered the trade-off explicitly, they chose **no gate at all**. So:

- H2 opens unencrypted. `Passphrase`, `WrongPassphraseException` and the Bouncy
  Castle dependency are gone.
- The plaintext sidecar that held the Argon2 salt is gone too. Whether setup
  has happened is now read from the `auth_state` row, so there is no second
  marker file to fall out of step with the database.
- `UnlockView` became `SetupView`: shown on first run, and again only if the
  saved session is revoked.

**What this costs, stated plainly:** anyone who can use this Windows account
can read the whole academic record off disk, and can act as the student against
Supabase using the stored refresh token until it is revoked. That is a
reasonable trade for a machine that stays at home and a bad one for a laptop
that travels. It is surfaced in the Settings card rather than left implicit,
and `LocalDatabase.open` carries the note on how to reinstate it.
