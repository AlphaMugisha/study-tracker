package flow.study.domain.report;

import java.time.LocalDate;
import java.util.List;

public record DailyReport(
        /** Her date, in her timezone. */
        LocalDate date,
        /** "Wed 23 Sep", pre-formatted so views never parse dates. */
        String label,
        String weekday,
        /** True for the day in progress -- its numbers are not final yet. */
        boolean today,
        int added,
        int completed,
        /** Titles of what she finished, newest first. Capped for display. */
        List<String> completedTitles,
        int studiedMinutes,
        int helpLogged,
        int helpResolved,
        /** Every logged event, including ones with no dedicated counter. */
        int events,
        /** Homework that came due this day and was not finished by the end of it. */
        List<String> missed) {
}
