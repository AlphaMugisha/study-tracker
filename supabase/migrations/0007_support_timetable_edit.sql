-- ---------------------------------------------------------------------------
-- 0007 — a linked support account may edit the TIMETABLE
-- ---------------------------------------------------------------------------
-- This is the first write in StudyFlow that crosses an account boundary, and
-- 0002 says in as many words that no policy grants an admin write access. That
-- sentence stops being true here, so this migration is deliberately narrow and
-- states exactly how far it goes.
--
-- WHAT OPENS
--   timetable_versions   insert / update / delete
--   timetable_entries    insert / update / delete
--   subjects             insert / update        (see below)
--
-- WHAT STAYS SHUT — unchanged, still owner-only
--   assignments          her homework is hers to set and to tick off
--   revision_tasks
--   study_sessions
--   help_requests        a list a parent can close is a list she stops keeping
--   subjects DELETE      deleting a subject cascades into her homework
--   profiles             a support account still cannot rename her or move
--                        her timezone
--
-- Subjects are included because they have to be. `timetable_entries` carries
-- `timetable_entries_class_has_subject`: a lesson must name a subject. Without
-- INSERT on subjects, a parent could not add a single lesson for a subject she
-- had not already created. UPDATE is included so a misspelled subject can be
-- corrected; DELETE is not, because subjects cascade into assignments and that
-- is homework, not timetable.
--
-- SHE CAN ALWAYS SEE IT. The activity log's INSERT policy is widened so an
-- action can be recorded against her record with `actor_id` set to whoever did
-- it. She reads her own log, so every edit her parent makes appears in it,
-- attributed. The consent model is unchanged and still hers: she granted the
-- link, she can see it, and revoking it closes this the moment she does.
-- ---------------------------------------------------------------------------

-- The write-side predicate. Deliberately NOT `has_student_access`, which is
-- the read-side one and is used by a dozen policies — widening that would
-- silently open every table at once.
create or replace function public.can_manage_timetable(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- your own timetable
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

comment on function public.can_manage_timetable(uuid) is
  'True if the caller owns the row, or is an admin with an active link to its owner. WRITE access, and only for timetable data plus the subjects a lesson needs. Homework, revision, sessions, help requests and profiles remain owner-only.';

revoke all on function public.can_manage_timetable(uuid) from public, anon;
grant execute on function public.can_manage_timetable(uuid) to authenticated;

-- --- the timetable itself ---------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['timetable_versions', 'timetable_entries']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format($p$
      create policy %I on public.%I for insert to authenticated
      with check (public.can_manage_timetable(user_id))
    $p$, t || '_insert', t);

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format($p$
      create policy %I on public.%I for update to authenticated
      using (public.can_manage_timetable(user_id))
      with check (public.can_manage_timetable(user_id))
    $p$, t || '_update', t);

    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format($p$
      create policy %I on public.%I for delete to authenticated
      using (public.can_manage_timetable(user_id))
    $p$, t || '_delete', t);
  end loop;
end
$$;

-- --- subjects: insert and update only ---------------------------------------
-- DELETE is pointedly left as it was. `assignments.subject_id` references
-- subjects, so removing one reaches into her homework, which this migration
-- does not open.

drop policy if exists subjects_insert on public.subjects;
create policy subjects_insert on public.subjects
  for insert to authenticated
  with check (public.can_manage_timetable(user_id));

drop policy if exists subjects_update on public.subjects;
create policy subjects_update on public.subjects
  for update to authenticated
  using (public.can_manage_timetable(user_id))
  with check (public.can_manage_timetable(user_id));

-- --- the audit trail --------------------------------------------------------
-- Previously `user_id = auth.uid() AND actor_id = auth.uid()`, which made it
-- impossible to record that somebody else acted. Now the actor must still be
-- the caller — nobody can attribute an action to a third party — but the
-- record it lands on may be one the caller has access to.
--
-- `has_student_access` is the right predicate here rather than the narrower
-- write one: it is already what decides who may READ the log, so this cannot
-- write a row into a log the writer could not already see.

drop policy if exists activity_logs_insert on public.activity_logs;
create policy activity_logs_insert on public.activity_logs
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and public.has_student_access(user_id)
  );

-- Still no UPDATE and no DELETE policy. History remains unwritable after the
-- fact, for everybody, which is what makes the daily reports trustworthy.
