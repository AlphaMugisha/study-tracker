package flow.study.domain.planner;

import flow.study.domain.tasks.AssignmentView;
import flow.study.domain.tasks.RevisionView;
import flow.study.domain.tasks.TaskOrdering;
import flow.study.domain.timetable.Times;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.OptionalInt;

/**
 * The evening planner.
 *
 * The rules, and why each one exists:
 *
 *   A cutoff.       studyUntil is hard. Work that will not fit before it is
 *                   returned as deferred rather than quietly discarded. "You
 *                   cannot finish all of this tonight" is the single most
 *                   useful thing this can say.
 *
 *   Splitting.      Anything longer than MAX_BLOCK is cut into chunks. A
 *                   90-minute essay shown as one 90-minute block is a wall;
 *                   the same essay as two 45s with a break is a plan.
 *
 *   Earned breaks.  A break follows accumulated work, not every task. Three
 *                   ten-minute tasks in a row do not need two breaks between
 *                   them.
 *
 *   Order.          TaskOrdering.BY_URGENCY -- overdue first, then due date,
 *                   then priority. The planner does not invent its own
 *                   ordering; it is the same sort the homework list uses, so
 *                   the top of one is the top of the other.
 *
 *   Filling.        Whatever is left of the window after the real work is
 *                   offered to suggestions -- revision the timetable asked
 *                   for. Nothing is taken from there if homework had to be
 *                   deferred.
 *
 * Deliberately NOT here: persistence. A pure function of its inputs, so it can
 * be tested without a database and re-planning is free. Recording what was
 * actually worked on is a study session, a separate concern.
 */
public final class EveningPlanner {
    private EveningPlanner() {}

    /** Longest single sitting before a break is offered. */
    static final int MAX_BLOCK_MINUTES = 45;
    /** Work accumulated before a break is inserted. */
    private static final int BREAK_AFTER_MINUTES = 50;
    private static final int BREAK_MINUTES = 15;
    /**
     * Below this, a trailing chunk is merged into the previous one instead of
     * becoming a block of its own -- a 4-minute block is noise.
     */
    private static final int MIN_CHUNK_MINUTES = 10;

    /**
     * Least time worth offering a suggestion in, and the most suggestions to
     * fill with.
     *
     * The cap matters. A free Friday evening would otherwise be laid out as
     * five hours of revision nobody asked for, and a plan that reads as a
     * punishment gets ignored wholesale. Three blocks is an offer; eight is a
     * sentence.
     */
    private static final int MIN_SUGGESTION_MINUTES = 20;
    private static final int MAX_SUGGESTED_BLOCKS = 3;

    /** Used when there is no timetable to read a finishing time from. */
    private static final int DEFAULT_SCHOOL_END = 15 * 60;

    public record Request(
            /** Minutes since midnight when the last timetabled entry finishes. */
            OptionalInt schoolEndsMinutes,
            int settleMinutes,
            int studyUntilMinutes,
            List<AssignmentView> assignments,
            List<RevisionView> revision,
            /** Ranked timetable revision, used to fill what is left. */
            List<StudySuggestion> suggestions,
            /**
             * If the evening has already begun, start from now rather than
             * from the school bell -- a plan that starts an hour ago is not a
             * plan.
             */
            int nowMinutes) {
    }

    private record Candidate(
            String id, DeferredTask.Kind kind, String label, String detail,
            int minutes, LocalDate dueDate, boolean overdue) {
    }

