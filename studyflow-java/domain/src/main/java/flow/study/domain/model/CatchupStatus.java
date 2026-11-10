package flow.study.domain.model;

/**
 * A commitment to do something in a free period, and the answer afterwards.
 *
 * {@code MISSED} is the honest word for "the time came and went". There is no
 * {@code FAILED} member and nothing here escalates.
 */
public enum CatchupStatus implements Wire.WireValued {
    PLANNED, DONE, MISSED, CANCELLED;

    @Override public String wire() { return Wire.of(this); }
    public static CatchupStatus parse(String wire) { return Wire.parse(CatchupStatus.class, wire); }
}
