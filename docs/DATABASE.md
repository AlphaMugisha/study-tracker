# StudyFlow database

Postgres on Supabase. Everything here lives in `supabase/migrations/`, is
idempotent, and is verified by `supabase/tests/`.

---

## Tables

| Table | Purpose |
|---|---|
| `profiles` | One row per account. Name, role, timezone. |
| `subjects` | The student's school subjects. |
| `timetable_versions` | A timetable as confirmed at a point in time. Versioned so a re-upload never destroys a working one. |
| `timetable_entries` | Individual slots in the school day — lessons, breaks, free periods, other activities. |
| `assignments` | Homework. |
| `revision_tasks` | Lightweight study/revision items. |
| `study_sessions` | What was actually worked on, and for how long. |
| `admin_student_links` | The explicit, revocable authorisation between a support account and a student. |
| `activity_logs` | Academic events inside StudyFlow. Append-only. |

### Relationships

```
auth.users
    │ 1:1 (created by trigger)
    ▼
profiles ──┬──< subjects ──────────┐
           │                       │ (subject_id, user_id)
           ├──< timetable_versions │
           │        │              │
           │        └──< timetable_entries
           │
           ├──< assignments ───────┐
           ├──< revision_tasks ────┤
           │                       │ (assignment_id | revision_task_id, user_id)
           ├──< study_sessions ────┘
           │
           ├──< activity_logs
           │
           └──< admin_student_links >── profiles (as admin)
```

**Child rows carry `user_id` and use composite foreign keys.** A
`timetable_entry` does not merely reference *a* subject — it references
`(subject_id, user_id)` against `subjects(id, user_id)`. A plain foreign key
would happily let one student's timetable point at another student's subject.
This makes cross-user contamination impossible at the storage layer, not just
unlikely at the policy layer.

---

## Constraints worth knowing

| Constraint | Table | Why |
|---|---|---|
| `end_time > start_time` | `timetable_entries` | A lesson cannot end before it starts. |
| `EXCLUDE … timerange && ` | `timetable_entries` | Nothing in a school day happens twice at once. Uses a custom `timerange` type plus `btree_gist`. |
| `EXCLUDE … daterange &&  WHERE status='active'` | `timetable_versions` | Two active timetables covering the same day would make "what am I doing right now?" ambiguous — the one question this product exists to answer. |
| `activity_type <> 'class' OR subject_id IS NOT NULL` | `timetable_entries` | A lesson must say which subject. |
| `subject_id IS NOT NULL OR title <> ''` | `timetable_entries` | Anything that is not a lesson must say what it is. |
| `(status = 'completed') = (completed_at IS NOT NULL)` | `assignments`, `revision_tasks` | Status and timestamp can never disagree. A trigger fills and clears the timestamp so callers need not remember. |
| `estimated_minutes BETWEEN 5 AND 600` | `assignments`, `revision_tasks` | Keeps the home planner's arithmetic sane. |
| `assignment_id IS NULL OR revision_task_id IS NULL` | `study_sessions` | A session is work on one thing. |
| `admin_id <> student_id` | `admin_student_links` | You cannot authorise yourself. |

`study_sessions.duration_minutes` is filled by a trigger when `ended_at` is
set, unless it was supplied explicitly.

### Overdue is derived, never stored

`task_status` has exactly three members: `not_started`, `in_progress`,
`completed`. There is no `overdue`, because a stored flag would need a cron
job to stay true and would be wrong in between runs.

```sql
status <> 'completed' AND (due_date + coalesce(due_time, '23:59')) < now()
```

TypeScript equivalent: `isOverdue()` in `src/types/database.ts`.

---

## RLS model

Every table has Row Level Security enabled. `anon` has **no privileges at
all** on any academic table — none of this is public data.

The shape is the same everywhere:

| Command | Policy |
|---|---|
| `SELECT` | `public.has_student_access(user_id)` |
| `INSERT` | `user_id = auth.uid()` |
| `UPDATE` | `user_id = auth.uid()` |
| `DELETE` | `user_id = auth.uid()` |

```sql
create function public.has_student_access(target uuid) returns boolean as $$
  select target = auth.uid()
      or exists (select 1 from admin_student_links
                  where admin_id = auth.uid() and student_id = target
                    and status = 'active' and revoked_at is null);
$$;
```

Reads may be shared with an authorised admin. **Writes are owner-only,
always.** No policy anywhere grants an admin write access to a student's data.

`has_student_access` and `is_admin` are `SECURITY DEFINER` so they can read
`admin_student_links` while its own RLS is active — otherwise every policy
check would re-enter RLS and recurse. Both have `EXECUTE` revoked from
`PUBLIC` and `anon`.

### Privilege escalation guards

RLS alone is not enough in two places, so column-level grants back it up:

- **`profiles.role`** — `profiles_update_own` lets a user update their own
  row, which without `GRANT UPDATE (full_name, timezone)` would include
  `role`. Any student could have made themselves an admin with one `PATCH`.
- **`admin_student_links.status`** — only `status` is grantable for UPDATE, so
  `admin_id` and `student_id` are immutable and a link can never be
  re-pointed at a different student.

