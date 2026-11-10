package flow.study.domain.report;

import java.util.List;

/** Totals across a range, for the summary strip above the list. */
public record ReportSummary(
        int added,
        int completed,
        int studiedMinutes,
        int missed,
        int activeDays,
        int countedDays) {

    public static ReportSummary of(List<DailyReport> reports) {
        int added = 0, completed = 0, studied = 0, missed = 0, active = 0, counted = 0;
        for (DailyReport r : reports) {
            added += r.added();
            completed += r.completed();
            studied += r.studiedMinutes();
            missed += r.missed().size();
            if (r.events() > 0) active++;
            // The day in progress is excluded: counting it as a quiet day at
            // 00:05 would make every morning look like a relapse.
            if (!r.today()) counted++;
        }
        return new ReportSummary(added, completed, studied, missed, active, counted);
    }
}
