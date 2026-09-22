-- ============================================================================
-- Behavioural verification for 0001_auth_and_profiles.sql
-- ============================================================================
-- Run after 00_supabase_shim.sql and the migration itself.
-- Everything happens in one transaction and is rolled back at the end, so the
-- database is left exactly as it was found.
--
-- Each check records a row in `results`; the final block raises if any failed,
-- so a non-zero exit code means a real failure rather than a parse error.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

begin;

create temp table results (
  seq      serial primary key,
  name     text,
  passed   boolean,
  detail   text
) on commit drop;

-- Fixture identities -------------------------------------------------------
\set ava    '''aaaaaaaa-0000-4000-8000-000000000001'''
\set other  '''bbbbbbbb-0000-4000-8000-000000000002'''
\set admin  '''cccccccc-0000-4000-8000-000000000003'''
\set plain  '''dddddddd-0000-4000-8000-000000000004'''


-- ---------------------------------------------------------------------------
-- Structural checks
-- ---------------------------------------------------------------------------
insert into results (name, passed, detail)
select 'profiles table exists',
       count(*) = 1,
       'found ' || count(*)
from information_schema.tables
where table_schema = 'public' and table_name = 'profiles';

insert into results (name, passed, detail)
select 'required columns present (id, full_name, role, timezone, created_at)',
       count(*) = 5,
       string_agg(column_name, ', ' order by column_name)
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('id', 'full_name', 'role', 'timezone', 'created_at');

insert into results (name, passed, detail)
select 'id references auth.users with ON DELETE CASCADE',
       count(*) = 1,
       coalesce(string_agg(confdeltype::text, ','), 'none')
from pg_constraint
where conrelid = 'public.profiles'::regclass
  and contype = 'f'
  and confrelid = 'auth.users'::regclass
  and confdeltype = 'c';

insert into results (name, passed, detail)
select 'role column defaults to student',
       column_default like '%student%',
       coalesce(column_default, 'no default')
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'role';

insert into results (name, passed, detail)
select 'user_role enum has exactly (student, admin)',
       array_agg(e.enumlabel::text order by e.enumsortorder) = array['student', 'admin'],
       array_agg(e.enumlabel::text order by e.enumsortorder)::text
from pg_type t
join pg_enum e on e.enumtypid = t.oid
where t.typname = 'user_role';


-- ---------------------------------------------------------------------------
-- RLS is actually on (not merely policied)
-- ---------------------------------------------------------------------------
insert into results (name, passed, detail)
select 'RLS enabled on profiles',
       bool_and(relrowsecurity),
       'relrowsecurity=' || bool_and(relrowsecurity)::text
from pg_class
where oid = 'public.profiles'::regclass;

insert into results (name, passed, detail)
select 'policies present: select own + update own, no insert/delete policy',
       count(*) filter (where cmd = 'SELECT') = 1
         and count(*) filter (where cmd = 'UPDATE') = 1
         and count(*) filter (where cmd in ('INSERT', 'DELETE', 'ALL')) = 0,
       coalesce(string_agg(policyname || ':' || cmd, ', ' order by policyname), 'none')
from pg_policies
where schemaname = 'public' and tablename = 'profiles';


-- ---------------------------------------------------------------------------
-- Column privileges: the privilege-escalation guard
-- ---------------------------------------------------------------------------
insert into results (name, passed, detail)
select 'authenticated has UPDATE on full_name and timezone only',
       array_agg(column_name::text order by column_name) = array['full_name', 'timezone'],
       coalesce(array_agg(column_name::text order by column_name)::text, 'none')
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
  and grantee = 'authenticated' and privilege_type = 'UPDATE';

insert into results (name, passed, detail)
select 'authenticated has NO table-level INSERT or DELETE',
       count(*) = 0,
       coalesce(string_agg(privilege_type, ', '), 'none')
from information_schema.table_privileges
where table_schema = 'public' and table_name = 'profiles'
  and grantee = 'authenticated' and privilege_type in ('INSERT', 'DELETE');

insert into results (name, passed, detail)
select 'anon has no privileges on profiles at all',
       count(*) = 0,
       coalesce(string_agg(privilege_type, ', '), 'none')
from information_schema.table_privileges
where table_schema = 'public' and table_name = 'profiles' and grantee = 'anon';


-- ---------------------------------------------------------------------------
-- Trigger and functions
-- ---------------------------------------------------------------------------
insert into results (name, passed, detail)
select 'on_auth_user_created trigger exists on auth.users',
       count(*) = 1,
       'found ' || count(*)
from pg_trigger
where tgrelid = 'auth.users'::regclass
  and tgname = 'on_auth_user_created'
  and not tgisinternal;

