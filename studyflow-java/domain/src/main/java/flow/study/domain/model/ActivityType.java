package flow.study.domain.model;

/**
 * A closed set of academic events.
 *
 * There is deliberately no member for keystrokes, location, browsing, screen
 * contents or device activity. The Postgres enum this mirrors is asserted
 * against exactly that in supabase/tests, and adding one here without adding
 * it there would simply fail to push.
 */
public enum ActivityType implements Wire.WireValued {
    SUBJECT_CREATED,
    SUBJECT_UPDATED,
    SUBJECT_DELETED,
    TIMETABLE_CONFIRMED,
    TIMETABLE_UPDATED,
    TIMETABLE_ENTRY_UPDATED,
    ASSIGNMENT_CREATED,
    ASSIGNMENT_UPDATED,
    ASSIGNMENT_STARTED,
    ASSIGNMENT_COMPLETED,
    ASSIGNMENT_DELETED,
    REVISION_CREATED,
    REVISION_COMPLETED,
    STUDY_SESSION_STARTED,
    STUDY_SESSION_COMPLETED,
    SUPPORT_ACCESS_REQUESTED,
    SUPPORT_ACCESS_GRANTED,
    SUPPORT_ACCESS_REVOKED,
    HELP_LOGGED,
    HELP_RESOLVED,
    CATCHUP_PLANNED,
    CATCHUP_DONE,
    CATCHUP_MISSED;

    @Override public String wire() { return Wire.of(this); }
    public static ActivityType parse(String wire) { return Wire.parse(ActivityType.class, wire); }
}
