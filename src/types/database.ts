/**
 * Database types, hand-written to match supabase/migrations/.
 *
 * When the schema next changes, prefer regenerating:
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 */

// ---------------------------------------------------------------------------
// Enums — these mirror the Postgres types exactly
// ---------------------------------------------------------------------------

export type UserRole = "student" | "admin";
export type TimetableStatus = "draft" | "active" | "archived";
export type TimetableSource = "manual" | "pdf" | "image" | "csv";
/** Not every timetable row is a lesson: breaks and free periods are first-class. */
export type ActivityKind = "class" | "break" | "free" | "study" | "other";
export type TaskPriority = "low" | "medium" | "high";
/** No "overdue": it is derived, never stored. See isOverdue(). */
export type TaskStatus = "not_started" | "in_progress" | "completed";
export type ExtractionConfidence = "high" | "medium" | "low";
export type LinkStatus = "pending" | "active" | "revoked";

/**
 * A closed set of academic events. There is deliberately no member for
 * keystrokes, location, browsing or device activity — adding one would need a
 * migration and a review.
 */
export type ActivityType =
  | "subject_created"
  | "subject_updated"
  | "subject_deleted"
  | "timetable_confirmed"
  | "timetable_updated"
  | "timetable_entry_updated"
  | "assignment_created"
  | "assignment_updated"
  | "assignment_started"
  | "assignment_completed"
  | "assignment_deleted"
  | "revision_created"
  | "revision_completed"
  | "study_session_started"
  | "study_session_completed"
  | "support_access_requested"
  | "support_access_granted"
  | "support_access_revoked";

/** 1 = Monday … 7 = Sunday. The MVP populates 1–5. */
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type Profile = {
  id: string;
  full_name: string;
  role: UserRole;
  timezone: string;
  /** Local time the student stops working. The planner treats it as a hard
   *  cutoff and defers anything that will not fit before it. */
  study_until: string;
  /** Minutes between the school day ending and work starting. */
  settle_minutes: number;
  created_at: string;
  updated_at: string;
};

export type Subject = {
  id: string;
  user_id: string;
  name: string;
  short_name: string | null;
  /** A palette slot (`chart-1`…`chart-5`), never a raw hex value. */
  color_token: string;
  created_at: string;
  updated_at: string;
};

export type TimetableVersion = {
  id: string;
  user_id: string;
  name: string;
  status: TimetableStatus;
  source_type: TimetableSource;
  source_path: string | null;
  effective_from: string;
  effective_until: string | null;
  extraction_meta: Record<string, unknown>;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TimetableEntry = {
  id: string;
  user_id: string;
  timetable_version_id: string;
  subject_id: string | null;
  activity_type: ActivityKind;
  /** Used when there is no subject, e.g. "Break", "Assembly". */
  title: string | null;
  day_of_week: DayOfWeek;
  /** `HH:MM:SS` wall-clock, resolved in the student's timezone. */
  start_time: string;
  end_time: string;
  room: string | null;
  teacher: string | null;
  confidence: ExtractionConfidence;
  created_at: string;
  updated_at: string;
};

export type Assignment = {
  id: string;
  user_id: string;
  subject_id: string | null;
  title: string;
  description: string | null;
  due_date: string;
  /** Null means end of the due day. */
  due_time: string | null;
  priority: TaskPriority;
  estimated_minutes: number;
  status: TaskStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RevisionTask = {
  id: string;
  user_id: string;
  subject_id: string | null;
  title: string;
  description: string | null;
  scheduled_date: string | null;
  estimated_minutes: number;
  priority: TaskPriority;
  status: TaskStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StudySession = {
  id: string;
  user_id: string;
  subject_id: string | null;
  assignment_id: string | null;
  revision_task_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  created_at: string;
  updated_at: string;
};

export type AdminStudentLink = {
  id: string;
  admin_id: string;
  student_id: string;
  status: LinkStatus;
  note: string | null;
  requested_at: string;
  responded_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ActivityLog = {
  id: string;
  /** Whose academic record this belongs to. */
  user_id: string;
  /** Who performed the action. */
  actor_id: string | null;
  activity_type: ActivityType;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

/**
 * Overdue is computed, never stored — a stored flag would need a cron job to
 * stay true and would be wrong between runs.
 *
 * `due_time` is wall-clock in the student's timezone; passing `now` in lets
 * callers (and tests) control the clock instead of reaching for Date.now().
 */
export function isOverdue(
  task: Pick<Assignment, "due_date" | "due_time" | "status">,
  now: Date = new Date(),
): boolean {
  if (task.status === "completed") return false;
  const due = new Date(`${task.due_date}T${task.due_time ?? "23:59:59"}`);
  return due.getTime() < now.getTime();
}

// ---------------------------------------------------------------------------
// Supabase client generic
// ---------------------------------------------------------------------------

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        Profile,
        Pick<Profile, "id"> & Partial<Profile>,
        /**
         * Only these columns are grantable to `authenticated` — the list must
         * stay in step with the column grant in 0004. `role` is absent on
         * purpose: the database refuses that write regardless.
         */
        Partial<Pick<Profile, "full_name" | "timezone" | "study_until" | "settle_minutes">>
      >;
      subjects: Table<Subject>;
      timetable_versions: Table<TimetableVersion>;
      timetable_entries: Table<TimetableEntry>;
      assignments: Table<Assignment>;
      revision_tasks: Table<RevisionTask>;
      study_sessions: Table<StudySession>;
      admin_student_links: Table<
        AdminStudentLink,
        Pick<AdminStudentLink, "admin_id" | "student_id"> & { note?: string | null },
        /** Only `status` may move; admin_id and student_id are immutable. */
        Pick<AdminStudentLink, "status">
      >;
      /** Append-only: no Update type, because there is no UPDATE path. */
      activity_logs: Table<
        ActivityLog,
        Pick<ActivityLog, "user_id" | "actor_id" | "activity_type"> &
          Partial<Pick<ActivityLog, "entity_type" | "entity_id" | "metadata">>,
        never
      >;
    };
    Views: Record<never, never>;
    Functions: {
      is_admin: { Args: Record<never, never>; Returns: boolean };
      has_student_access: { Args: { target: string }; Returns: boolean };
    };
    Enums: {
      user_role: UserRole;
      timetable_status: TimetableStatus;
      timetable_source: TimetableSource;
      activity_kind: ActivityKind;
      task_priority: TaskPriority;
      task_status: TaskStatus;
      extraction_confidence: ExtractionConfidence;
      link_status: LinkStatus;
      activity_type: ActivityType;
    };
    CompositeTypes: Record<never, never>;
  };
};