insert into results (name, passed, detail)
select 'handle_new_user is SECURITY DEFINER with empty search_path',
       bool_and(p.prosecdef) and bool_and(coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'),
       coalesce(string_agg(array_to_string(p.proconfig, ','), '; '), 'no proconfig')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'handle_new_user';

insert into results (name, passed, detail)
select 'is_admin is SECURITY DEFINER and STABLE',
       bool_and(p.prosecdef) and bool_and(p.provolatile = 's'),
       'secdef=' || bool_and(p.prosecdef)::text || ' volatile=' || string_agg(p.provolatile::text, ',')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'is_admin';


-- ---------------------------------------------------------------------------
-- The trigger, exercised
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  (:ava::uuid,   'ava@school.com',     '{"full_name":"Ava Mukamana","timezone":"Africa/Kigali"}'::jsonb),
  (:other::uuid, 'other@school.com',   '{"full_name":"Other Student","timezone":"UTC"}'::jsonb),
  (:admin::uuid, 'support@school.com', '{"full_name":"Support Account"}'::jsonb),
  (:plain::uuid, 'nometa@school.com',  '{}'::jsonb);

insert into results (name, passed, detail)
select 'trigger created a profile for every new auth.users row',
       count(*) = 4,
       'profiles created: ' || count(*)
from public.profiles
where id in (:ava::uuid, :other::uuid, :admin::uuid, :plain::uuid);

insert into results (name, passed, detail)
select 'full_name stored from signup metadata',
       full_name = 'Ava Mukamana',
       'full_name=' || full_name
from public.profiles where id = :ava::uuid;

insert into results (name, passed, detail)
select 'default role is student',
       role = 'student',
       'role=' || role::text
from public.profiles where id = :ava::uuid;

insert into results (name, passed, detail)
select 'timezone stored from signup metadata',
       timezone = 'Africa/Kigali',
       'timezone=' || timezone
from public.profiles where id = :ava::uuid;

insert into results (name, passed, detail)
select 'full_name falls back to email local-part when metadata is empty',
       full_name = 'nometa',
       'full_name=' || full_name
from public.profiles where id = :plain::uuid;

insert into results (name, passed, detail)
select 'timezone falls back to UTC when metadata is empty',
       timezone = 'UTC',
       'timezone=' || timezone
from public.profiles where id = :plain::uuid;

-- Promote one account, as an operator would with the service role key.
update public.profiles set role = 'admin' where id = :admin::uuid;


-- ---------------------------------------------------------------------------
-- RLS behaviour, acting as a real authenticated student
-- ---------------------------------------------------------------------------
do $$
declare
  ava_id   constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  other_id constant uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  admin_id constant uuid := 'cccccccc-0000-4000-8000-000000000003';
  visible  integer;
  ok       boolean;
  detail   text;
  name_now text;
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', ava_id)::text, true);
  execute 'set local role authenticated';

  -- 1. Can read own profile, and ONLY own profile.
  select count(*) into visible from public.profiles;
  execute 'reset role';
  insert into results (name, passed, detail)
  values ('student sees exactly one row (their own)', visible = 1, 'rows visible: ' || visible);

  execute 'set local role authenticated';
  select count(*) into visible from public.profiles where id = ava_id;
  execute 'reset role';
  insert into results (name, passed, detail)
  values ('student can read their own profile', visible = 1, 'rows: ' || visible);

  execute 'set local role authenticated';
  select count(*) into visible from public.profiles where id = other_id;
  execute 'reset role';
  insert into results (name, passed, detail)
  values ('student cannot read another student''s profile', visible = 0, 'rows: ' || visible);

  -- 2. Cannot change own role -- this is the escalation guard.
  execute 'set local role authenticated';
  begin
    execute format('update public.profiles set role = %L where id = %L', 'admin', ava_id);
    ok := false;
    detail := 'UPDATE SUCCEEDED — PRIVILEGE ESCALATION POSSIBLE';
  exception
    when insufficient_privilege then
      ok := true; detail := 'blocked: ' || sqlerrm;
    when others then
      ok := true; detail := 'blocked (' || sqlstate || '): ' || sqlerrm;
  end;
  execute 'reset role';
  insert into results (name, passed, detail)
  values ('student CANNOT change their own role', ok, detail);

  -- confirm the role really is untouched
  select role::text into detail from public.profiles where id = ava_id;
  insert into results (name, passed, detail)
  values ('role still student after escalation attempt', detail = 'student', 'role=' || detail);

  -- 3. Can update the fields they are allowed to.
  execute 'set local role authenticated';
  begin
    execute format('update public.profiles set full_name = %L, timezone = %L where id = %L',
                   'Ava M.', 'Europe/London', ava_id);
    ok := true; detail := 'allowed';
  exception when others then
    ok := false; detail := 'unexpectedly blocked: ' || sqlerrm;
  end;
  execute 'reset role';
  select full_name into name_now from public.profiles where id = ava_id;
  insert into results (name, passed, detail)
  values ('student CAN update their own full_name and timezone',
          ok and name_now = 'Ava M.', detail || ', full_name=' || name_now);

  -- 4. Cannot touch another student's row (policy, not grants).
  execute 'set local role authenticated';
  begin
    execute format('update public.profiles set full_name = %L where id = %L', 'hacked', other_id);
    get diagnostics visible = row_count;
    ok := visible = 0;
    detail := 'rows affected: ' || visible;
  exception when others then
    ok := true; detail := 'blocked: ' || sqlerrm;
  end;
  execute 'reset role';
  insert into results (name, passed, detail)
  values ('student cannot update another student''s profile', ok, detail);

  -- 5. Cannot fabricate a profile row (no INSERT policy, no INSERT grant).
  execute 'set local role authenticated';
  begin
    execute format('insert into public.profiles (id, full_name, role) values (%L, %L, %L)',
                   gen_random_uuid(), 'Fake Admin', 'admin');
    ok := false; detail := 'INSERT SUCCEEDED — trigger could be bypassed';
  exception
    when insufficient_privilege then ok := true; detail := 'blocked: ' || sqlerrm;
    when others then ok := true; detail := 'blocked (' || sqlstate || '): ' || sqlerrm;
  end;
  execute 'reset role';
  insert into results (name, passed, detail)
  values ('student cannot INSERT a profile (trigger not bypassable)', ok, detail);

  -- 6. Cannot delete.
  execute 'set local role authenticated';
  begin
    execute format('delete from public.profiles where id = %L', ava_id);
    ok := false; detail := 'DELETE SUCCEEDED';
  exception
    when insufficient_privilege then ok := true; detail := 'blocked: ' || sqlerrm;
    when others then ok := true; detail := 'blocked (' || sqlstate || '): ' || sqlerrm;
  end;
  execute 'reset role';
  insert into results (name, passed, detail)
  values ('student cannot DELETE a profile', ok, detail);

  -- 7. is_admin() reflects the profile row, for both roles.
  execute 'set local role authenticated';
  select public.is_admin() into ok;
  execute 'reset role';
  insert into results (name, passed, detail)
  values ('is_admin() is false for a student', ok = false, 'returned ' || ok::text);

  perform set_config('request.jwt.claims',
                     json_build_object('sub', admin_id)::text, true);
  execute 'set local role authenticated';
  select public.is_admin() into ok;
  execute 'reset role';
  insert into results (name, passed, detail)
  values ('is_admin() is true for an admin', ok = true, 'returned ' || ok::text);

  -- 8. anon sees nothing at all.
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin
    select count(*) into visible from public.profiles;
    ok := visible = 0; detail := 'rows visible: ' || visible;
  exception when others then
    ok := true; detail := 'blocked: ' || sqlerrm;
  end;
  execute 'reset role';
  insert into results (name, passed, detail)
  values ('anonymous visitor sees no profiles', ok, detail);
end
$$;


-- ---------------------------------------------------------------------------
-- updated_at maintenance and cascade delete
-- ---------------------------------------------------------------------------
do $$
declare
  ava_id constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  before_ts timestamptz;
  after_ts  timestamptz;
  remaining integer;
begin
  -- set_updated_at() uses now(), which is the TRANSACTION timestamp and so is
  -- constant for the whole of this script. Comparing before/after inside one
  -- transaction would therefore always show a zero delta even though the
  -- trigger is working perfectly in production, where every request is its own
  -- transaction. Instead: park a deliberately stale value with the trigger
  -- disabled, re-enable it, and prove the next update rewrites it.
  alter table public.profiles disable trigger profiles_set_updated_at;
  update public.profiles set updated_at = timestamptz '2000-01-01 00:00:00+00'
   where id = ava_id;
  alter table public.profiles enable trigger profiles_set_updated_at;

  select updated_at into before_ts from public.profiles where id = ava_id;
  update public.profiles set full_name = 'Ava Mukamana' where id = ava_id;
  select updated_at into after_ts from public.profiles where id = ava_id;

  insert into results (name, passed, detail)
  values ('set_updated_at trigger rewrites updated_at on every update',
          before_ts = timestamptz '2000-01-01 00:00:00+00' and after_ts = now(),
          'stale ' || before_ts::text || ' -> ' || after_ts::text);

  delete from auth.users where id = ava_id;
  select count(*) into remaining from public.profiles where id = ava_id;

  insert into results (name, passed, detail)
  values ('deleting the auth user cascades to the profile', remaining = 0,
          'remaining rows: ' || remaining);
end
$$;


-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------
\echo ''
\echo '================ VERIFICATION RESULTS ================'
select
  lpad(seq::text, 2) as "#",
  case when passed then 'PASS' else 'FAIL' end as result,
  name,
  detail
from results
order by seq;

\echo ''
select
  count(*) filter (where passed)       as passed,
  count(*) filter (where not passed)   as failed,
  count(*)                             as total
from results;

do $$
declare failed integer;
begin
  select count(*) into failed from results where not passed;
  if failed > 0 then
    raise exception 'VERIFICATION FAILED: % check(s) did not pass', failed;
  end if;
  raise notice 'All checks passed.';
end
$$;

rollback;
