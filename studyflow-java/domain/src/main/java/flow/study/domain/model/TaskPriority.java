package flow.study.domain.model;

public enum TaskPriority implements Wire.WireValued {
    LOW, MEDIUM, HIGH;

    @Override public String wire() { return Wire.of(this); }
    public static TaskPriority parse(String wire) { return Wire.parse(TaskPriority.class, wire); }

    /** Most urgent first, matching PRIORITY_RANK in lib/tasks/ordering.ts. */
    public int rank() {
        return switch (this) { case HIGH -> 0; case MEDIUM -> 1; case LOW -> 2; };
    }
}