    public static EveningPlan build(Request request) {
        List<Candidate> candidates = new ArrayList<>();
        for (AssignmentView a : TaskOrdering.outstanding(request.assignments())) {
            candidates.add(new Candidate(a.id(), DeferredTask.Kind.HOMEWORK, a.title(),
                    a.subjectName(), Math.max(1, a.estimatedMinutes()), a.dueDate(), a.overdue()));
        }
        for (RevisionView r : TaskOrdering.outstandingRevision(request.revision())) {
            candidates.add(new Candidate(r.id(), DeferredTask.Kind.REVISION, r.title(),
                    r.subjectName(), Math.max(1, r.estimatedMinutes()), null, false));
        }

        int afterSchool = request.schoolEndsMinutes().orElse(DEFAULT_SCHOOL_END)
                + request.settleMinutes();
        int start = Math.max(afterSchool, request.nowMinutes());
        int studyUntil = request.studyUntilMinutes();

        // Out of evening entirely. Nothing can be scheduled and nothing is
        // worth suggesting, so everything outstanding is reported as deferred.
        if (start >= studyUntil) {
            List<DeferredTask> all = new ArrayList<>();
            for (Candidate c : candidates) all.add(deferral(c, 0));
            return new EveningPlan(List.of(), all, null, Times.label(studyUntil),
                    0, 0, Math.max(0, studyUntil - start), null);
        }

        List<PlanBlock> blocks = new ArrayList<>();
        List<DeferredTask> deferred = new ArrayList<>();
        State s = new State(start);

        for (Candidate task : candidates) {
            List<Integer> chunks = splitTask(task.minutes());
            int scheduled = 0;

            for (int i = 0; i < chunks.size(); i++) {
                int chunk = chunks.get(i);
                insertBreakIfEarned(blocks, s, studyUntil);
                if (s.cursor + chunk > studyUntil) break; // out of evening

                blocks.add(new PlanBlock(
                        task.id() + "-" + i,
                        task.id(),
                        null,
                        task.kind() == DeferredTask.Kind.HOMEWORK
                                ? PlanBlock.Kind.HOMEWORK : PlanBlock.Kind.REVISION,
                        task.label(),
                        task.detail(),
                        null,
                        s.cursor,
                        Times.label(s.cursor),
                        Times.label(s.cursor + chunk),
                        chunk,
                        chunks.size() > 1 ? new PlanBlock.Part(i + 1, chunks.size()) : null));

                s.cursor += chunk;
                s.sinceBreak += chunk;
                s.workMinutes += chunk;
                scheduled += chunk;
            }

            // Anything not fully placed is reported, with however much did fit.
            if (scheduled < task.minutes()) deferred.add(deferral(task, scheduled));
        }

        /*
         * Fill what is left with what the timetable asked for -- but only when
         * the set work all fitted. Proposing optional revision in an evening
         * that could not hold the homework is not a suggestion, it is noise.
         */
        if (deferred.isEmpty()) {
            int taken = 0;
            for (StudySuggestion suggestion : request.suggestions()) {
                if (taken >= MAX_SUGGESTED_BLOCKS) break;
                taken++;
                insertBreakIfEarned(blocks, s, studyUntil);

                int remaining = studyUntil - s.cursor;
                if (remaining < MIN_SUGGESTION_MINUTES) break;

                int minutes = Math.min(Math.min(suggestion.minutes(), remaining), MAX_BLOCK_MINUTES);

                blocks.add(new PlanBlock(
                        "suggested-" + suggestion.subjectId() + "-" + s.cursor,
                        null,
                        suggestion.subjectId(),
                        PlanBlock.Kind.SUGGESTED,
                        suggestion.headline(),
                        suggestion.subjectName(),
                        suggestion.firstReason(),
                        s.cursor,
                        Times.label(s.cursor),
                        Times.label(s.cursor + minutes),
                        minutes,
                        null));

                s.cursor += minutes;
                s.sinceBreak += minutes;
                s.workMinutes += minutes;
                s.suggestedMinutes += minutes;
            }
        }

        PlanBlock first = null;
        for (PlanBlock b : blocks) {
            if (b.isWork()) { first = b; break; }
        }

        return new EveningPlan(
                blocks,
                deferred,
                blocks.isEmpty() ? null : Times.label(start),
                Times.label(studyUntil),
                s.workMinutes,
                s.suggestedMinutes,
                Math.max(0, studyUntil - s.cursor),
                first == null ? null : new EveningPlan.StartWith(
                        first.label(), first.detail(), first.minutes(), first.reason()));
    }

    /** Mutable cursor, kept in one place so the two passes cannot drift. */
    private static final class State {
        int cursor;
        int sinceBreak;
        int workMinutes;
        int suggestedMinutes;

        State(int cursor) { this.cursor = cursor; }
    }

    private static DeferredTask deferral(Candidate c, int scheduled) {
        return new DeferredTask(c.id(), c.kind(), c.label(), c.detail(),
                c.minutes(), scheduled, c.dueDate(), c.overdue());
    }

    /**
     * A break, but only once enough work has built up and only if work can
     * follow it. Shared by the homework pass and the filling pass so the two
     * cannot drift into different ideas of when a break is earned.
     */
    private static void insertBreakIfEarned(List<PlanBlock> blocks, State s, int studyUntil) {
        if (s.sinceBreak < BREAK_AFTER_MINUTES) return;
        if (studyUntil - s.cursor <= BREAK_MINUTES + MIN_CHUNK_MINUTES) return;

        blocks.add(new PlanBlock("break-" + s.cursor, null, null, PlanBlock.Kind.BREAK,
                "Break", null, null, s.cursor, Times.label(s.cursor),
                Times.label(s.cursor + BREAK_MINUTES), BREAK_MINUTES, null));
        s.cursor += BREAK_MINUTES;
        s.sinceBreak = 0;
    }

    /**
     * Cut a task into sittings of at most MAX_BLOCK_MINUTES.
     *
     * A trailing remainder below MIN_CHUNK_MINUTES is folded into the previous
     * chunk rather than left as its own block: 50 minutes becomes a single 50,
     * because a 5-minute block is noise on a plan and the extra five minutes
     * of sitting is not worth a row.
     */
    static List<Integer> splitTask(int minutes) {
        if (minutes <= MAX_BLOCK_MINUTES) return List.of(minutes);

        List<Integer> chunks = new ArrayList<>();
        int left = minutes;
        while (left > 0) {
            int take = Math.min(MAX_BLOCK_MINUTES, left);
            chunks.add(take);
            left -= take;
        }

        int lastIndex = chunks.size() - 1;
        int last = chunks.get(lastIndex);
        if (chunks.size() > 1 && last < MIN_CHUNK_MINUTES) {
            chunks.remove(lastIndex);
            chunks.set(chunks.size() - 1, chunks.get(chunks.size() - 1) + last);
        }
        return chunks;
    }
}
