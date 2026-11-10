# StudyFlow on the desktop

The student side of StudyFlow as a JavaFX application. It keeps a full
encrypted copy of her academic data on the machine, works with no network at
all, and pushes the evening's work up to Supabase when one returns.

The parent side stays on the website. See
[the design](../docs/superpowers/specs/2026-11-10-java-offline-port-design.md)
for why.

## Build it

```bash
bash packaging/build-app.sh
```

That runs the tests, draws the icon, packages the app with a trimmed Java
runtime inside it, and puts a shortcut on the Desktop. The machine it runs on
afterwards needs no JDK.

The script reads `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` from `../.env.local` and bakes them in. That
is the same anon key the website inlines into its own bundle — it is public by
design and bounded entirely by Row Level Security. `SUPABASE_SERVICE_ROLE_KEY`
is never read.

Without those values the app still builds, opens and works offline; it just
cannot sync.

## Run the tests alone

```bash
./gradlew test
```

## The four modules

| Module | What it is | Depends on |
|---|---|---|
| `domain` | The planner, the resolver, the presence wording. Pure Java. | nothing |
| `store`  | The encrypted local copy, and the outbox. | `domain` |
| `sync`   | GoTrue and PostgREST. | `domain`, `store` |
| `ui`     | JavaFX, and the packaging. | all three |

`domain` has no JavaFX, no JDBC and no HTTP, which is what lets the part of
StudyFlow that actually decides things be tested without any of them. Its
tests are ported assertion for assertion from `scripts/test-resolve.mjs` and
`scripts/test-planner.mjs`, so a Java planner that disagrees with the
TypeScript one fails the build rather than quietly shipping.

## First run

Needs a connection, once: her StudyFlow email and password. Nothing is asked
after that — launching goes straight to Today, online or not.

## Where things live

| | |
|---|---|
| The copy | `%LOCALAPPDATA%\StudyFlow\studyflow.mv.db` |
| The app  | `dist/StudyFlow/StudyFlow.exe` |

**The copy is not encrypted, and there is no password on the app.** That was
chosen deliberately, with the trade-off on the table: the alternative was a
passphrase prompt on every launch. The cost is that anyone who can use this
Windows account can read the whole academic record straight off disk, and the
saved refresh token with it. Settings says so on screen rather than leaving it
as a property nobody knows about.

Putting it back is a one-line change in `LocalDatabase.open` — append
`;CIPHER=AES` to the URL and pass a derived key as the file password.

## How syncing works

Push, then pull, in that order. Pulling first would overwrite rows whose
changes had not been sent yet.

Every offline change is recorded as an **intent** — "complete assignment X" —
rather than as a copy of the row. Replaying an intent touches only the fields
it names, so it cannot clobber a field she never edited, including a timetable
edit made by a linked adult while she was offline.

Intents replay grouped by row. A refusal stalls its own row and nothing else,
and is kept and shown rather than retried forever: a 403 is Row Level Security
doing its job, and no number of attempts will change its mind. Settings lists
anything refused, with the reason, and offers a retry.

## Not ported

- `/admin` and the reports. The parent keeps using the website.
- Reading a timetable from a photo or PDF. That needs a vision model and
  therefore a network. The week is imported on the website and arrives here on
  the next sync.
- The oversight disclosure in Settings names no accounts yet. It still states
  plainly that a support account can read the record without approval, and
  points at the website for the current list.
