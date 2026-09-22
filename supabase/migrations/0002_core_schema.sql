-- ============================================================================
-- StudyFlow — Phase 2: core academic schema, RLS, and admin authorisation
-- ============================================================================
-- Depends on 0001_auth_and_profiles.sql (profiles, user_role, is_admin()).
-- Idempotent: safe to re-run.
--
-- Read this first -- the authorisation model explains every policy below.
--
--   A student owns their academic data outright.
--
--   An admin owns NOTHING and can WRITE nothing. Being an admin grants no
--   sight of any student by itself. Access requires an `active` row in
--   admin_student_links, and it is read-only even then.
--
--       ADMIN ──active link──▶ STUDENT A   can read A's academic data
--             ──active link──▶ STUDENT B   can read B's academic data
--             ──(no link)────  STUDENT C   cannot see C exists
--
--   Neither side can create an active link alone:
--     - the admin may INSERT a link, but only as `pending`, only naming
--       themselves as the admin, and only if they really are an admin
--     - only the student may move it to `active`
--     - either side may revoke, at any time, forever
--
--   That asymmetry is the whole point. An admin who could self-activate
--   would be surveillance; a student who could activate an arbitrary admin
--   without that admin asking would be a social-engineering target.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Extensions and shared types
-- ----------------------------------------------------------------------------

-- btree_gist lets an exclusion constraint mix equality (uuid, smallint) with
-- range overlap in a single index. Used to stop overlapping timetable rows.
create extension if not exists btree_gist;

do $$
begin
  -- Postgres ships int4range/tsrange/daterange but no range over `time`.
  if not exists (select 1 from pg_type where typname = 'timerange') then
    create type public.timerange as range (subtype = time);
  end if;

  if not exists (select 1 from pg_type where typname = 'timetable_status') then
    create type public.timetable_status as enum ('draft', 'active', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'timetable_source') then
    create type public.timetable_source as enum ('manual', 'pdf', 'image', 'csv');
  end if;

  -- Not every timetable row is a lesson. Breaks and free periods are
  -- first-class: the Current Activity Card has to be able to say
  -- "CURRENTLY / BREAK" rather than showing a hole in the day.
  if not exists (select 1 from pg_type where typname = 'activity_kind') then
    create type public.activity_kind as enum ('class', 'break', 'free', 'study', 'other');
  end if;

  if not exists (select 1 from pg_type where typname = 'task_priority') then
    create type public.task_priority as enum ('low', 'medium', 'high');
  end if;

  -- No `overdue` member: overdue is derived from due date/time plus
  -- completion, so storing it would need a cron job to stay true.
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('not_started', 'in_progress', 'completed');
  end if;

  if not exists (select 1 from pg_type where typname = 'extraction_confidence') then
    create type public.extraction_confidence as enum ('high', 'medium', 'low');
  end if;

  if not exists (select 1 from pg_type where typname = 'link_status') then
    create type public.link_status as enum ('pending', 'active', 'revoked');
  end if;

  -- A closed set, deliberately. The log can only ever record academic events
  -- that happen inside StudyFlow. There is no member for anything resembling
  -- keystrokes, location, browsing, or device activity, and adding one would
  -- require a migration and a review.
  if not exists (select 1 from pg_type where typname = 'activity_type') then
    create type public.activity_type as enum (
      'subject_created',
      'subject_updated',
      'subject_deleted',
      'timetable_confirmed',
      'timetable_updated',
      'timetable_entry_updated',
      'assignment_created',
      'assignment_updated',
      'assignment_started',
      'assignment_completed',
      'assignment_deleted',
      'revision_created',
      'revision_completed',
      'study_session_started',
      'study_session_completed',
      'support_access_requested',
      'support_access_granted',
      'support_access_revoked'
    );
  end if;
end
$$;


-- ----------------------------------------------------------------------------
-- 1. Authorisation helper
-- ----------------------------------------------------------------------------
-- Defined in section 10.5 instead of here: it reads admin_student_links, and
-- Postgres validates SQL function bodies at creation time, so the table has
-- to exist first.


-- ----------------------------------------------------------------------------
-- 2. Shared triggers
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Keeps status and completed_at from ever disagreeing, without making every
-- caller remember to set both.
create or replace function public.sync_completed_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and new.completed_at is null then
    new.completed_at = now();
  elsif new.status <> 'completed' then
    new.completed_at = null;
  end if;
  return new;
end;
$$;


-- ----------------------------------------------------------------------------
-- 3. subjects
-- ----------------------------------------------------------------------------

