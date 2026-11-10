package flow.study.domain.planner;

import flow.study.domain.model.ActivityKind;

import java.time.LocalDate;

/** A free or study period, with what is left of it after existing plans. */
public record SchoolSlot(
        /** The timetable row. Nullable downstream: re-importing deletes entries. */
        String entryId,
        ActivityKind kind,
        String label,
        int dayOfWeek,
        /** Whole days from today. 0 = still to come today. */
        int inDays,
        /** The real date, which is what a commitment needs. */
        LocalDate date,
        /** "later today", "tomorrow", "Thursday". */
        String when,
        int startMinutes,
        int endMinutes,
        String startLabel,
        String endLabel,
        /** Length of the period itself. */
        int minutes,
        /** What is left after existing plans and earlier offers. */
        int freeMinutes) {

    SchoolSlot withFreeMinutes(int remaining) {
        return new SchoolSlot(entryId, kind, label, dayOfWeek, inDays, date, when,
                startMinutes, endMinutes, startLabel, endLabel, minutes, remaining);
    }
}