Changing a role requires the service key: `npm run role -- --email … --role admin`.

---

## Admin ↔ student authorisation

```
ADMIN ──active link──▶ STUDENT A     can READ A's academic data
      ──active link──▶ STUDENT B     can READ B's academic data
      ──(no link)────  STUDENT C     cannot see C exists
```

Being an admin grants nothing by itself. Access requires an `active` row in
`admin_student_links`, and it is read-only even then.

### Who can do what

| Action | Admin | Student |
|---|---|---|
| Create the link (`pending`) | ✅ only naming themselves, and only if genuinely an admin | ❌ |
| Move it to `active` | ❌ | ✅ **only the student** |
| Revoke | ✅ | ✅ |
| Re-activate after revoking | ❌ | ✅ |
| See that the link exists | ✅ | ✅ |
| Delete the link | ❌ | ❌ |

**Why this asymmetry.** An admin who could self-activate would be
surveillance, which the product explicitly rejects. A student who could
activate an arbitrary admin without that admin asking first would be a
social-engineering target — "just approve this support request" is an easy
thing to talk a sixteen-year-old into. Requiring a request *from* the admin
and consent *from* the student means neither side can act alone.

Enforced by:

```sql
-- admin may request, only as pending, only as themselves
with check (admin_id = auth.uid() and public.is_admin() and status = 'pending')

-- admin may withdraw, but WITH CHECK forbids 'active' — they can never grant
with check (admin_id = auth.uid() and status <> 'active')

-- the student is the only one who can grant
using (student_id = auth.uid()) with check (student_id = auth.uid())
```

Plus `GRANT INSERT (admin_id, student_id, note)` — `status` is not grantable
at insert, so it falls to its `pending` default no matter what is sent.

There is **no DELETE policy**. Revoking sets a status; it does not erase the
record that access once existed. Revocation takes effect immediately, on the
next query.

---

## Activity log model

An academic record, not surveillance.

`activity_type` is a **closed Postgres enum** of 18 members — all of them
things the student did inside StudyFlow (created an assignment, completed
revision, confirmed a timetable, granted support access). There is no member
for keystrokes, location, browsing, screen contents or device activity, and
adding one would require a migration and a code review. The verification suite
asserts this: check #4 fails the build if any enum label matches
`key|location|browser|device|screen|camera|mic|history`.

Append-only, enforced three ways:

1. No `UPDATE` policy and no `DELETE` policy.
2. `GRANT SELECT, INSERT` only — no update/delete privilege to grant.
3. A `BEFORE UPDATE` trigger that raises. This fires for the **table owner and
   the service role too**, so a history rewrite is not something anyone can do
   by accident. `DELETE` is left alone at trigger level so FK cascade still
   works when an account is erased.

Insert requires `user_id = auth.uid() AND actor_id = auth.uid()`, so a student
can neither log events against someone else nor forge who performed an action.
`metadata` is capped at 4 KB — it is an event log, not a place to dump
captured data.

---

## Seed data

`scripts/seed-demo.mjs`, run via `npm run seed`. It exists because Phases 3–7
(timetable engine, Current Activity Card, home planner) cannot be built or
judged against empty tables.

```bash
npm run seed -- --email you@example.com            # add demo data
npm run seed -- --email you@example.com --reset    # replace it
npm run seed -- --email you@example.com --reset-only --yes   # just clear
```

What it creates: 7 subjects, an active timetable with 38 entries across
Monday–Friday (07:30–15:00, including breaks, lunch, a free study period,
games and assembly), 7 assignments (one overdue, one due today, one completed),
3 revision tasks, 3 study sessions and 6 activity-log events.

**All dates are relative to today**, so the demo stays current rather than
rotting into a week of past-due homework.

**Separation from production data.** It lives in `scripts/`, nothing in `src/`
imports it, and it refuses to run without an explicit `--email`. `--reset`
deletes that one account's academic rows and nothing else — it never touches
`auth.users`, `profiles`, or any other account. The application never assumes
this data exists.

---

## Running and resetting the database

### Against Supabase

```bash
# 1. apply migrations, in order, via the SQL Editor or the CLI
supabase db push

# 2. confirm the app can reach it
npm run db:check

# 3. optional demo data
npm run seed -- --email you@example.com --reset
```

Migrations are idempotent — re-running is safe.

### Locally, before touching Supabase

```bash
PSQL='/c/Program Files/PostgreSQL/16/bin/psql.exe' PGPASSWORD=postgres \
  npm run db:verify:local
```

Creates a throwaway database, applies `supabase/tests/00_supabase_shim.sql`
(which reproduces `auth.users`, `auth.uid()` and Supabase's default
`anon`/`authenticated` grants), applies every migration **twice** to prove
idempotency, runs all verification suites, then drops the database. Existing
databases are never touched.

The shim's grants are load-bearing: Supabase hands `anon` and `authenticated`
blanket table privileges by default, so without reproducing that, the
migrations' `REVOKE ALL` would be a no-op and the tests would "prove"
protection that does not exist in production.

Current coverage: **91 checks** — 33 in `01_verify_profiles.sql`, 58 in
`02_verify_core_schema.sql`.
