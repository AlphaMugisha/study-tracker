package flow.study.ui.view;

import flow.study.domain.planner.EveningPlan;
import flow.study.domain.planner.EveningPlanner;
import flow.study.domain.planner.StudyGuidance;
import flow.study.domain.planner.StudySuggester;
import flow.study.domain.timetable.TimetableResolver;
import flow.study.ui.AppContext;
import flow.study.ui.MainWindow;

import java.time.Instant;

/**
 * Tonight's plan, built the one way.
 *
 * ---------------------------------------------------------------------------
 * Two screens need this now: Home plan renders the whole thing, and Today
 * puts one number from it on a tile. Built twice, those two would disagree
 * the moment either one drifted -- and "4h 15m" on the dashboard next to a
 * plan that adds up to something else is the kind of error nobody reports
 * because they assume it means something.
 *
 * The order matters and is the reason this is not two lines at each call
 * site: the suggester runs FIRST, because the planner fills what is left of
 * the evening with its output, and only when the set work all fitted.
 * Revision offered in an evening that could not hold the homework is noise.
 * ---------------------------------------------------------------------------
 */
final class Evening {

    private Evening() {
    }

    static EveningPlan plan(AppContext context, MainWindow.SchoolDay day) {
        var profile = context.profile();
        Instant now = Instant.now();
        var clock = day.clock();

        var assignments = context.tasks().assignments(context.zone(), now);
        var revision = context.tasks().revision();

        StudyGuidance guidance = StudySuggester.suggest(new StudySuggester.Request(
                day.week(), clock.dayOfWeek(), clock.minutes(), assignments, revision,
                context.tasks().studiedDaysAgo(context.zone(), now), 4));

        return EveningPlanner.build(new EveningPlanner.Request(
                TimetableResolver.schoolEndsMinutes(day.week(), clock.dayOfWeek()),
                profile.settleMinutes(),
                profile.studyUntilMinutes(),
                assignments,
                revision,
                guidance.suggestions(),
                clock.minutes()));
    }
}
