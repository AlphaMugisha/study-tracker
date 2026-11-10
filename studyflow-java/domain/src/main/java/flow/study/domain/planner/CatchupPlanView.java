package flow.study.domain.planner;

import flow.study.domain.model.CatchupStatus;

import java.time.LocalDate;

/** A stored commitment, as the check-in needs to see it. */
public record CatchupPlanView(
        String id,
        String taskId,
        DeferredTask.Kind kind,
        /** What the task is called. */
        String label,
        String detail,
        /** The timetable row, or null once a re-import has replaced the week. */
        String entryId,
        String slotLabel,
        LocalDate date,
        int startMinutes,
        int endMinutes,
        String startLabel,
        String endLabel,
        int plannedMinutes,
        CatchupStatus status,
        /** True when the task has since been finished anyway. */
        boolean taskCompleted) {
}
