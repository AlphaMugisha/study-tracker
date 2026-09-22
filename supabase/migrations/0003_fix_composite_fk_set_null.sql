-- ============================================================================
-- StudyFlow — Phase 2 fix: composite foreign keys must null only the reference
-- ============================================================================
-- Bug found by running the live verification against a real project.
--
-- 0002 declared child references as composite foreign keys so a row could
-- never point at another user's data:
--
--     foreign key (subject_id, user_id)
--       references subjects (id, user_id) on delete set null
--
-- The integrity part is right. The action is not. A composite FK with a bare
-- `ON DELETE SET NULL` sets *every* referencing column to NULL -- including
-- `user_id`, which is NOT NULL. So:
--
--     delete from subjects where id = ...
--       -> ERROR 23502: null value in column "user_id" violates not-null
--
-- Which meant deleting a subject was impossible whenever anything referenced
-- it, and deleting an account failed outright (the cascade from auth.users
-- reaches subjects, which then tries to null its children's user_id).
--
-- Postgres 15 added the column list that fixes it exactly:
--
--     on delete set null (subject_id)
--
-- Now only the pointer is cleared. The row keeps its owner, so homework
-- survives the deletion of the subject it was filed under -- which is the
-- behaviour you want anyway: losing a label should not lose the work.
--
-- Idempotent: safe to re-run, and safe on a database created from a fixed 0002.
-- ============================================================================

alter table public.timetable_entries
  drop constraint if exists timetable_entries_subject_fk;
-- timetable_entries is the exception: CASCADE, not SET NULL.
-- `timetable_entries_class_has_subject` forbids a class with no subject, so
-- nulling the pointer only swaps one failure for another. A lesson is an
-- instance of a subject: delete Mathematics and its Maths lessons go too.
-- Everything below keeps its row and loses only the pointer, because work
-- should outlive the label it was filed under.
alter table public.timetable_entries
  add constraint timetable_entries_subject_fk
  foreign key (subject_id, user_id)
  references public.subjects (id, user_id)
  on delete cascade;

alter table public.assignments
  drop constraint if exists assignments_subject_fk;
alter table public.assignments
  add constraint assignments_subject_fk
  foreign key (subject_id, user_id)
  references public.subjects (id, user_id)
  on delete set null (subject_id);

alter table public.revision_tasks
  drop constraint if exists revision_tasks_subject_fk;
alter table public.revision_tasks
  add constraint revision_tasks_subject_fk
  foreign key (subject_id, user_id)
  references public.subjects (id, user_id)
  on delete set null (subject_id);

alter table public.study_sessions
  drop constraint if exists study_sessions_subject_fk;
alter table public.study_sessions
  add constraint study_sessions_subject_fk
  foreign key (subject_id, user_id)
  references public.subjects (id, user_id)
  on delete set null (subject_id);

alter table public.study_sessions
  drop constraint if exists study_sessions_assignment_fk;
alter table public.study_sessions
  add constraint study_sessions_assignment_fk
  foreign key (assignment_id, user_id)
  references public.assignments (id, user_id)
  on delete set null (assignment_id);

alter table public.study_sessions
  drop constraint if exists study_sessions_revision_fk;
alter table public.study_sessions
  add constraint study_sessions_revision_fk
  foreign key (revision_task_id, user_id)
  references public.revision_tasks (id, user_id)
  on delete set null (revision_task_id);