create table if not exists public.subjects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  short_name  text,
  -- References a palette slot, never a raw hex value, so subject colours stay
  -- inside the design system.
  color_token text not null default 'chart-1',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint subjects_name_length check (char_length(btrim(name)) between 1 and 80),
  constraint subjects_short_name_length
    check (short_name is null or char_length(btrim(short_name)) between 1 and 12),
  constraint subjects_color_token_valid
    check (color_token in ('chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5')),

  -- Lets child tables carry a composite FK that pins them to the same owner.
  constraint subjects_id_user_key unique (id, user_id)
);

create unique index if not exists subjects_user_name_unique
  on public.subjects (user_id, lower(btrim(name)));

create index if not exists subjects_user_idx on public.subjects (user_id);

drop trigger if exists subjects_set_updated_at on public.subjects;
create trigger subjects_set_updated_at before update on public.subjects
  for each row execute function public.set_updated_at();


-- ----------------------------------------------------------------------------
-- 4. timetable_versions
-- ----------------------------------------------------------------------------
-- A re-upload never destroys a working timetable: it lands as a new version
-- and only becomes `active` on confirmation.

create table if not exists public.timetable_versions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  name             text not null default 'My timetable',
  status           public.timetable_status not null default 'draft',
  source_type      public.timetable_source not null default 'manual',
  source_path      text,
  effective_from   date not null default current_date,
  effective_until  date,
  extraction_meta  jsonb not null default '{}'::jsonb,
  confirmed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint timetable_versions_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint timetable_versions_date_order
    check (effective_until is null or effective_until >= effective_from),
  constraint timetable_versions_confirmed_when_active
    check (status <> 'active' or confirmed_at is not null),

  constraint timetable_versions_id_user_key unique (id, user_id)
);

-- Two active timetables covering the same day would make "what am I doing
-- right now?" ambiguous, which is the one question this product exists to
-- answer. An open-ended version is treated as running to infinity.
alter table public.timetable_versions
  drop constraint if exists timetable_versions_no_active_overlap;
alter table public.timetable_versions
  add constraint timetable_versions_no_active_overlap
  exclude using gist (
    user_id with =,
    daterange(effective_from, effective_until, '[]') with &&
  ) where (status = 'active');

create index if not exists timetable_versions_user_status_idx
  on public.timetable_versions (user_id, status);

drop trigger if exists timetable_versions_set_updated_at on public.timetable_versions;
create trigger timetable_versions_set_updated_at before update on public.timetable_versions
  for each row execute function public.set_updated_at();


-- ----------------------------------------------------------------------------
-- 5. timetable_entries
-- ----------------------------------------------------------------------------

create table if not exists public.timetable_entries (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null,
  timetable_version_id uuid not null,
  subject_id           uuid,
  activity_type        public.activity_kind not null default 'class',
  title                text,
  day_of_week          smallint not null,
  start_time           time not null,
  end_time             time not null,
  room                 text,
  teacher              text,
  confidence           public.extraction_confidence not null default 'high',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- 1 = Monday .. 7 = Sunday. The MVP only populates 1-5, but the column
  -- allows weekends so adding them later is data, not a migration.
  constraint timetable_entries_day_range check (day_of_week between 1 and 7),
  constraint timetable_entries_time_order check (end_time > start_time),

  -- A lesson must say which subject; anything else must say what it is.
  constraint timetable_entries_class_has_subject
    check (activity_type <> 'class' or subject_id is not null),
  constraint timetable_entries_describable
    check (subject_id is not null or char_length(btrim(coalesce(title, ''))) > 0),

  -- Composite FKs: the version and subject must belong to the SAME user as
  -- the entry. A plain FK would happily let one user's entry point at
  -- another user's subject.
  constraint timetable_entries_version_fk
    foreign key (timetable_version_id, user_id)
    references public.timetable_versions (id, user_id) on delete cascade,
  constraint timetable_entries_subject_fk
    foreign key (subject_id, user_id)
    references public.subjects (id, user_id) on delete set null
);

-- Nothing in a school day happens twice at once.
alter table public.timetable_entries
  drop constraint if exists timetable_entries_no_overlap;
alter table public.timetable_entries
  add constraint timetable_entries_no_overlap
  exclude using gist (
    timetable_version_id with =,
    day_of_week with =,
    public.timerange(start_time, end_time, '[)') with &&
  );

create index if not exists timetable_entries_lookup_idx
  on public.timetable_entries (user_id, day_of_week, start_time);
create index if not exists timetable_entries_version_idx
  on public.timetable_entries (timetable_version_id);

