# Finishing the desktop app: it syncs itself, and it looks like StudyFlow

*Design, 2026-11-24. Follows [the port design of 2026-11-10](2026-11-10-java-offline-port-design.md).*

## Where this starts

The port is real. `studyflow-java/` builds, its tests pass, and
`dist/StudyFlow/StudyFlow.exe` opens a window from a Desktop shortcut with no
JDK on the machine. Six views exist. Offline writes land in the outbox as
intents and go up when a sync runs.

Three things are missing, and running the packaged app is what showed them.

**Sync never starts by itself.** It runs once at launch and again when the
Sync button is pressed. Work an evening offline, watch the wifi come back, and
nothing happens. The 2026-11-10 design called for a `Connectivity` probe; it
was never written.

**It does not look like StudyFlow.** The window works and is plain: boxed
full-width nav buttons, no icons anywhere, flat headings with none of the
site's type hierarchy, no stat tiles, no gradient hero card. `theme.css`
contains five `:hover` rules in total against dozens of interactive states on
the web.

**The timetable is read-only.** `TimetableView` says so in its own header
comment. Homework, Home plan and Stuck on are writable offline; the week is
not, so the one evening job that most wants a sofa and no network — fixing
four lessons that moved this term — has to be done in a browser.

## What we are building

1. A connectivity watcher that drains the outbox the moment a connection
   returns, and a header pill that tells the truth about it.
2. The website's design system, in JavaFX: its tokens, its typeface, its
   icons, its hover and press behaviour.
3. Timetable editing offline — per-lesson, and by pasting a week.

### Decisions taken, and why

| Decision | Why |
|---|---|
| **The watcher lives in the app**, not a background service | Asked and answered: nothing extra installed, no tray process to die silently. The app syncs on launch anyway, so a closed-app evening still lands the next time it opens. |
| **An authenticated probe**, not a ping | A reachable network is not a reachable Supabase, and neither is a valid token. One cheap authorised `GET` answers all three. `InetAddress.isReachable` answers none of them. |
| **The outbox sets the cadence** | Having something to say is what makes it urgent. Pending intents → probe every 20s. Nothing waiting → every 5 minutes, which doubles as a pull so a parent's timetable edit arrives. |
| **Mirror the web layout exactly** | Asked and answered. Same icon sidebar, same eyebrow and oversized display heading, same stat tiles and gradient hero. It costs vertical space in a window; that is the trade taken deliberately. |
| **Geist from bundled TTFs** | `node_modules/geist/dist/fonts/` ships static `.ttf` — Regular, Medium, SemiBold, Bold. JavaFX loads those. The desktop app gets the site's actual typeface rather than a lookalike. |
| **Icons generated from lucide**, not a library | `lucide-react` ships each icon as a plain `__iconData` object of 24×24 stroke primitives. A build script turns the ones we use into Java. Same glyphs as the site, no runtime dependency, no icon pack lagging upstream. |
| **CSS states, plus motion only where it registers** | JavaFX CSS has `:hover` but no `transition`, so every state change snaps. Colour comes from CSS; the handful of places where the web's 150ms ease actually reads — nav rows, buttons, cards lifting — get a small animation helper. Animating everything risks a long homework list feeling sluggish, which is the opposite of polish. |
| **Typed paste makes a new version**, never edits entries in place | The parent's timetable edit is the one cross-account write the product allows. Replacing a week by deleting rows underneath them corrupts that edit; superseding the version leaves it intact on a version that is no longer active. |

### Not in scope

- Anything in the Next.js app or the SQL migrations.
- `/admin`, reports, support-access requests. Web only, as before.
- AI timetable extraction. Vision models need a network.
- A background service, a tray icon, or sync while the app is closed.

## Architecture

### `sync` — Connectivity

One new class. It decides *when*; `SyncEngine` still decides *what*, unchanged.

```java
public final class Connectivity {
    interface Probe { Reachability check(); }
    enum Reachability { REACHABLE, UNREACHABLE, UNAUTHORISED }
    enum State { UNKNOWN, ONLINE, OFFLINE }

    Connectivity(Probe probe, BooleanSupplier hasPendingWork,
                 ScheduledExecutorService scheduler, Clock clock);

    void start(Runnable onBecameOnline);
    void markOffline();          // a real sync just failed
    State state();
    void stop();
}
```

