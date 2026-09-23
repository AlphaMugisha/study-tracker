-- ---------------------------------------------------------------------------
-- 0005 — support access: the last two gaps
-- ---------------------------------------------------------------------------
-- The authorisation model has been in place since 0002: `has_student_access`
-- returns true for your own rows, or for an admin holding a live, unrevoked
-- link to that student, and every academic table's SELECT policy uses it. So a
-- linked admin can already read a student's assignments, revision, sessions
-- and activity log. Nothing here widens that.
--
-- Two things were missing, and both are small:
--
--   1. `profiles` SELECT was own-row only, so a linked admin could read a
--      student's homework but not their NAME. An admin dashboard would have
--      listed UUIDs.
--
--   2. There was no way for an admin to ASK. The insert policy lets an admin
--      create a pending link, but they need the student's `id` to do it, and
--      they cannot read `profiles` or `auth.users` to find it. The result was
--      a consent model with no way to request consent.
--
-- What this does NOT do, deliberately, and matching the original brief:
--   - no admin-sees-everything: access still requires an ACTIVE link
--   - only the student can activate a link; an admin can only ask
--   - nothing new is captured. `activity_logs` records academic events inside
--     StudyFlow and nothing else: no keystrokes, no browser history, no
--     location, no activity outside this app
-- ---------------------------------------------------------------------------

-- --- 1. The two parties to a link may read each other's profile row ---------
-- A linked admin needs the student's name or a dashboard lists UUIDs. Less
-- obviously, the STUDENT needs the admin's name too: without it they are
-- asked to approve "someone", which is not informed consent. So this is
-- symmetric and covers pending links as well as active ones — you have to
-- know who is asking BEFORE you decide.
--
-- SECURITY DEFINER helper rather than an inline EXISTS: the policy would
-- otherwise have to read `admin_student_links` under that table's own RLS,
-- and keeping the rule in one auditable place beats relying on two policies
-- composing the way you assumed.

create or replace function public.shares_support_link(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_student_links l
    where (l.admin_id = (select auth.uid()) and l.student_id = other)
       or (l.student_id = (select auth.uid()) and l.admin_id = other)
  );
$$;

revoke all on function public.shares_support_link(uuid) from public, anon;
grant execute on function public.shares_support_link(uuid) to authenticated;

comment on function public.shares_support_link(uuid) is
  'True when the caller and `other` are the two ends of any support link, at '
  'any status. Used only to reveal a name, never to grant data access.';

drop policy if exists profiles_select_own on public.profiles;

create policy profiles_select_linked
  on public.profiles
  for select
  to authenticated
  using (
    public.has_student_access(id)
    or public.shares_support_link(id)
  );

comment on policy profiles_select_linked on public.profiles is
  'Your own row; a student who granted you active support access; or the '
  'other party to any support link, so each side can see who they are '
  'dealing with before approving.';

-- UPDATE is untouched: still own-row only, still column-limited, so an admin
-- reading a student's profile can change nothing about it.


-- --- 2. Requesting access by email ------------------------------------------
-- SECURITY DEFINER because it reads `auth.users`, which `authenticated` cannot
-- and should not be granted. It returns nothing about the user beyond whether
-- the request could be created.
--
-- It cannot be used to grant access: the row is always inserted as 'pending',
-- and only the student can move it to 'active' (their UPDATE policy). An admin
-- calling this on a hundred addresses still has access to nobody.

create or replace function public.request_student_access(
  student_email text,
  request_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
  existing  public.admin_student_links%rowtype;
  new_id    uuid;
begin
  -- Only an admin may ask. Checked here rather than trusted from the caller,
  -- because SECURITY DEFINER means this function runs as the owner.
  if not public.is_admin() then
    raise exception 'Only a support account can request access'
      using errcode = '42501';
  end if;

  select id into target_id
  from auth.users
  where lower(email) = lower(btrim(student_email))
  limit 1;

  if target_id is null then
    raise exception 'No account with that email' using errcode = 'P0002';
  end if;

  if target_id = (select auth.uid()) then
    raise exception 'That is your own account' using errcode = '22023';
  end if;

  -- Re-asking should not stack up duplicate rows. A revoked or denied link is
  -- reopened as pending; an active one is left exactly as it is.
  select * into existing
  from public.admin_student_links
  where admin_id = (select auth.uid())
    and student_id = target_id
  limit 1;

  if found then
    if existing.status = 'active' and existing.revoked_at is null then
      return existing.id;
    end if;

    update public.admin_student_links
    set status     = 'pending',
        note       = coalesce(request_note, note),
        revoked_at = null,
        updated_at = now()
    where id = existing.id;

    return existing.id;
  end if;

  insert into public.admin_student_links (admin_id, student_id, status, note)
  values ((select auth.uid()), target_id, 'pending', request_note)
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.request_student_access(text, text) from public, anon;
grant execute on function public.request_student_access(text, text) to authenticated;

comment on function public.request_student_access(text, text) is
  'Create a PENDING support-access request by email. Admin-only. Grants '
  'nothing on its own — only the student can activate the link.';


-- --- 3. Let an admin withdraw their own request -----------------------------
-- The student can already revoke via their UPDATE policy. The admin-side
-- policy from 0002 allows any status other than 'active', which covers
-- withdrawing; the grant below is what was missing for `revoked_at`.
--
-- Column-limited on purpose: an admin can set status and stamp revoked_at, and
-- nothing else on the row.

grant update (status, revoked_at) on public.admin_student_links to authenticated;
