package flow.study.domain.planner;

import java.util.List;

public record StudyGuidance(List<StudySuggestion> suggestions, List<StudySlot> slots) {
    public static StudyGuidance empty() {
        return new StudyGuidance(List.of(), List.of());
    }
}
