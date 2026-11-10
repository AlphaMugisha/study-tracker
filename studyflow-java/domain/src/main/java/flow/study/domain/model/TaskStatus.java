package flow.study.domain.model;

/**
 * Three members, and there is no {@code OVERDUE}.
 *
 * Overdue is derived -- see {@link flow.study.domain.tasks.TaskOrdering}. A
 * stored flag would need something to run on a schedule to stay true, and
 * would be wrong in between.
 */
public enum TaskStatus implements Wire.WireValued {
    NOT_STARTED, IN_PROGRESS, COMPLETED;

    @Override public String wire() { return Wire.of(this); }
    public static TaskStatus parse(String wire) { return Wire.parse(TaskStatus.class, wire); }
}
