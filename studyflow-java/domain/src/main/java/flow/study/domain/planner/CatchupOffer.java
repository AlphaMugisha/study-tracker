package flow.study.domain.planner;

/** Where a deferred piece of work could actually go. */
public record CatchupOffer(
        DeferredTask task,
        SchoolSlot slot,
        /** Minutes of the task this slot would cover. */
        int minutes,
        /** True when the slot swallows everything still outstanding. */
        boolean coversItAll,
        /** Minutes still unplaced after this offer. */
        int remainingAfter) {
}
