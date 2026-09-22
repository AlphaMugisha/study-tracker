-- ============================================================================
-- StudyFlow — Phase 1: accounts and profiles
-- ============================================================================
-- Run this once against your Supabase project, either with
--   supabase db push
-- or by pasting it into the SQL Editor in the dashboard.
--
-- It is idempotent: re-running it is safe.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Roles
-- ----------------------------------------------------------------------------
-- Only two roles exist for the whole product. `student` owns their own data;
-- `admin` is the authorised support account. Phase 2 adds the
-- `admin_student_links` table that makes admin access explicit and revocable —
-- being an admin will not by itself grant sight of any student.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('student', 'admin');
  end if;
end
$$;


-- ----------------------------------------------------------------------------
-- 2. Profiles
-- ----------------------------------------------------------------------------
-- One row per auth.users row, created automatically by the trigger below.

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text             not null default '',
  role        public.user_role not null default 'student',
  timezone    text             not null default 'UTC',
  created_at  timestamptz      not null default now(),
  updated_at  timestamptz      not null default now()
);

comment on table public.profiles is
  'StudyFlow profile, 1:1 with auth.users. Created by the on_auth_user_created trigger.';
comment on column public.profiles.role is
  'Authorisation role. Not writable by the account holder — see the column grants below.';
comment on column public.profiles.timezone is
  'IANA timezone. The timetable engine resolves "now" in this zone, never the server''s.';


-- ----------------------------------------------------------------------------
-- 3. Row Level Security
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Deliberately no INSERT policy: profiles are created only by the
-- security-definer trigger, so a client cannot fabricate one.
-- Deliberately no DELETE policy: profiles die with their auth.users row.


-- ----------------------------------------------------------------------------
-- 4. Column privileges — the privilege-escalation guard
-- ----------------------------------------------------------------------------
-- RLS alone is not enough here. `profiles_update_own` lets a user update their
-- own row, and without this block that includes `role` — any student could
-- promote themselves to admin with a single PATCH. Column-level grants make
-- `role` unwritable over the API no matter what the policy allows.
--
-- Changing a role is therefore a deliberate act performed with the service
-- role key (SQL editor or a server-side admin task), never from the browser.

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, timezone) on public.profiles to authenticated;


-- ----------------------------------------------------------------------------
-- 5. Keep updated_at honest
-- ----------------------------------------------------------------------------
-- now() is the TRANSACTION timestamp, not the statement clock. That is
-- deliberate: every row touched by one request shares a single timestamp,
-- which is what you want when reconstructing what changed together. Use
-- clock_timestamp() only if you ever need sub-transaction ordering.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- ----------------------------------------------------------------------------
-- 6. Create the profile on signup
-- ----------------------------------------------------------------------------
-- Doing this in the database rather than in the application guarantees that a
-- profile exists for every account, whatever path the signup took — our form,
-- the Supabase dashboard, a future OAuth provider, or a confirmation email
-- clicked days later.
--
-- security definer + an empty search_path is the required combination: the
-- function needs to write past RLS, and the empty search_path forces every
-- identifier to be schema-qualified so the function cannot be hijacked.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, timezone)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'UTC')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ----------------------------------------------------------------------------
-- 7. Role helper for Phase 2 policies
-- ----------------------------------------------------------------------------
-- security definer is what keeps this safe to call from inside a policy on
-- `profiles` itself: the function reads the table with RLS bypassed, so there
-- is no recursive policy evaluation.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;


-- ----------------------------------------------------------------------------
-- 8. Backfill
-- ----------------------------------------------------------------------------
-- Covers accounts created before this migration ran (e.g. while testing).

insert into public.profiles (id, full_name)
select
  u.id,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(u.email, ''), '@', 1)
  )
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
