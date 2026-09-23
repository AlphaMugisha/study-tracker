-- ---------------------------------------------------------------------------
-- 0004 — the planning window
-- ---------------------------------------------------------------------------
-- The planner cannot answer "what should I start with" without knowing how
-- much time there is. Until now `profiles` held only id, full_name, role and
-- timezone, so the preview scheduled work from school-end onwards with no end
-- at all — it would happily lay tasks out past midnight.
--
-- Two columns, both on profiles because they describe the student's day rather
-- than any one task:
--
--   study_until     when the evening stops. Work that does not fit before this
--                   is reported as deferred rather than silently dropped.
--   settle_minutes  the gap between getting home and starting. Was a hardcoded
--                   30 in the temporary preview.
--
-- Everything else the planner needs already exists: `assignments` carries
-- due_at, priority and estimated_minutes, and `study_sessions` is ready to
-- record what was actually worked on. Neither needed changing.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists study_until time not null default '21:00',
  add column if not exists settle_minutes integer not null default 30;

comment on column public.profiles.study_until is
  'Local time the student stops working for the evening. The planner treats '
  'this as a hard cutoff and defers anything that will not fit before it.';

comment on column public.profiles.settle_minutes is
  'Minutes between the school day ending and work starting.';

-- A day that ends at 03:00 is a typo, not a plan. A cutoff before 12:00 would
-- put the whole window before school finishes.
alter table public.profiles
  drop constraint if exists profiles_study_until_sane;
alter table public.profiles
  add constraint profiles_study_until_sane
  check (study_until between '12:00' and '23:59');

alter table public.profiles
  drop constraint if exists profiles_settle_minutes_sane;
alter table public.profiles
  add constraint profiles_settle_minutes_sane
  check (settle_minutes between 0 and 240);

-- ---------------------------------------------------------------------------
-- Column grants
-- ---------------------------------------------------------------------------
-- 0001 deliberately granted UPDATE on named columns only, so that a student
-- cannot PATCH their own `role` to admin. That also means a newly added column
-- is NOT writable until it is named here — adding the column alone would leave
-- the settings form failing with a permission error.
--
-- Column-level grants in Postgres are ADDITIVE: granting update(study_until)
-- on its own would be enough, and would not disturb the existing grant on
-- full_name and timezone. The full list is restated anyway so that this one
-- statement is the complete, readable answer to "what can a student write?"
-- — rather than something you can only work out by reading two migrations at
-- once. Re-granting an already-granted column is a no-op.
-- ---------------------------------------------------------------------------

grant update (full_name, timezone, study_until, settle_minutes)
  on public.profiles to authenticated;

-- role and id remain ungranted: still no self-promotion.
