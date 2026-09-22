-- ============================================================================
-- Behavioural verification for 0002_core_schema.sql
-- ============================================================================
-- Run after 00_supabase_shim.sql, 0001 and 0002.
-- One transaction, rolled back at the end: the database is left untouched.
--
-- Cast of characters:
--   ava    student
--   ben    student, unrelated to ava
--   sara   admin, will hold an active link to ava
--   omar   admin, never linked to anyone
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

begin;

create temp table results (
  seq    serial primary key,
  area   text,
  name   text,
  passed boolean,
  detail text
) on commit drop;

-- Act as a signed-in user, exactly as PostgREST would.
create function pg_temp.act(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end $$;

create function pg_temp.stop() returns void language plpgsql as $$
begin
  execute 'reset role';
end $$;

create function pg_temp.rec(a text, n text, p boolean, d text) returns void
language plpgsql as $$
begin
  insert into results (area, name, passed, detail) values (a, n, p, d);
end $$;


-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
\set ava  '''a0000000-0000-4000-8000-000000000001'''
\set ben  '''b0000000-0000-4000-8000-000000000002'''
\set sara '''c0000000-0000-4000-8000-000000000003'''
\set omar '''d0000000-0000-4000-8000-000000000004'''

insert into auth.users (id, email, raw_user_meta_data) values
  (:ava::uuid,  'ava@school.com',     '{"full_name":"Ava Mukamana","timezone":"Africa/Kigali"}'::jsonb),
  (:ben::uuid,  'ben@school.com',     '{"full_name":"Ben Okoye","timezone":"Africa/Lagos"}'::jsonb),
  (:sara::uuid, 'sara@support.com',   '{"full_name":"Sara Support"}'::jsonb),
  (:omar::uuid, 'omar@support.com',   '{"full_name":"Omar Support"}'::jsonb);

update public.profiles set role = 'admin' where id in (:sara::uuid, :omar::uuid);

-- A believable Monday for Ava, created as the operator.
insert into public.subjects (id, user_id, name, short_name, color_token) values
  ('11111111-0000-4000-8000-000000000001', :ava::uuid, 'Mathematics', 'Maths', 'chart-1'),
  ('11111111-0000-4000-8000-000000000002', :ava::uuid, 'English',     'Eng',   'chart-2'),
  ('11111111-0000-4000-8000-000000000003', :ava::uuid, 'Biology',     'Bio',   'chart-3');

insert into public.subjects (id, user_id, name) values
  ('22222222-0000-4000-8000-000000000001', :ben::uuid, 'Physics');

insert into public.timetable_versions (id, user_id, status, confirmed_at, effective_from)
values ('33333333-0000-4000-8000-000000000001', :ava::uuid, 'active', now(), current_date - 30);

insert into public.timetable_entries
  (user_id, timetable_version_id, subject_id, activity_type, title, day_of_week, start_time, end_time)
values
  (:ava::uuid, '33333333-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'class', null, 1, '08:00', '09:00'),
  (:ava::uuid, '33333333-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000002', 'class', null, 1, '09:00', '10:00'),
  (:ava::uuid, '33333333-0000-4000-8000-000000000001', null,                                   'break', 'Break', 1, '10:00', '10:30'),
  (:ava::uuid, '33333333-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000003', 'class', null, 1, '10:30', '11:30');

insert into public.assignments (id, user_id, subject_id, title, due_date, priority, estimated_minutes)
values ('44444444-0000-4000-8000-000000000001', :ava::uuid, '11111111-0000-4000-8000-000000000001',
        'Quadratic equations', current_date + 1, 'high', 45);

insert into public.assignments (user_id, title, due_date)
values (:ben::uuid, 'Ben private homework', current_date + 2);


-- ---------------------------------------------------------------------------
-- A. Structure
-- ---------------------------------------------------------------------------
select pg_temp.rec('structure', 'all nine tables exist',
  count(*) = 9,
  string_agg(tablename, ', ' order by tablename))
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles','subjects','timetable_versions','timetable_entries',
                    'assignments','revision_tasks','study_sessions','activity_logs',
                    'admin_student_links');

select pg_temp.rec('structure', 'RLS enabled on every public table',
  bool_and(c.relrowsecurity),
  count(*) filter (where c.relrowsecurity) || '/' || count(*))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r';

select pg_temp.rec('structure', 'anon has no privileges on any academic table',
  count(*) = 0,
  coalesce(string_agg(distinct table_name, ', '), 'none'))
from information_schema.table_privileges
where table_schema = 'public' and grantee = 'anon'
  and table_name in ('subjects','timetable_versions','timetable_entries','assignments',
                     'revision_tasks','study_sessions','activity_logs','admin_student_links');

select pg_temp.rec('structure', 'activity_type enum contains no surveillance categories',
  not bool_or(e.enumlabel ~* 'key|location|browser|device|screen|camera|mic|history'),
  count(*) || ' academic event types')
from pg_type t join pg_enum e on e.enumtypid = t.oid
where t.typname = 'activity_type';


-- ---------------------------------------------------------------------------
-- B. Constraints
-- ---------------------------------------------------------------------------
do $$
declare ok boolean; d text;
begin
  -- end_time must follow start_time
  begin
    insert into public.timetable_entries
      (user_id, timetable_version_id, subject_id, activity_type, day_of_week, start_time, end_time)
    values ('a0000000-0000-4000-8000-000000000001','33333333-0000-4000-8000-000000000001',
            '11111111-0000-4000-8000-000000000001','class', 2, '11:00', '10:00');
    ok := false; d := 'accepted an end before its start';
  exception when others then ok := true; d := sqlstate; end;
  perform pg_temp.rec('constraints', 'timetable entry ending before it starts is rejected', ok, d);

  -- overlapping entries on the same day
  begin
    insert into public.timetable_entries
      (user_id, timetable_version_id, subject_id, activity_type, day_of_week, start_time, end_time)
    values ('a0000000-0000-4000-8000-000000000001','33333333-0000-4000-8000-000000000001',
            '11111111-0000-4000-8000-000000000002','class', 1, '08:30', '09:30');
    ok := false; d := 'accepted an overlapping lesson';
  exception when others then ok := true; d := sqlstate || ' exclusion constraint'; end;
  perform pg_temp.rec('constraints', 'overlapping timetable entries are rejected', ok, d);

  -- a class with no subject
  begin
    insert into public.timetable_entries
      (user_id, timetable_version_id, activity_type, day_of_week, start_time, end_time)
    values ('a0000000-0000-4000-8000-000000000001','33333333-0000-4000-8000-000000000001',
            'class', 3, '08:00', '09:00');
    ok := false; d := 'accepted a class with no subject';
  exception when others then ok := true; d := sqlstate; end;
  perform pg_temp.rec('constraints', 'a class must name a subject', ok, d);

  -- a break with neither subject nor title
  begin
    insert into public.timetable_entries
      (user_id, timetable_version_id, activity_type, day_of_week, start_time, end_time)
    values ('a0000000-0000-4000-8000-000000000001','33333333-0000-4000-8000-000000000001',
            'break', 3, '09:00', '09:30');
    ok := false; d := 'accepted an unlabelled break';
  exception when others then ok := true; d := sqlstate; end;
  perform pg_temp.rec('constraints', 'a non-class entry must be described', ok, d);

  -- breaks and free periods ARE allowed when labelled
  begin
    insert into public.timetable_entries
      (user_id, timetable_version_id, activity_type, title, day_of_week, start_time, end_time)
    values ('a0000000-0000-4000-8000-000000000001','33333333-0000-4000-8000-000000000001',
            'free', 'Study hall', 3, '09:00', '09:30');
    ok := true; d := 'accepted';
  exception when others then ok := false; d := 'rejected: ' || sqlerrm; end;
  perform pg_temp.rec('constraints', 'labelled free periods are accepted', ok, d);

  -- cross-user subject reference (composite FK)
  begin
    insert into public.timetable_entries
      (user_id, timetable_version_id, subject_id, activity_type, day_of_week, start_time, end_time)
    values ('a0000000-0000-4000-8000-000000000001','33333333-0000-4000-8000-000000000001',
            '22222222-0000-4000-8000-000000000001', 'class', 4, '08:00', '09:00');
    ok := false; d := 'ACCEPTED ANOTHER USER''S SUBJECT';
  exception when others then ok := true; d := sqlstate || ' composite FK'; end;
  perform pg_temp.rec('constraints', 'an entry cannot reference another user''s subject', ok, d);

  -- assignment estimate out of range
  begin
    insert into public.assignments (user_id, title, due_date, estimated_minutes)
    values ('a0000000-0000-4000-8000-000000000001', 'Silly', current_date, 9999);
    ok := false; d := 'accepted a 9999-minute estimate';
  exception when others then ok := true; d := sqlstate; end;
  perform pg_temp.rec('constraints', 'absurd time estimates are rejected', ok, d);

  -- completed without a timestamp: the trigger fills it rather than failing
  begin
    insert into public.assignments (id, user_id, title, due_date, status)
    values ('44444444-0000-4000-8000-0000000000ff','a0000000-0000-4000-8000-000000000001',
            'Marked done', current_date, 'completed');
    select completed_at is not null into ok
      from public.assignments where id = '44444444-0000-4000-8000-0000000000ff';
    d := 'completed_at auto-filled: ' || ok::text;
  exception when others then ok := false; d := 'error: ' || sqlerrm; end;
  perform pg_temp.rec('constraints', 'completing a task fills completed_at', ok, d);

  -- and clearing the status clears the timestamp
  update public.assignments set status = 'in_progress'
   where id = '44444444-0000-4000-8000-0000000000ff';
  select completed_at is null into ok
    from public.assignments where id = '44444444-0000-4000-8000-0000000000ff';
  perform pg_temp.rec('constraints', 'un-completing a task clears completed_at', ok,
                      'completed_at null: ' || ok::text);

  -- two active timetable versions covering the same dates
  begin
    insert into public.timetable_versions (user_id, status, confirmed_at, effective_from)
    values ('a0000000-0000-4000-8000-000000000001', 'active', now(), current_date - 10);
    ok := false; d := 'ACCEPTED A SECOND OVERLAPPING ACTIVE VERSION';
  exception when others then ok := true; d := sqlstate || ' exclusion constraint'; end;
  perform pg_temp.rec('constraints', 'only one active timetable per period', ok, d);

  -- a draft version over the same dates is fine
  begin
    insert into public.timetable_versions (user_id, status, effective_from)
    values ('a0000000-0000-4000-8000-000000000001', 'draft', current_date - 10);
    ok := true; d := 'accepted';
  exception when others then ok := false; d := 'rejected: ' || sqlerrm; end;
  perform pg_temp.rec('constraints', 'a draft may overlap an active version', ok, d);

  -- study session pointing at two things at once
  begin
    insert into public.study_sessions (user_id, assignment_id, revision_task_id, started_at)
    values ('a0000000-0000-4000-8000-000000000001','44444444-0000-4000-8000-000000000001',
            gen_random_uuid(), now());
    ok := false; d := 'accepted a session targeting two things';
  exception when others then ok := true; d := sqlstate; end;
  perform pg_temp.rec('constraints', 'a study session targets at most one item', ok, d);

  -- duration is computed on close
  declare sid uuid;
  begin
    insert into public.study_sessions (user_id, started_at, ended_at)
    values ('a0000000-0000-4000-8000-000000000001', now() - interval '45 minutes', now())
    returning id into sid;
    select duration_minutes between 44 and 46 into ok from public.study_sessions where id = sid;
    select 'duration_minutes=' || duration_minutes into d from public.study_sessions where id = sid;
  exception when others then ok := false; d := 'error: ' || sqlerrm; end;
  perform pg_temp.rec('constraints', 'session duration is computed on close', ok, d);
end
$$;


-- ---------------------------------------------------------------------------
-- C. Student isolation
-- ---------------------------------------------------------------------------
do $$
declare
  ava  constant uuid := 'a0000000-0000-4000-8000-000000000001';
  ben  constant uuid := 'b0000000-0000-4000-8000-000000000002';
  n int; ok boolean; d text;
begin
  perform pg_temp.act(ava);
  select count(*) into n from public.assignments where user_id = ben;
  perform pg_temp.stop();
  perform pg_temp.rec('isolation', 'student A cannot read student B''s assignments', n = 0, 'rows: ' || n);

  perform pg_temp.act(ava);
  select count(*) into n from public.subjects where user_id = ben;
  perform pg_temp.stop();
  perform pg_temp.rec('isolation', 'student A cannot read student B''s subjects', n = 0, 'rows: ' || n);

  perform pg_temp.act(ava);
  select count(*) into n from public.assignments;
  perform pg_temp.stop();
  perform pg_temp.rec('isolation', 'student A sees only their own assignments', n = 2, 'rows: ' || n);

  -- UPDATE against another user's rows matches nothing (RLS filters, no error)
  perform pg_temp.act(ava);
  begin
    update public.timetable_entries set room = 'hacked' where user_id = ben;
    get diagnostics n = row_count; ok := n = 0; d := 'rows affected: ' || n;
  exception when others then ok := true; d := 'blocked: ' || sqlerrm; end;
  perform pg_temp.stop();
  perform pg_temp.rec('isolation', 'student A cannot modify student B''s timetable', ok, d);

  -- INSERT attributed to someone else is refused by WITH CHECK
  perform pg_temp.act(ava);
  begin
    insert into public.assignments (user_id, title, due_date)
    values (ben, 'planted', current_date);
    ok := false; d := 'INSERT SUCCEEDED';
  exception when others then ok := true; d := 'blocked: ' || sqlstate; end;
  perform pg_temp.stop();
  perform pg_temp.rec('isolation', 'student A cannot create rows owned by student B', ok, d);

  perform pg_temp.act(ava);
  begin
    delete from public.assignments where user_id = ben;
    get diagnostics n = row_count; ok := n = 0; d := 'rows deleted: ' || n;
  exception when others then ok := true; d := 'blocked: ' || sqlerrm; end;
  perform pg_temp.stop();
  perform pg_temp.rec('isolation', 'student A cannot delete student B''s work', ok, d);

  -- carried forward from Phase 1A, re-asserted here
  perform pg_temp.act(ava);
  begin
    update public.profiles set role = 'admin' where id = ava;
    ok := false; d := 'PRIVILEGE ESCALATION POSSIBLE';
  exception when others then ok := true; d := 'blocked: ' || sqlstate; end;
  perform pg_temp.stop();
  perform pg_temp.rec('isolation', 'student cannot change their own role', ok, d);

  perform pg_temp.anon();
  begin
    select count(*) into n from public.assignments;
    ok := n = 0; d := 'rows: ' || n;
  exception when others then ok := true; d := 'blocked: ' || sqlstate; end;
  perform pg_temp.stop();
  perform pg_temp.rec('isolation', 'anonymous visitors see no academic data', ok, d);
end
$$;


-- ---------------------------------------------------------------------------
-- D. Admin authorisation handshake
-- ---------------------------------------------------------------------------
do $$
declare
  ava  constant uuid := 'a0000000-0000-4000-8000-000000000001';
  ben  constant uuid := 'b0000000-0000-4000-8000-000000000002';
  sara constant uuid := 'c0000000-0000-4000-8000-000000000003';
  omar constant uuid := 'd0000000-0000-4000-8000-000000000004';
  link uuid; n int; ok boolean; d text;
begin
  -- 1. An unlinked admin is blind.
  perform pg_temp.act(sara);
  select count(*) into n from public.assignments where user_id = ava;
  perform pg_temp.stop();
  perform pg_temp.rec('admin', 'an unlinked admin cannot read a student''s assignments', n = 0, 'rows: ' || n);

  perform pg_temp.act(sara);
  select count(*) into n from public.timetable_entries where user_id = ava;
  perform pg_temp.stop();
  perform pg_temp.rec('admin', 'an unlinked admin cannot read a student''s timetable', n = 0, 'rows: ' || n);

  -- 2. An admin cannot grant themselves access.
  perform pg_temp.act(sara);
  begin
    insert into public.admin_student_links (admin_id, student_id, status)
    values (sara, ava, 'active');
    ok := false; d := 'ADMIN SELF-ACTIVATED';
  exception when others then ok := true; d := 'blocked: ' || sqlstate; end;
  perform pg_temp.stop();
  perform pg_temp.rec('admin', 'an admin cannot insert an already-active link', ok, d);

  -- 3. An admin may request.
  perform pg_temp.act(sara);
  begin
    insert into public.admin_student_links (admin_id, student_id, note)
    values (sara, ava, 'Support for term 2');
    ok := true; d := 'accepted as pending';
  exception when others then ok := false; d := 'rejected: ' || sqlerrm; end;
  perform pg_temp.stop();
  perform pg_temp.rec('admin', 'an admin may request access (pending)', ok, d);

  select id into link from public.admin_student_links where admin_id = sara and student_id = ava;

  select status = 'pending' into ok from public.admin_student_links where id = link;
  perform pg_temp.rec('admin', 'the request lands as pending, not active', ok,
    (select 'status=' || status from public.admin_student_links where id = link));

  -- 4. A pending link grants nothing.
  perform pg_temp.act(sara);
  select count(*) into n from public.assignments where user_id = ava;
  perform pg_temp.stop();
  perform pg_temp.rec('admin', 'a pending link grants no access', n = 0, 'rows: ' || n);

  -- 5. The admin cannot self-activate by update either.
  perform pg_temp.act(sara);
  begin
    update public.admin_student_links set status = 'active' where id = link;
    get diagnostics n = row_count;
    ok := n = 0; d := 'rows affected: ' || n || ' (WITH CHECK refused)';
  exception when others then ok := true; d := 'blocked: ' || sqlstate; end;
  perform pg_temp.stop();
  perform pg_temp.rec('admin', 'an admin cannot activate their own link', ok, d);

  select status = 'pending' into ok from public.admin_student_links where id = link;
  perform pg_temp.rec('admin', 'link is still pending after that attempt', ok,
    (select 'status=' || status from public.admin_student_links where id = link));

  -- 6. The student can see the request. Transparency is the point.
  perform pg_temp.act(ava);
  select count(*) into n from public.admin_student_links where student_id = ava;
  perform pg_temp.stop();
  perform pg_temp.rec('admin', 'the student can see the pending request', n = 1, 'rows: ' || n);

  -- 7. The student grants.
  perform pg_temp.act(ava);
  begin
    update public.admin_student_links set status = 'active' where id = link;
    get diagnostics n = row_count; ok := n = 1; d := 'rows affected: ' || n;
  exception when others then ok := false; d := 'blocked: ' || sqlerrm; end;
  perform pg_temp.stop();
  perform pg_temp.rec('admin', 'the student can activate the link', ok, d);

  -- 8. Now the admin can read.
  perform pg_temp.act(sara);
  select count(*) into n from public.assignments where user_id = ava;
  perform pg_temp.stop();
  perform pg_temp.rec('admin', 'a linked admin CAN read the student''s assignments', n = 2, 'rows: ' || n);

  perform pg_temp.act(sara);
  select count(*) into n from public.timetable_entries where user_id = ava;
  perform pg_temp.stop();
  perform pg_temp.rec('admin', 'a linked admin CAN read the student''s timetable', n > 0, 'rows: ' || n);

  -- 9. But only that student.
  perform pg_temp.act(sara);
  select count(*) into n from public.assignments where user_id = ben;
  perform pg_temp.stop();
  perform pg_temp.rec('admin', 'the link does not leak other students', n = 0, 'rows: ' || n);

  -- 10. A second, unlinked admin stays blind.
  perform pg_temp.act(omar);
  select count(*) into n from public.assignments where user_id = ava;
  perform pg_temp.stop();
  perform pg_temp.rec('admin', 'a different admin is unaffected by someone else''s link', n = 0, 'rows: ' || n);

  -- 11. Read-only: no write anywhere, ever.
  perform pg_temp.act(sara);
  begin
    update public.assignments set title = 'edited by admin' where user_id = ava;
    get diagnostics n = row_count; ok := n = 0; d := 'rows affected: ' || n;
  exception when others then ok := true; d := 'blocked: ' || sqlstate; end;
  perform pg_temp.stop();
  perform pg_temp.rec('admin', 'a linked admin cannot EDIT the student''s work', ok, d);

  perform pg_temp.act(sara);
  begin
    delete from public.assignments where user_id = ava;
    get diagnostics n = row_count; ok := n = 0; d := 'rows deleted: ' || n;
  exception when others then ok := true; d := 'blocked: ' || sqlstate; end;
  perform pg_temp.stop();
  perform pg_temp.rec('admin', 'a linked admin cannot DELETE the student''s work', ok, d);

  perform pg_temp.act(sara);
  begin
    insert into public.assignments (user_id, title, due_date) values (ava, 'planted by admin', current_date);
    ok := false; d := 'INSERT SUCCEEDED';
  exception when others then ok := true; d := 'blocked: ' || sqlstate; end;
  perform pg_temp.stop();
  perform pg_temp.rec('admin', 'a linked admin cannot CREATE work for the student', ok, d);

  -- 12. The student revokes. Access ends immediately.
  perform pg_temp.act(ava);
  update public.admin_student_links set status = 'revoked' where id = link;
  perform pg_temp.stop();

  perform pg_temp.act(sara);
  select count(*) into n from public.assignments where user_id = ava;
  perform pg_temp.stop();
  perform pg_temp.rec('admin', 'REVOKING the link removes access immediately', n = 0, 'rows: ' || n);

  select revoked_at is not null into ok from public.admin_student_links where id = link;
  perform pg_temp.rec('admin', 'revoked_at is stamped automatically', ok, 'revoked_at set: ' || ok::text);

  -- 13. The admin cannot re-activate what was revoked.
  perform pg_temp.act(sara);
  begin
    update public.admin_student_links set status = 'active' where id = link;
    get diagnostics n = row_count; ok := n = 0; d := 'rows affected: ' || n;
  exception when others then ok := true; d := 'blocked: ' || sqlstate; end;
  perform pg_temp.stop();
  perform pg_temp.rec('admin', 'an admin cannot re-activate a revoked link', ok, d);

  -- 14. The link cannot be re-pointed at a different student.
  perform pg_temp.act(sara);
  begin
    update public.admin_student_links set student_id = ben where id = link;
    ok := false; d := 'RE-POINTED AT ANOTHER STUDENT';
  exception when others then ok := true; d := 'blocked: ' || sqlstate; end;
  perform pg_temp.stop();
  perform pg_temp.rec('admin', 'a link cannot be re-pointed at another student', ok, d);

  -- 15. A non-admin cannot mint a link at all.
  perform pg_temp.act(ava);
  begin
    insert into public.admin_student_links (admin_id, student_id) values (ava, ben);
    ok := false; d := 'STUDENT CREATED A LINK';
  exception when others then ok := true; d := 'blocked: ' || sqlstate; end;
  perform pg_temp.stop();
  perform pg_temp.rec('admin', 'a student cannot create an authorisation link', ok, d);

  -- 16. And nobody can erase the record that access once existed.
  perform pg_temp.act(ava);
  begin
    delete from public.admin_student_links where id = link;
    get diagnostics n = row_count; ok := n = 0; d := 'rows deleted: ' || n;
  exception when others then ok := true; d := 'blocked: ' || sqlstate; end;
  perform pg_temp.stop();
  perform pg_temp.rec('admin', 'links are revoked, never deleted', ok, d);
end
$$;


-- ---------------------------------------------------------------------------
-- E. Activity log is append-only
-- ---------------------------------------------------------------------------
do $$
declare
  ava  constant uuid := 'a0000000-0000-4000-8000-000000000001';
  ben  constant uuid := 'b0000000-0000-4000-8000-000000000002';
  lid uuid; n int; ok boolean; d text;
begin
  perform pg_temp.act(ava);
  begin
    insert into public.activity_logs (user_id, actor_id, activity_type, entity_type)
    values (ava, ava, 'assignment_completed', 'assignment');
    ok := true; d := 'accepted';
  exception when others then ok := false; d := 'rejected: ' || sqlerrm; end;
  perform pg_temp.stop();
  perform pg_temp.rec('activity log', 'a student can append their own events', ok, d);

  select id into lid from public.activity_logs where user_id = ava limit 1;

  perform pg_temp.act(ava);
  begin
    update public.activity_logs set activity_type = 'assignment_created' where id = lid;
    ok := false; d := 'HISTORY REWRITTEN';
  exception when others then ok := true; d := 'blocked: ' || sqlstate; end;
  perform pg_temp.stop();
  perform pg_temp.rec('activity log', 'a student cannot rewrite history', ok, d);

  perform pg_temp.act(ava);
  begin
    delete from public.activity_logs where id = lid;
    get diagnostics n = row_count; ok := n = 0; d := 'rows deleted: ' || n;
  exception when others then ok := true; d := 'blocked: ' || sqlstate; end;
  perform pg_temp.stop();
  perform pg_temp.rec('activity log', 'a student cannot delete history', ok, d);

  -- even the table owner cannot, because the block is a trigger
  begin
    update public.activity_logs set activity_type = 'assignment_created' where id = lid;
    ok := false; d := 'owner rewrote history';
  exception when others then ok := true; d := 'blocked even for the owner: ' || sqlstate; end;
  perform pg_temp.rec('activity log', 'not even the table owner can rewrite history', ok, d);

  -- cannot forge an event as somebody else
  perform pg_temp.act(ava);
  begin
    insert into public.activity_logs (user_id, actor_id, activity_type)
    values (ben, ava, 'assignment_completed');
    ok := false; d := 'FORGED AN ENTRY AGAINST ANOTHER STUDENT';
  exception when others then ok := true; d := 'blocked: ' || sqlstate; end;
  perform pg_temp.stop();
  perform pg_temp.rec('activity log', 'a student cannot log events against another student', ok, d);

  perform pg_temp.act(ava);
  begin
    insert into public.activity_logs (user_id, actor_id, activity_type)
    values (ava, ben, 'assignment_completed');
    ok := false; d := 'FORGED THE ACTOR';
  exception when others then ok := true; d := 'blocked: ' || sqlstate; end;
  perform pg_temp.stop();
  perform pg_temp.rec('activity log', 'a student cannot forge who performed an action', ok, d);
end
$$;


-- ---------------------------------------------------------------------------
-- F. Realistic data is queryable
-- ---------------------------------------------------------------------------
do $$
declare
  ava constant uuid := 'a0000000-0000-4000-8000-000000000001';
  n int; ok boolean;
begin
  perform pg_temp.act(ava);
  select count(*) into n
  from public.timetable_entries e
  join public.timetable_versions v on v.id = e.timetable_version_id
  left join public.subjects s on s.id = e.subject_id
  where v.status = 'active' and e.day_of_week = 1;
  perform pg_temp.stop();
  perform pg_temp.rec('data', 'a full school day reads back through joins', n >= 4,
                      'Monday entries: ' || n);

  perform pg_temp.act(ava);
  select count(*) into n from public.timetable_entries
   where activity_type = 'break' and day_of_week = 1;
  perform pg_temp.stop();
  perform pg_temp.rec('data', 'breaks are stored as first-class entries', n = 1, 'breaks: ' || n);

  -- overdue is derived, never stored
  perform pg_temp.act(ava);
  select count(*) into n from public.assignments
   where status <> 'completed'
     and (due_date + coalesce(due_time, time '23:59')) < now();
  perform pg_temp.stop();
  perform pg_temp.rec('data', 'overdue is computable without a stored column', true,
                      'currently overdue: ' || n);

  select not exists (
    select 1 from pg_type t join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'task_status' and e.enumlabel = 'overdue'
  ) into ok;
  perform pg_temp.rec('data', 'task_status has no stored "overdue" member', ok, 'confirmed');
end
$$;


-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------
\echo ''
\echo '============== PHASE 2 VERIFICATION =============='
select lpad(seq::text, 2) as "#",
       case when passed then 'PASS' else 'FAIL' end as result,
       area, name, detail
from results order by seq;

\echo ''
select count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       count(*) as total
from results;

do $$
declare failed int;
begin
  select count(*) into failed from results where not passed;
  if failed > 0 then
    raise exception 'PHASE 2 VERIFICATION FAILED: % check(s) did not pass', failed;
  end if;
  raise notice 'All Phase 2 checks passed.';
end
$$;

rollback;
