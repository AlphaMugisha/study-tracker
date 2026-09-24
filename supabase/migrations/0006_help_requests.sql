  -- ---------------------------------------------------------------------------
  -- 0006 — "I don't understand this"
  -- ---------------------------------------------------------------------------
  -- A student can log something she is stuck on, and anyone she has granted
  -- support access can see it. This is the one thing the app could not express:
  -- it knew what she had been SET and what she had FINISHED, and had no way for
  -- her to say "I finished it and I still don't get it", which is exactly the
  -- thing a parent most wants to know and least reliably hears.
  --
  -- Deliberately not tied to homework. "I don't understand quadratics" is a
  -- real thing to say and does not belong to any one assignment, so both links
  -- are optional: an entry can hang off an assignment, a subject, both, or
  -- neither.
  --
  -- Same authorisation as everything else. Nothing here is a new kind of
  -- visibility — `has_student_access` already decides who may read a student's
  -- record, and this table uses it unchanged. She writes it; a linked support
  -- account reads it; nobody else sees it at all.
  -- ---------------------------------------------------------------------------

  do $$
  begin
    if not exists (select 1 from pg_type where typname = 'help_status') then
      create type public.help_status as enum ('open', 'resolved');
    end if;
  end
  $$;

  -- The activity enum is closed on purpose, so new events must be declared.
  alter type public.activity_type add value if not exists 'help_logged';
  alter type public.activity_type add value if not exists 'help_resolved';

  create table if not exists public.help_requests (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.profiles (id) on delete cascade,
    subject_id    uuid,
    assignment_id uuid,
    topic         text not null,
    detail        text,
    status        public.help_status not null default 'open',
    resolved_at   timestamptz,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),

    constraint help_requests_topic_length
      check (char_length(btrim(topic)) between 1 and 200),
    constraint help_requests_detail_length
      check (detail is null or char_length(detail) <= 2000),

    -- status and resolved_at can never disagree, same as assignments.
    constraint help_requests_resolution_consistent
      check ((status = 'resolved') = (resolved_at is not null)),

    -- Composite FKs: a request cannot point at another user's subject or
    -- assignment. A plain FK would allow exactly that.
    constraint help_requests_subject_fk
      foreign key (subject_id, user_id)
      -- SET NULL must name the column or it nulls user_id too, which is NOT
      -- NULL. See 0003 for the full story.
      references public.subjects (id, user_id) on delete set null (subject_id),
    constraint help_requests_assignment_fk
      foreign key (assignment_id, user_id)
      references public.assignments (id, user_id) on delete set null (assignment_id)
  );

  create index if not exists help_requests_user_idx
    on public.help_requests (user_id, status, created_at desc);

  drop trigger if exists help_requests_set_updated_at on public.help_requests;
  create trigger help_requests_set_updated_at before update on public.help_requests
    for each row execute function public.set_updated_at();

  -- Keeps status and resolved_at in step without every caller remembering to.
  create or replace function public.sync_help_resolved_at()
  returns trigger
  language plpgsql
  set search_path = ''
  as $$
  begin
    if new.status = 'resolved' and new.resolved_at is null then
      new.resolved_at = now();
    elsif new.status <> 'resolved' then
      new.resolved_at = null;
    end if;
    return new;
  end;
  $$;

  drop trigger if exists help_requests_sync_resolved_at on public.help_requests;
  create trigger help_requests_sync_resolved_at
    before insert or update on public.help_requests
    for each row execute function public.sync_help_resolved_at();

  -- --- RLS --------------------------------------------------------------------
  -- Identical to the other academic tables: read is `has_student_access`, write
  -- is owner-only. A support account can see she is stuck and cannot edit, tick
  -- off, or delete it — being able to close a request she did not resolve would
  -- make the list untrustworthy to both of them.

  alter table public.help_requests enable row level security;

  drop policy if exists help_requests_select on public.help_requests;
  create policy help_requests_select on public.help_requests
    for select to authenticated
    using (public.has_student_access(user_id));

  drop policy if exists help_requests_insert on public.help_requests;
  create policy help_requests_insert on public.help_requests
    for insert to authenticated
    with check (user_id = (select auth.uid()));

  drop policy if exists help_requests_update on public.help_requests;
  create policy help_requests_update on public.help_requests
    for update to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

  drop policy if exists help_requests_delete on public.help_requests;
  create policy help_requests_delete on public.help_requests
    for delete to authenticated
    using (user_id = (select auth.uid()));

  revoke all on public.help_requests from anon, authenticated;
  grant select, insert, update, delete on public.help_requests to authenticated;
