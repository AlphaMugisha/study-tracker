package flow.study.domain.planner;

import java.time.LocalDate;

/** Work that will not fit before the cutoff. Reported, never discarded. */
public record DeferredTask(
        String taskId,
        Kind kind,
        String label,
        String detail,
        int minutes,
        /** Minutes that did fit tonight; the rest rolls over. */
        int scheduledMinutes,
        /** Null for revision, which carries no deadline. */
        LocalDate dueDate,
        boolean overdue) {

    public enum Kind { HOMEWORK, REVISION }

    /** What tonight could not take. */
    public int outstandingMinutes() {
        return Math.max(0, minutes - scheduledMinutes);
    }
}
