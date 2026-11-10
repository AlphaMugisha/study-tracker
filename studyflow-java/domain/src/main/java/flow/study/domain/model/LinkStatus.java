package flow.study.domain.model;

public enum LinkStatus implements Wire.WireValued {
    PENDING, ACTIVE, REVOKED;

    @Override public String wire() { return Wire.of(this); }
    public static LinkStatus parse(String wire) { return Wire.parse(LinkStatus.class, wire); }
}
