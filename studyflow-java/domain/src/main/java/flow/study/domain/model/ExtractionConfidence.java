package flow.study.domain.model;

public enum ExtractionConfidence implements Wire.WireValued {
    HIGH, MEDIUM, LOW;

    @Override public String wire() { return Wire.of(this); }
    public static ExtractionConfidence parse(String wire) { return Wire.parse(ExtractionConfidence.class, wire); }
}
