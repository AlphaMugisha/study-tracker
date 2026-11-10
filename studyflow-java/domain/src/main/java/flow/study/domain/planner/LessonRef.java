package flow.study.domain.planner;

/** A subject set of lessons on one day, collapsed into a single fact. */
public record LessonRef(
        int dayOfWeek,
        /** "later today", "tomorrow", "Thursday". */
        String when,
        /** Whole days from today. 0 = today, 1 = tomorrow. */
        int inDays,
        String startLabel,
        String endLabel,
        /** Total taught minutes that day, across every period. */
        int minutes,
        /** How many separate periods that day. */
        int periods,
        /**
         * Whether those periods actually run into each other.
         *
         * Two periods on one day is a double only if they are adjacent. Maths
         * at 07:30 and again at 14:00 is two lessons with a whole school day
         * between them, and calling that back to back is a claim the
         * timetable flatly contradicts.
         */
        boolean contiguous) {
}