The probe is `GET /rest/v1/profiles?select=id&limit=1` with the bearer token
and the anon apikey, connect timeout 3s, read timeout 5s.

- `200`/`206` → `REACHABLE`.
- `401`/`403` → `UNAUTHORISED`. Distinct on purpose: the network is fine and
  the saved session is stale. Claiming "offline" there would send the student
  looking at their router over an expired refresh token. The app refreshes
  through `GoTrueClient` and, failing that, shows `SetupView`.
- Any `IOException`, timeout, or 5xx → `UNREACHABLE`.

After each probe the watcher reschedules itself: 20 seconds when the outbox has
pending intents, 5 minutes when it does not. A transition from anything other
than `ONLINE` to `ONLINE` fires `onBecameOnline` exactly once per edge.

`markOffline()` exists so a failed sync does not have to wait out a five-minute
idle interval before the watcher notices what the sync already knows.

`Connectivity` takes a `Clock` and a `ScheduledExecutorService` rather than
making its own, which is what makes it testable without sleeping.

### `ui` — wiring the watcher

`AppContext` owns the watcher and adapts it to JavaFX:

- `onBecameOnline` → `syncInBackground` on the existing single-threaded sync
  worker. Two syncs still cannot race; that guard does not change.
- A new `notifyLocalWrite()` debounces 2 seconds and then syncs, so "the
  moment" also covers a write made with the connection already up. Every store
  call that queues an intent calls it.
- `Connectivity.State` is mirrored into a JavaFX property so the pill can bind
  to it without the `sync` module ever importing JavaFX.

The header pill stops being decoration and states exactly one of:

| State | Text |
|---|---|
| Offline, nothing waiting | `Offline` |
| Offline, intents queued | `Offline · 3 waiting` |
| Sync in flight | `Syncing…` |
| Online, clean | `Synced · just now`, then `Synced · 4 min ago` |
| Intents refused | `3 changes rejected` |

Rejected outranks synced. The pill never reads `Synced` while offline — a
status line that lies about this is worse than no status line, because the
whole point of the app is working without one.

### `ui` — the design system

`theme.css` becomes a token sheet whose names match `globals.css`, so a diff
between the two is readable by eye: `-sf-ink`, `-sf-ink-muted`, `-sf-border`,
`-sf-card`, `-sf-surface-sunken`, `-sf-brand`, `-sf-brand-soft`, the radii and
the elevation. One source of truth, transcribed rather than reinvented.

Geist Sans and Geist Mono load at startup from TTFs copied into
`ui/src/main/resources/flow/study/ui/font/` by the build. Static weights only —
`Geist-Variable.ttf` exists but JavaFX's variable-font support is not something
to stake the look on.

`packaging/gen-icons.mjs` imports each needed `node_modules/lucide-react/dist/esm/icons/<name>.mjs`,
reads its `__iconData.node` array, and writes
`ui/src/main/java/flow/study/ui/kit/Icons.java`. Each icon becomes a method
returning a `Group` of JavaFX shapes on a 24×24 canvas, **stroked, not
filled** — lucide is an outline set, and rendering its paths as fills produces
blobs. Stroke width 2, round caps and joins, `fill: transparent`, and a
`.icon` style class so a hover state can recolour them from CSS. The generated
file is committed, so a Gradle build never needs `node_modules`.

`Ui.java` is already doing too much at 152 lines and this work would double it.
It splits into `flow.study.ui.kit`:

| Class | Holds |
|---|---|
| `Type` | eyebrow, display, pageTitle, sectionTitle, body, meta, numeric |
| `Cards` | card, statTile, heroCard (gradient), emptyState, loadingState |
| `Controls` | button variants, pill, badge, navRow, listRow, iconButton |
| `Motion` | hover and press animations, and the reduced-motion switch |

`Motion` animates at 120ms with an ease-out interpolator, and does nothing at
all when reduced motion is on. That is a Settings toggle persisted in
`auth_state`, defaulting to **off** (motion on): JavaFX exposes no OS
reduced-motion preference, and inventing a native lookup for one checkbox is
not worth it. Views depend on the kit; the kit depends on nothing but JavaFX
and the token sheet.

