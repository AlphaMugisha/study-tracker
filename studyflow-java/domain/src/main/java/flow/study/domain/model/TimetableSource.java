package flow.study.domain.model;

public enum TimetableSource implements Wire.WireValued {
    MANUAL, PDF, IMAGE, CSV;

    @Override public String wire() { return Wire.of(this); }
    public static TimetableSource parse(String wire) { return Wire.parse(TimetableSource.class, wire); }
}