drop trigger if exists timetable_entries_set_updated_at on public.timetable_entries;
create trigger timetable_entries_set_updated_at before update on public.timetable_entries
  for each row execute function public.set_updated_at();


-- ----------------------------------------------------------------------------
-- 6. assignments
-- ----------------------------------------------------------------------------

create table if not exists public.assignments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  subject_id        uuid,
  title             text not null,
  description       text,
  due_date          date not null,
  due_time          time,
  priority          public.task_priority not null default 'medium',
  estimated_minutes integer not null default 30,
  status            public.task_status not null default 'not_started',
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint assignments_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint assignments_estimate_range check (estimated_minutes between 5 and 600),
  -- status and completed_at can never disagree.
  constraint assignments_completion_consistent
    check ((status = 'completed') = (completed_at is not null)),

  constraint assignments_subject_fk
    foreign key (subject_id, user_id)
    references public.subjects (id, user_id) on delete set null,
  constraint assignments_id_user_key unique (id, user_id)
);

-- Drives "what is due soon" on the dashboard.
create index if not exists assignments_due_idx
  on public.assignments (user_id, status, due_date, due_time);
create index if not exists assignments_subject_idx
  on public.assignments (user_id, subject_id);

drop trigger if exists assignments_set_updated_at on public.assignments;
create trigger assignments_set_updated_at before update on public.assignments
  for each row execute function public.set_updated_at();

drop trigger if exists assignments_sync_completed_at on public.assignments;
create trigger assignments_sync_completed_at before insert or update on public.assignments
  for each row execute function public.sync_completed_at();

comment on table public.assignments is
  'Homework. `overdue` is deliberately not a stored status: it is derived as (status <> ''completed'' AND due moment < now()), so it can never go stale.';


-- ----------------------------------------------------------------------------
-- 7. revision_tasks
-- ----------------------------------------------------------------------------

create table if not exists public.revision_tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  subject_id        uuid,
  title             text not null,
  description       text,
  scheduled_date    date,
  estimated_minutes integer not null default 30,
  priority          public.task_priority not null default 'low',
  status            public.task_status not null default 'not_started',
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint revision_tasks_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint revision_tasks_estimate_range check (estimated_minutes between 5 and 600),
  constraint revision_tasks_completion_consistent
    check ((status = 'completed') = (completed_at is not null)),

  constraint revision_tasks_subject_fk
    foreign key (subject_id, user_id)
    references public.subjects (id, user_id) on delete set null,
  constraint revision_tasks_id_user_key unique (id, user_id)
);

create index if not exists revision_tasks_schedule_idx
  on public.revision_tasks (user_id, status, scheduled_date);

drop trigger if exists revision_tasks_set_updated_at on public.revision_tasks;
create trigger revision_tasks_set_updated_at before update on public.revision_tasks
  for each row execute function public.set_updated_at();

drop trigger if exists revision_tasks_sync_completed_at on public.revision_tasks;
create trigger revision_tasks_sync_completed_at before insert or update on public.revision_tasks
  for each row execute function public.sync_completed_at();


-- ----------------------------------------------------------------------------
-- 8. study_sessions
-- ----------------------------------------------------------------------------

create table if not exists public.study_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  subject_id       uuid,
  assignment_id    uuid,
  revision_task_id uuid,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_minutes integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint study_sessions_time_order check (ended_at is null or ended_at >= started_at),
  constraint study_sessions_duration_positive
    check (duration_minutes is null or duration_minutes >= 0),
  -- A session is work on one thing. Pointing at both an assignment and a
  -- revision task would make "what did she actually do" unanswerable.
  constraint study_sessions_single_target
    check (assignment_id is null or revision_task_id is null),

  constraint study_sessions_subject_fk
    foreign key (subject_id, user_id)
    references public.subjects (id, user_id) on delete set null,
  constraint study_sessions_assignment_fk
    foreign key (assignment_id, user_id)
    references public.assignments (id, user_id) on delete set null,
  constraint study_sessions_revision_fk
    foreign key (revision_task_id, user_id)
    references public.revision_tasks (id, user_id) on delete set null
);

create index if not exists study_sessions_user_started_idx
  on public.study_sessions (user_id, started_at desc);

-- Fill duration when a session is closed, unless it was set explicitly.
create or replace function public.set_session_duration()
returns trigger language plpgsql as $$
begin
  if new.ended_at is not null and new.duration_minutes is null then
    new.duration_minutes = greatest(
      0,
      floor(extract(epoch from (new.ended_at - new.started_at)) / 60)::integer
    );
  end if;
  return new;
end;
$$;

