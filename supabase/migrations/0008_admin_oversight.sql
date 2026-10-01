-- ---------------------------------------------------------------------------
-- 0008 — oversight: a support account sees every student
-- ---------------------------------------------------------------------------
-- This REVERSES the central decision of 0002, so it states it openly rather
-- than burying it in a function body.
--
-- 0002 said:
--
--     An admin owns NOTHING and can WRITE nothing. Being an admin grants no
--     sight of any student by itself. Access requires an `active` row in
--     admin_student_links [...] That asymmetry is the whole point. An admin
--     who could self-activate would be surveillance.
--
-- The operator has asked for the opposite: every student visible in the
-- support portal, new registrations included, with no per-student approval
-- step. For a household where the support account belongs to the parent and
-- the student accounts belong to their own children, waiting on a fifteen-
-- year-old to approve her father is a formality that mostly produces an empty
-- portal — and a child who declines is not thereby unsupervised, only
-- unsupported.
--
-- So the asymmetry goes. What does NOT go, because without them this really
-- would be the surveillance 0002 was guarding against:
--
--   Still read-only.    Oversight is SIGHT, and only sight. This migration
--                       touches `has_student_access`, the read-side predicate,
--                       and nothing else.
--
--                       That distinction is load-bearing, because 0007 already
--                       opened one write across the account boundary: a linked
--                       support account may edit a student's timetable and
--                       subjects, through the separate `can_manage_timetable`
--                       predicate. That predicate is deliberately NOT widened
--                       here. Editing somebody's timetable is a different
--                       request from watching their progress, and it still
--                       requires the active link the student granted.
--
--                       So after this migration an admin can read every
--                       student and edit the timetable of only those who
--                       approved them. The portal says which is which.
--
--   Still disclosed.    `oversight_counterparts` is deliberately symmetric: it
--                       tells an admin which students they can see, and it
--                       tells a student which support accounts can see them.
--                       Access a student cannot discover is a different and
--                       much worse thing than access they cannot refuse, and
--                       the Settings panel is wired to this function so the
--                       disclosure cannot quietly stop happening.
--
--   Still bounded.      `activity_logs` remains the same closed enum of
--                       academic events. Nothing here captures anything new:
--                       no keystrokes, no browsing, no location, nothing from
--                       outside StudyFlow. Widening who can read the record
--                       does not widen the record.
--
--   Still only students. An admin sees accounts with role = 'student'. Admins
--                       cannot read each other, and nobody is promoted here —
--                       `profiles.role` is still ungranted to `authenticated`,
--                       so the role can only change via the service key
--                       (`npm run role`).
--
-- `admin_student_links` is left in place and keeps working. It is no longer
-- the gate, but it is still the only way to record a note against a student
-- and still carries the history of anything requested the old way. Dropping
-- it would discard that for nothing.
--
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------


-- --- 1. The authorisation helper -------------------------------------------
-- Every owned table's SELECT policy is `has_student_access(user_id)` and has
-- been since 0002. Widening the predicate here is therefore the entire change
-- of substance: homework, revision, sessions, timetables, help requests and
-- the activity log all follow automatically, and no policy below is touched.
--
-- The active-link clause is kept rather than deleted. It is now redundant for
-- an admin looking at a student, but it is the one line that would matter if
-- the role of an overseen account ever changed, and leaving it means this
-- function can only ever return MORE than the old one — never less. A
-- migration that could silently take away access somebody is relying on is a
-- worse bug than a redundant OR.

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
    -- or you are a support account and this is a student
    or (
      public.is_admin()
      and exists (
        select 1
        from public.profiles p
        where p.id = target
          and p.role = 'student'
      )
    )
    -- or the pre-0008 route: an admin holding a live, unrevoked link
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
  'True if the caller owns the row, or is a support account and the row '
  'belongs to a student, or holds an active link to its owner. READ side '
  'only. The write side is can_manage_timetable (0007), which still requires '
  'an active link and is not widened by 0008.';


-- --- 2. Who can see whom, said out loud ------------------------------------
-- One function, both directions, because the disclosure has to be exactly as
-- reliable as the access. An admin asks it "which students can I see"; a
-- student asks it "which support accounts can see me", and gets a straight
-- answer without being able to read admin rows generally.
--
-- SECURITY DEFINER for the student side only: `profiles` SELECT does not — and
-- should not — let a student read admin rows at will, so the one fact they are
-- entitled to (who is watching) comes through here instead of by widening a
-- policy that would also hand them every other admin column.
--
-- Returns `timezone` because the support header renders a second clock in the
-- student's zone, and `role` so one result set can serve both callers without
-- the app having to remember which direction it asked in.

create or replace function public.oversight_counterparts()
returns table (
  id        uuid,
  full_name text,
  timezone  text,
  role      public.user_role
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.timezone, p.role
  from public.profiles p
  where
    case
      -- a support account sees every student
      when public.is_admin() then p.role = 'student'
      -- a student sees every support account that can therefore see them
      else p.role = 'admin'
    end
  order by p.full_name;
$$;

revoke all on function public.oversight_counterparts() from public, anon;
grant execute on function public.oversight_counterparts() to authenticated;

comment on function public.oversight_counterparts() is
  'Symmetric disclosure for 0008 oversight. To an admin: every student they '
  'can read. To a student: every support account that can read them. Grants '
  'nothing on its own -- has_student_access is what decides access.';
