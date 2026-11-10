package flow.study.domain.planner;

import flow.study.domain.model.ActivityKind;

/**
 * A free or study period on the timetable -- time the school has already
 * given her, which until now the product displayed and said nothing about.
 */
public record StudySlot(
        String id,
        ActivityKind kind,
        String label,
        String when,
        int inDays,
        String startLabel,
        String endLabel,
        int minutes,
        /** What to spend it on. Null only when there is nothing worth suggesting. */
        StudySuggestion suggestion) {
}
