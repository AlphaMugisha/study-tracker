package flow.study.domain.model;

/** Not every timetable row is a lesson: breaks and free periods are first-class. */
public enum ActivityKind implements Wire.WireValued {
    CLASS, BREAK, FREE, STUDY, OTHER;

    @Override public String wire() { return Wire.of(this); }
    public static ActivityKind parse(String wire) { return Wire.parse(ActivityKind.class, wire); }

    /** True for the two kinds the school set aside for working. */
    public boolean isWorkSlot() { return this == FREE || this == STUDY; }

    /** True when somebody is teaching -- what "should be in class" keys off. */
    public boolean isTaught() { return this == CLASS || this == STUDY; }
}
