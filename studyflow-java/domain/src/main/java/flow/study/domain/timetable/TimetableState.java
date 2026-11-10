package flow.study.domain.timetable;

/**
 * Every state the school day can be in.
 *
 * A sealed interface over records rather than a bag of nullable fields, so a
 * view cannot render "32 minutes remaining" for a day that has not started.
 * Java makes this stricter than the TypeScript union it came from: a switch
 * over these is exhaustive at compile time, so adding a state here breaks
 * every incomplete reader rather than falling through one.
 */
public sealed interface TimetableState {

    /** Nothing saved at all. The app admitting it does not know. */
    record NoTimetable() implements TimetableState {}

    /** A day with no entries. Distinguished so the wording can be honest. */
    record NoSchool(Reason reason) implements TimetableState {
        public enum Reason { WEEKEND, EMPTY_DAY }
    }

    record BeforeSchool(ResolvedEntry next, int startsInMinutes) implements TimetableState {}

    record InActivity(
            ResolvedEntry current,
            ResolvedEntry previous,
            ResolvedEntry next,
            int elapsedMinutes,
            int remainingMinutes,
            /** 0 to 1, for the progress bar. */
            double progress) implements TimetableState {}

    /** An untimetabled gap between two entries. Still school. */
    record Gap(ResolvedEntry previous, ResolvedEntry next, int remainingMinutes)
            implements TimetableState {}

    record AfterSchool(ResolvedEntry lastEntry) implements TimetableState {}

    /**
     * Is she at school right now?
     *
     * True from the first bell to the last, INCLUDING breaks and gaps -- a
     * break between two lessons is still school. School mode keys off this,
     * and getting it wrong in the lenient direction would unlock the app
     * mid-lesson.
     */
    default boolean atSchool() {
        return this instanceof InActivity || this instanceof Gap;
    }
}
