package flow.study.domain.planner;

import java.util.List;

/**
 * What to study, read off the timetable.
 *
 * Every suggestion carries its reasons as sentences, not a score. A ranked
 * list with no explanation is a horoscope -- the student has to be able to
 * disagree with it, and can only do that if it says why.
 */
public record StudySuggestion(
        String subjectId,
        String subjectName,
        String colorToken,
        /** Suggested sitting length, sized from the lesson itself. */
        int minutes,
        /** Ranking score. Exposed so a surprising order can be explained. */
        int score,
        /** The instruction, in one line. */
        String headline,
        /** Why the timetable says so. Always at least one. */
        List<String> reasons,
        /** The next time this subject is timetabled, if it is this week. */
        LessonRef next,
        /** The last time it was, if it was this week. */
        LessonRef last) {

    public String firstReason() {
        return reasons.isEmpty() ? null : reasons.get(0);
    }
}
