package flow.study.domain.planner;

import java.util.List;

public record CatchupSuggestions(List<CatchupOffer> offers, List<Unplaceable> unplaceable) {

    public static CatchupSuggestions empty() {
        return new CatchupSuggestions(List.of(), List.of());
    }

    /** A task with nowhere to go, and the reason -- never silently dropped. */
    public record Unplaceable(DeferredTask task, Reason reason) {

        /**
         * NO_SLOT_BEFORE_DUE and SLOTS_ALL_FULL are distinguished because the
         * two call for opposite responses: a deadline problem is a
         * conversation with a teacher, a capacity problem is a longer evening.
         */
        public enum Reason { NO_SLOT_BEFORE_DUE, NO_SLOTS_AT_ALL, SLOTS_ALL_FULL }
    }

    /** A commitment that already exists, so its slot is not promised twice. */
    public record CommittedSlot(String entryId, java.time.LocalDate date, int minutes) {}
}