drop trigger if exists study_sessions_set_duration on public.study_sessions;
create trigger study_sessions_set_duration before insert or update on public.study_sessions
  for each row execute function public.set_session_duration();

drop trigger if exists study_sessions_set_updated_at on public.study_sessions;
create trigger study_sessions_set_updated_at before update on public.study_sessions
  for each row execute function public.set_updated_at();


-- ----------------------------------------------------------------------------
-- 9. admin_student_links
-- ----------------------------------------------------------------------------

create table if not exists public.admin_student_links (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid not null references public.profiles (id) on delete cascade,
  student_id   uuid not null references public.profiles (id) on delete cascade,
  status       public.link_status not null default 'pending',
  note         text,
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint admin_student_links_not_self check (admin_id <> student_id),
  constraint admin_student_links_note_length
    check (note is null or char_length(note) <= 500),
  constraint admin_student_links_revoked_consistent
    check ((status = 'revoked') = (revoked_at is not null)),
  constraint admin_student_links_unique_pair unique (admin_id, student_id)
);

create index if not exists admin_student_links_student_idx
  on public.admin_student_links (student_id, status);
create index if not exists admin_student_links_admin_idx
  on public.admin_student_links (admin_id, status);

-- Timestamps follow the status rather than trusting the caller to set them.
create or replace function public.sync_link_timestamps()
returns trigger language plpgsql as $$
begin
  if new.status = 'active' then
    new.revoked_at = null;
    if old is null or old.status <> 'active' then
      new.responded_at = now();
    end if;
  elsif new.status = 'revoked' then
    if new.revoked_at is null then
      new.revoked_at = now();
    end if;
  else -- pending
    new.revoked_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists admin_student_links_sync on public.admin_student_links;
create trigger admin_student_links_sync before insert or update on public.admin_student_links
  for each row execute function public.sync_link_timestamps();

drop trigger if exists admin_student_links_set_updated_at on public.admin_student_links;
create trigger admin_student_links_set_updated_at before update on public.admin_student_links
  for each row execute function public.set_updated_at();

comment on table public.admin_student_links is
  'Explicit, revocable, student-visible authorisation. An admin may request (pending); only the student may activate; either side may revoke.';


-- ----------------------------------------------------------------------------
-- 10. activity_logs
-- ----------------------------------------------------------------------------
-- Academic events inside StudyFlow. Append-only.

create table if not exists public.activity_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  actor_id      uuid references public.profiles (id) on delete set null,
  activity_type public.activity_type not null,
  entity_type   text,
  entity_id     uuid,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),

  constraint activity_logs_entity_type_length
    check (entity_type is null or char_length(entity_type) <= 40),
  -- Caps accidental payload growth and makes it obvious that this is an
  -- event log, not a place to dump arbitrary captured data.
  constraint activity_logs_metadata_size
    check (pg_column_size(metadata) <= 4096)
);

create index if not exists activity_logs_user_created_idx
  on public.activity_logs (user_id, created_at desc);
create index if not exists activity_logs_actor_idx on public.activity_logs (actor_id);

-- Append-only, enforced below the API. This fires for the table owner and the
-- service role too, so a history rewrite is not something anyone can do by
-- accident. DELETE is left alone so FK cascade still works when an account is
-- erased.
create or replace function public.block_activity_log_update()
returns trigger language plpgsql as $$
begin
  raise exception 'activity_logs is append-only; historical entries cannot be modified'
    using errcode = '42501';
end;
$$;

drop trigger if exists activity_logs_no_update on public.activity_logs;
create trigger activity_logs_no_update before update on public.activity_logs
  for each row execute function public.block_activity_log_update();

comment on table public.activity_logs is
  'Academic events inside StudyFlow only. activity_type is a closed enum -- there is no member for keystrokes, location, browsing or device activity, and adding one requires a migration.';


-- ----------------------------------------------------------------------------
-- 10.5 Authorisation helper
-- ----------------------------------------------------------------------------
-- One function powers every SELECT policy in this migration: may the caller
-- read rows belonging to `target`?
--
-- security definer is required so the function can read admin_student_links
-- while that table's own RLS is active -- otherwise each policy check would
-- re-enter RLS and recurse.