### `domain` + `store` + `ui` — timetable editing

`parse-lines.ts` ports to `domain/timetable/LineParser` and `LineWriter`. It is
pure, and `scripts/test-parse-lines.mjs` already encodes its behaviour, so its
fixtures move to shared JSON and both implementations run over them — the same
parity arrangement the planner got in phase 1.

Two dialogs in `ui`:

- `TimetableEntryDialog` — day, start, end, kind (class, break, free, study),
  subject by name (created if new, as on the web), teacher, room.
- `TypedWeekDialog` — paste a week in the line format `Copy as text` produces,
  review the parsed rows, replace.

`Overlaps` already exists in `domain` and becomes the gate on save, reporting a
clash as a sentence naming both lessons rather than as a constraint violation.
This is the invariant that moved out of Postgres because H2 has no
`btree_gist`; this is where it was always going to be needed.

Writes queue as the existing `CREATE`/`UPDATE`/`DELETE` intents against
`timetable_entries`, `timetable_versions` and `subjects`. `SyncEngine` already
pushes all three tables, so there is **no sync work in this part at all** —
which is the dividend of having chosen intents over row shipping.

Replacing a week creates a new `timetable_versions` row and deactivates the old
one. It never deletes the old version's entries. That is what keeps a parent's
concurrent edit from being corrupted: their change lands on a version that is
no longer active, superseded rather than lost mid-write.

## Error handling

- **Offline is a state, not an error.** A failed probe never surfaces anywhere.
- **A stale session is told apart from a dead network**, and says which.
- **Rejected intents are kept, counted in the pill, and listed in Settings**
  with what the cloud refused. A silently dropped intent is a change the
  student believes they made.
- **Overlaps are caught before save**, naming the two lessons that clash.
- **A sync that throws** marks the watcher offline and returns a `SyncResult`;
  it never leaves the pill stuck on `Syncing…`.

## Testing

| Test | Asserts |
|---|---|
| `ConnectivityTest` | the offline→online edge fires exactly once; cadence follows the outbox; `UNAUTHORISED` is not reported as offline; `markOffline` takes effect immediately. Fake probe, fake scheduler, fixed clock — no sleeping. |
| `LineParserTest` | the `test-parse-lines.mjs` fixtures, byte for byte |
| `OverlapsTest` | the save gate rejects what Postgres would have |
| `OutboxTest` (existing) | extended for the write-triggered sync debounce |

Visual checks capture **the app window only**, never the whole screen, and are
compared against the live web pages view by view.

## Phasing

| # | Phase | Proves |
|---|---|---|
| 1 | `Connectivity` + the honest pill | an evening's work lands by itself |
| 2 | Tokens, fonts, icons, kit split | the materials exist |
| 3 | Shell + Today, restyled | **the look is approved on one screen before five more are built** |
| 4 | Homework, Home plan, Stuck on, Settings | parity of feel |
| 5 | Timetable: restyle, entry dialog, typed paste | the last read-only screen writes |
| 6 | Rebuild the `.exe`, refresh the Desktop shortcut | it is still a thing you double-click |

## Risks

| Risk | Mitigation |
|---|---|
| Geist's static TTFs render poorly in JavaFX | Checked at the top of phase 2, before anything is styled against them. Segoe UI Variable is the fallback and is close in feel. |
| Lucide strokes look soft at 16–20px | Shapes are built at 24 and scaled; stroke width scales with them. Checked on the sidebar first, which is where icons are smallest. |
| Motion makes long lists feel sluggish | Animation is confined to nav rows, buttons and cards — never list items. The reduced-motion switch turns all of it off. |
| A 20-second probe is noisy on battery | It is one small request that fails fast, and only at that rate while something is actually waiting to be sent. |
| The restyle drifts from the web as the web changes | Tokens are transcribed from `globals.css` with matching names, so the drift is visible in a diff rather than invisible in a screenshot. |
| `0009_school_catchup.sql` is still unapplied in the cloud | Unchanged from the port design: the catch-up code goes quiet rather than erroring. |
