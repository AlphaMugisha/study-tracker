package flow.study.domain.model;

/** A thing she has said she does not understand, and whether it is sorted. */
public enum HelpStatus implements Wire.WireValued {
    OPEN, RESOLVED;

    @Override public String wire() { return Wire.of(this); }
    public static HelpStatus parse(String wire) { return Wire.parse(HelpStatus.class, wire); }
}
