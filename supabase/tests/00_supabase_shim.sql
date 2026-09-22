-- ============================================================================
-- Supabase compatibility shim — FOR LOCAL TESTING ONLY
-- ============================================================================
-- Never run this against a real Supabase project: it recreates objects that
-- Supabase already provides.
--
-- Its purpose is to make a stock PostgreSQL database close enough to Supabase
-- that supabase/migrations/*.sql can be executed unmodified and its security
-- behaviour tested honestly.
--
-- The important part is section 4. Supabase grants ALL on public tables to
-- `anon` and `authenticated` by default. Without reproducing that, the
-- `revoke all` in the migration would be a no-op and the test would "prove"
-- a protection that does not actually exist in production.
-- ============================================================================


-- 1. Roles ------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;


-- 2. auth schema ------------------------------------------------------------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;


-- 3. auth.users -------------------------------------------------------------
-- Only the columns GoTrue exposes that our trigger actually reads.
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  encrypted_password text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz not null default now()
);


-- 4. auth.uid() -------------------------------------------------------------
-- Mirrors Supabase's implementation: reads the `sub` claim out of the
-- request-scoped JWT GUC, which PostgREST sets per request and which our
-- tests set with `set local`.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;


-- 5. Supabase's default grants ----------------------------------------------
-- THIS IS THE LOAD-BEARING PART OF THE SHIM. Supabase hands `anon` and
-- `authenticated` blanket table privileges in `public`, and relies on RLS to
-- constrain them. Reproducing it here means the migration's `revoke all`
-- has something real to revoke.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
