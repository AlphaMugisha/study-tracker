package flow.study.domain.model;

public enum UserRole implements Wire.WireValued {
    STUDENT, ADMIN;

    @Override public String wire() { return Wire.of(this); }
    public static UserRole parse(String wire) { return Wire.parse(UserRole.class, wire); }
}
