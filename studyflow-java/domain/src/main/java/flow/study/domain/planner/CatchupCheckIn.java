package flow.study.domain.planner;

import flow.study.domain.model.CatchupStatus;
import flow.study.domain.timetable.Days;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** The question afterwards: did the commitment happen? */
public final class CatchupCheckIn {
    private CatchupCheckIn() {}

    private static final Comparator<CatchupPlanView> CHRONOLOGICAL =
            Comparator.comparing(CatchupPlanView::date)
                    .thenComparingInt(CatchupPlanView::startMinutes);

    /**
     * Which plans are ready to be asked about.
     *
     * Only once the period is actually over. Asking "did you do it?" during
     * the period, or before it, trains the student to ignore the question, so
     * a plan for later today stays quiet until the bell.
     *
     * A task finished in the meantime is not asked about either. She did it;
     * the app noticing and asking anyway would be the kind of thing that makes
     * people stop answering.
     */
    public static List<CatchupPlanView> due(
            List<CatchupPlanView> plans, LocalDate todayDate, int nowMinutes) {
        List<CatchupPlanView> out = new ArrayList<>();
        for (CatchupPlanView p : plans) {
            if (p.status() != CatchupStatus.PLANNED || p.taskCompleted()) continue;
            boolean over = p.date().isBefore(todayDate)
                    || (p.date().equals(todayDate) && p.endMinutes() <= nowMinutes);
            if (over) out.add(p);
        }
        out.sort(CHRONOLOGICAL);
        return out;
    }

    /** Plans still ahead of her, for "what you have lined up". */
    public static List<CatchupPlanView> upcoming(
            List<CatchupPlanView> plans, LocalDate todayDate, int nowMinutes) {
        List<CatchupPlanView> out = new ArrayList<>();
        for (CatchupPlanView p : plans) {
            if (p.status() != CatchupStatus.PLANNED || p.taskCompleted()) continue;
            boolean ahead = p.date().isAfter(todayDate)
                    || (p.date().equals(todayDate) && p.endMinutes() > nowMinutes);
            if (ahead) out.add(p);
        }
        out.sort(CHRONOLOGICAL);
        return out;
    }

    /**
     * How long ago the slot was, in words, so the question can place itself.
     *
     * "Yesterday study period" is answerable from memory; "your study period"
     * is not, and a question nobody can answer accurately gets answered at
     * random.
     */
    public static String whenWas(CatchupPlanView plan, LocalDate todayDate) {
        if (plan.date().equals(todayDate)) return "earlier today";
        if (plan.date().equals(todayDate.minusDays(1))) return "yesterday";

        long days = ChronoUnit.DAYS.between(plan.date(), todayDate);
        if (days > 1 && days < 7) return "on " + Days.name(Days.of(plan.date()));
        return "on " + plan.date();
    }
}