create or replace function public.has_student_access(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- your own data
    target = (select auth.uid())
    -- or an admin holding a live, unrevoked link to this student
    or exists (
      select 1
      from public.admin_student_links l
      where l.admin_id = (select auth.uid())
        and l.student_id = target
        and l.status = 'active'
        and l.revoked_at is null
    );
$$;

comment on function public.has_student_access(uuid) is
  'True if the caller owns the row, or is an admin with an active link to its owner. Read access only -- writes are always owner-only.';


-- ============================================================================
-- 11. Row Level Security
-- ============================================================================
-- Shape, applied to every owned table:
--   SELECT  public.has_student_access(user_id)   owner, or linked admin
--   INSERT  user_id = auth.uid()                 owner only
--   UPDATE  user_id = auth.uid()                 owner only
--   DELETE  user_id = auth.uid()                 owner only
--
-- An admin therefore reads and never writes, and only where a live link says
-- so. No policy anywhere grants an admin write access.

do $$
declare
  t text;
begin
  foreach t in array array[
    'subjects', 'timetable_versions', 'timetable_entries',
    'assignments', 'revision_tasks', 'study_sessions'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format($p$
      create policy %I on public.%I for select to authenticated
      using (public.has_student_access(user_id))
    $p$, t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format($p$
      create policy %I on public.%I for insert to authenticated
      with check (user_id = (select auth.uid()))
    $p$, t || '_insert', t);

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format($p$
      create policy %I on public.%I for update to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()))
    $p$, t || '_update', t);

    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format($p$
      create policy %I on public.%I for delete to authenticated
      using (user_id = (select auth.uid()))
    $p$, t || '_delete', t);

    -- Supabase grants ALL on public tables to anon/authenticated by default.
    -- Revoke, then hand back exactly what RLS is meant to constrain. anon
    -- gets nothing at all: none of this is public data.
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$$;


-- --- activity_logs: append-only ---------------------------------------------
alter table public.activity_logs enable row level security;

drop policy if exists activity_logs_select on public.activity_logs;
create policy activity_logs_select on public.activity_logs
  for select to authenticated
  using (public.has_student_access(user_id));

drop policy if exists activity_logs_insert on public.activity_logs;
create policy activity_logs_insert on public.activity_logs
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and actor_id = (select auth.uid())
  );

-- No UPDATE policy and no DELETE policy, by design: history is not editable.
revoke all on public.activity_logs from anon, authenticated;
grant select, insert on public.activity_logs to authenticated;


-- --- admin_student_links: the consent handshake -----------------------------
alter table public.admin_student_links enable row level security;

-- Both sides can see the link. The student seeing it is the point: support
-- access is never invisible to the person being supported.
drop policy if exists admin_student_links_select on public.admin_student_links;
create policy admin_student_links_select on public.admin_student_links
  for select to authenticated
  using (
    admin_id = (select auth.uid())
    or student_id = (select auth.uid())
  );

-- Only an admin may request, only on their own behalf, only as pending.
drop policy if exists admin_student_links_insert on public.admin_student_links;
create policy admin_student_links_insert on public.admin_student_links
  for insert to authenticated
  with check (
    admin_id = (select auth.uid())
    and public.is_admin()
    and status = 'pending'
  );

-- The student is the only one who can grant. They can also revoke.
drop policy if exists admin_student_links_student_respond on public.admin_student_links;
create policy admin_student_links_student_respond on public.admin_student_links
  for update to authenticated
  using (student_id = (select auth.uid()))
  with check (student_id = (select auth.uid()));

-- The admin may withdraw their own request or hand back access, but
-- `status <> 'active'` in WITH CHECK means they can never grant it.
drop policy if exists admin_student_links_admin_withdraw on public.admin_student_links;
create policy admin_student_links_admin_withdraw on public.admin_student_links
  for update to authenticated
  using (admin_id = (select auth.uid()))
  with check (admin_id = (select auth.uid()) and status <> 'active');

-- No DELETE policy: revoking sets status, it does not erase the record that
-- access once existed.
revoke all on public.admin_student_links from anon, authenticated;
grant select on public.admin_student_links to authenticated;
-- Column-level INSERT: `status` is not grantable, so it cannot be set at
-- insert time and falls to its 'pending' default no matter what is sent.
grant insert (admin_id, student_id, note) on public.admin_student_links to authenticated;
-- Column-level UPDATE: only the status may move. admin_id and student_id are
-- immutable, so a link can never be re-pointed at a different student.
grant update (status) on public.admin_student_links to authenticated;


-- ----------------------------------------------------------------------------
-- 12. Function grants
-- ----------------------------------------------------------------------------
-- Default EXECUTE on functions is granted to PUBLIC, which would let `anon`
-- call these security-definer helpers. Harmless today (auth.uid() is null for
-- anon, so both return false) but not something to leave lying around.

revoke all on function public.has_student_access(uuid) from public, anon;
grant execute on function public.has_student_access(uuid) to authenticated;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
