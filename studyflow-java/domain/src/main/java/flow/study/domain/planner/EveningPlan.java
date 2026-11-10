package flow.study.domain.planner;

import java.util.List;

public record EveningPlan(
        List<PlanBlock> blocks,
        List<DeferredTask> deferred,
        /** Null when nothing could be scheduled at all. */
        String startsAt,
        String endsBy,
        /** Minutes of actual work scheduled, excluding breaks. */
        int workMinutes,
        /** How much of workMinutes is suggested revision rather than set work. */
        int suggestedMinutes,
        /** Minutes of the window left unused. */
        int spareMinutes,
        /**
         * The single answer to "what do I start with", or null when there is
         * nothing to do and nothing worth suggesting.
         */
        StartWith startWith) {

    public record StartWith(
            String label,
            String detail,
            int minutes,
            /** Set when the answer came from the timetable rather than a deadline. */
            String reason) {
    }

    public boolean empty() { return blocks.isEmpty(); }
}
