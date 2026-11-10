package flow.study.domain.model;

public enum TimetableStatus implements Wire.WireValued {
    DRAFT, ACTIVE, ARCHIVED;

    @Override public String wire() { return Wire.of(this); }
    public static TimetableStatus parse(String wire) { return Wire.parse(TimetableStatus.class, wire); }
}
