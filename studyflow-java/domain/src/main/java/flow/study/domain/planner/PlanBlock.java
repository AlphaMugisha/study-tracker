package flow.study.domain.planner;

/** One row on the evening timeline. */
public record PlanBlock(
        String id,
        /** The task this block works on. Several blocks can share one. */
        String taskId,
        /**
         * Set on SUGGESTED blocks, which have no row yet. This is what lets
         * one be queued as real revision straight from the timeline.
         */
        String subjectId,
        Kind kind,
        String label,
        String detail,
        /** Why this block is here. Only ever set on SUGGESTED. */
        String reason,
        int startMinutes,
        String startLabel,
        String endLabel,
        int minutes,
        /** Set when a task was split; null when it is whole. */
        Part part) {

    /** SUGGESTED is revision this proposed; REVISION is revision she queued. */
    public enum Kind { HOMEWORK, REVISION, BREAK, SUGGESTED }

    /** "Part 2 of 3". */
    public record Part(int index, int total) {
        public String label() { return "Part " + index + " of " + total; }
    }

    public boolean isWork() { return kind != Kind.BREAK; }
}
