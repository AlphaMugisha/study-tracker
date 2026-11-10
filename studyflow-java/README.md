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

Needs a connection, once. Her StudyFlow email and password sign in, she
chooses a passphrase, and the encrypted copy is created with the refresh token
sealed inside it.

Every run after that needs nothing. The passphrase derives the file key
(Argon2id), the copy opens, and the app works whether or not there is a
connection.

The passphrase is not her Supabase password and is never sent anywhere. Losing
it costs the local copy, not the data: signing in again on a fresh copy
re-downloads everything.

## Where things live

| | |
|---|---|
| The copy | `%LOCALAPPDATA%\StudyFlow\studyflow.mv.db`, AES-encrypted |
| The salt | `%LOCALAPPDATA%\StudyFlow\studyflow.properties`, plaintext |
| The app  | `dist/StudyFlow/StudyFlow.exe` |

The salt sits outside the encrypted file because it is needed to derive the
key that opens it. That is correct rather than a compromise: a salt has to be
unique, not secret.

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
