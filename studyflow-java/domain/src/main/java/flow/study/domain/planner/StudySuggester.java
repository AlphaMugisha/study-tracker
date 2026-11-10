package flow.study.domain.planner;

import flow.study.domain.model.ActivityKind;
import flow.study.domain.model.TaskStatus;
import flow.study.domain.tasks.AssignmentView;
import flow.study.domain.tasks.RevisionView;
import flow.study.domain.timetable.Days;
import flow.study.domain.timetable.ResolvedEntry;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * What to study, read off the timetable.
 *
 * The planner already answers "what do I start with" -- but only from work
 * somebody typed in. Homework comes from a teacher; revision came from the
 * student remembering to write it down. Nothing here ever looked at the
 * timetable and said: Chemistry, because you have a double first thing
 * tomorrow and you have not opened it since Tuesday. That is the one thing a
 * timetable can tell you that a to-do list cannot, and it was being used to
 * work out one number -- when school finishes.
 *
 * The rules, and why each one is here:
 *
 *   Coming up.      A lesson tomorrow is the strongest signal on the
 *                   timetable: the only work with a fixed date that nobody
 *                   set as homework. Weighted by how soon, and by how much of
 *                   it there is -- a double period is more to walk in ready
 *                   for than a single.
 *
 *   Just taught.    A subject covered today is cheapest to consolidate today.
 *                   This is the half of spaced repetition a timetable can
 *                   actually see.
 *
 *   Long gaps.      A subject last taught five days ago and returning
 *                   tomorrow has had the longest time to fade.
 *
 *   Already         Homework due for a subject is in tonight plan already;
 *   covered.        suggesting revision on top double-books the evening. A
 *                   revision task she queued herself outranks anything this
 *                   could guess, so the subject drops out rather than being
 *                   recommended back to her.
 *
 *   Neglect.        A subject on the timetable with no homework, no queued
 *                   revision and no recorded session is the one thing nothing
 *                   else in the product will ever surface.
 *
 * Deliberately NOT here: writing anything. A suggestion becomes real only when
 * the student queues it, so the plan never fills up with guesses nobody asked
 * for.
 */
public final class StudySuggester {
    private StudySuggester() {}

    /*
     * Weights, tuned so that being on tomorrow timetable beats every other
     * single signal, but three weaker signals together can overtake it -- a
     * neglected subject last taught a week ago and returning on Thursday
     * should not sit below a subject she had this morning and has again
     * tomorrow.
     */
    /** Still to come today. Rare in the evening; decisive in the morning. */
    private static final int W_NEXT_TODAY = 46;
    private static final int W_NEXT_TOMORROW = 40;
    private static final int W_NEXT_IN_TWO_DAYS = 18;
    private static final int W_NEXT_LATER = 6;
    /** Per period beyond the first in the next lesson day, capped. */
    private static final int W_PER_EXTRA_PERIOD = 6;
    private static final int W_MAX_EXTRA_PERIOD = 12;
    /** Taught today -- consolidate while it is fresh. */
    private static final int W_TAUGHT_TODAY = 24;
    private static final int W_TAUGHT_YESTERDAY = 10;
    /** Five or more days since the last lesson, and it is coming back. */
    private static final int W_LONG_GAP = 12;
    /** Nothing else in the product will ever raise this subject. */
    private static final int W_NOTHING_QUEUED = 12;
    /** Homework for it is already in tonight plan. */
    private static final int W_HOMEWORK_DUE = -18;
    private static final int W_NEVER_STUDIED = 14;
    /** Ten or more days since a recorded session. */
    private static final int W_STALE_STUDY = 8;

    /** A subject has to clear this to be worth putting on the screen. */
    private static final int MIN_SCORE = 10;

    /** Shortest slot worth naming. Ten minutes is packing up, not studying. */
    private static final int MIN_SLOT_MINUTES = 20;

    private static final int DAYS_AHEAD = 6;

    private enum Direction { AHEAD, BEHIND }

    private record Occurrence(
            int dayOfWeek,
            /** Whole days forward or backward from today. */
            int offset,
            int startMinutes,
            int endMinutes,
            String startLabel,
            String endLabel,
            int minutes) {
    }

    private static final class SubjectRecord {
        final String subjectId;
        final String name;
        final String colorToken;
        /** Every class in the next seven days, soonest first. */
        final List<Occurrence> ahead = new ArrayList<>();
        /** Every class in the previous seven days, most recent first. */
        final List<Occurrence> behind = new ArrayList<>();
        /** Typical single-period length, for sizing the sitting. */
        int typicalMinutes;

        SubjectRecord(String subjectId, String name, String colorToken) {
            this.subjectId = subjectId;
            this.name = name;
            this.colorToken = colorToken;
        }
    }

    public record Request(
            /** The whole active timetable, every day -- not just today. */
            List<ResolvedEntry> entries,
            int today,
            /**
             * Minutes since midnight. Splits today into what has been taught
             * and what is still to come: at 19:00 today Physics is something
             * to consolidate, at 08:00 it is something to be ready for.
             */
            int nowMinutes,
            List<AssignmentView> assignments,
            List<RevisionView> revision,
            /** Whole days since the last recorded session, by subject id. */
            Map<String, Integer> studiedDaysAgo,
            int limit) {
    }

    public static StudyGuidance suggest(Request request) {
        Map<String, SubjectRecord> subjects =
                indexSubjects(request.entries(), request.today(), request.nowMinutes());
        if (subjects.isEmpty()) return StudyGuidance.empty();

        Map<String, Integer> openHomework = new HashMap<>();
        for (AssignmentView a : request.assignments()) {
            if (a.status() == TaskStatus.COMPLETED || a.subjectId() == null) continue;
            openHomework.merge(a.subjectId(), 1, Integer::sum);
        }
        Map<String, Integer> openRevision = new HashMap<>();
        for (RevisionView r : request.revision()) {
            if (r.status() == TaskStatus.COMPLETED || r.subjectId() == null) continue;
            openRevision.merge(r.subjectId(), 1, Integer::sum);
        }

        List<StudySuggestion> suggestions = new ArrayList<>();
        for (SubjectRecord record : subjects.values()) {
            /*
             * Revision she queued herself is already in tonight plan, under a
             * title she chose. Recommending the same subject back to her is
             * exactly the duplication this screen exists to avoid, so it is an
             * exclusion rather than a penalty -- no weight can be tuned to
             * make a repeat useful.
             */
            if (openRevision.getOrDefault(record.subjectId, 0) > 0) continue;

            StudySuggestion suggestion = scoreSubject(record,
                    openHomework.getOrDefault(record.subjectId, 0),
                    request.studiedDaysAgo().get(record.subjectId));
            if (suggestion.score() >= MIN_SCORE) suggestions.add(suggestion);
        }

        // Name as the tie-break, so the same week never reshuffles between
        // renders.
        suggestions.sort(Comparator.comparingInt(StudySuggestion::score).reversed()
                .thenComparing(StudySuggestion::subjectName));

        List<StudySuggestion> ranked =
                suggestions.subList(0, Math.min(request.limit(), suggestions.size()));
        return new StudyGuidance(List.copyOf(ranked),
                buildSlots(request.entries(), request.today(), request.nowMinutes(),
                        subjects, ranked));
    }

    /**
     * Every subject on the timetable, with its lessons sorted into what is
     * still coming and what has already happened.
     *
     * A lesson happening right now counts as neither: it is not something to
     * prepare for and not yet something to go over.
     */
    private static Map<String, SubjectRecord> indexSubjects(
            List<ResolvedEntry> entries, int today, int nowMinutes) {
        Map<String, SubjectRecord> subjects = new LinkedHashMap<>();

        for (ResolvedEntry entry : entries) {
            if (entry.activityType() != ActivityKind.CLASS || entry.subjectId() == null) continue;

            SubjectRecord record = subjects.computeIfAbsent(entry.subjectId(), id ->
                    new SubjectRecord(id,
                            entry.subjectName() != null ? entry.subjectName() : entry.label(),
                            entry.colorToken()));

            int ahead = Math.floorMod(entry.dayOfWeek() - today, 7);
            if (ahead > 0 || entry.startMinutes() >= nowMinutes) {
                record.ahead.add(occurrence(entry, ahead));
            }

            int behind = Math.floorMod(today - entry.dayOfWeek(), 7);
            if (behind > 0 || entry.endMinutes() <= nowMinutes) {
                record.behind.add(occurrence(entry, behind));
            }

            // The longest period wins rather than the mean: a subject taught
            // as one double and three singles should be revised in
            // double-sized sittings.
            record.typicalMinutes = Math.max(record.typicalMinutes, entry.durationMinutes());
        }

        for (SubjectRecord record : subjects.values()) {
            record.ahead.sort(Comparator.comparingInt(Occurrence::offset)
                    .thenComparingInt(Occurrence::startMinutes));
            record.behind.sort(Comparator.comparingInt(Occurrence::offset)
                    .thenComparing(Comparator.comparingInt(Occurrence::startMinutes).reversed()));
        }

        return subjects;
    }

    private static Occurrence occurrence(ResolvedEntry entry, int offset) {
        return new Occurrence(entry.dayOfWeek(), offset, entry.startMinutes(),
                entry.endMinutes(), entry.startLabel(), entry.endLabel(),
                entry.durationMinutes());
    }

    /** Collapse a day worth of a subject periods into one fact. */
    private static LessonRef toLessonRef(
            List<Occurrence> occurrences, int offset, Direction direction) {
        List<Occurrence> sameDay = new ArrayList<>();
        for (Occurrence o : occurrences) {
            if (o.offset() == offset) sameDay.add(o);
        }
        if (sameDay.isEmpty()) return null;

        Occurrence first = sameDay.get(0);
        Occurrence last = sameDay.get(sameDay.size() - 1);

        // Contiguity is checked against the clock rather than assumed from the
        // count: in time order, each period has to begin where the previous
        // one ended.
        List<Occurrence> inTimeOrder = new ArrayList<>(sameDay);
        inTimeOrder.sort(Comparator.comparingInt(Occurrence::startMinutes));
        boolean contiguous = true;
        for (int i = 1; i < inTimeOrder.size(); i++) {
            if (inTimeOrder.get(i).startMinutes() != inTimeOrder.get(i - 1).endMinutes()) {
                contiguous = false;
                break;
            }
        }

        int minutes = 0;
        for (Occurrence o : sameDay) minutes += o.minutes();

        // behind is sorted latest-first, so the earlier bound is the last one.
        return new LessonRef(
                first.dayOfWeek(),
                whenLabel(offset, first.dayOfWeek(), direction),
                offset,
                direction == Direction.AHEAD ? first.startLabel() : last.startLabel(),
                direction == Direction.AHEAD ? last.endLabel() : first.endLabel(),
                minutes,
                sameDay.size(),
                contiguous);
    }

    private static String whenLabel(int offset, int dayOfWeek, Direction direction) {
        if (offset == 0) return direction == Direction.AHEAD ? "later today" : "earlier today";
        if (offset == 1) return direction == Direction.AHEAD ? "tomorrow" : "yesterday";
        String name = Days.name(dayOfWeek);
        return name.isEmpty() ? "in " + offset + " days" : name;
    }

    private static StudySuggestion scoreSubject(
            SubjectRecord record, int homework, Integer studiedDaysAgo) {
        LessonRef next = record.ahead.isEmpty() ? null
                : toLessonRef(record.ahead, record.ahead.get(0).offset(), Direction.AHEAD);
        LessonRef last = record.behind.isEmpty() ? null
                : toLessonRef(record.behind, record.behind.get(0).offset(), Direction.BEHIND);

        List<String> reasons = new ArrayList<>();
        int score = 0;

        // --- what is coming -------------------------------------------------
        if (next != null) {
            if (next.inDays() == 0) {
                score += W_NEXT_TODAY;
                reasons.add("You still have " + record.name + " today at " + next.startLabel() + ".");
            } else if (next.inDays() == 1) {
                score += W_NEXT_TOMORROW;
                reasons.add(record.name + " is on tomorrow timetable at " + next.startLabel() + ".");
            } else if (next.inDays() == 2) {
                score += W_NEXT_IN_TWO_DAYS;
                reasons.add("Next " + record.name + " is " + next.when()
                        + " at " + next.startLabel() + ".");
            } else {
                score += W_NEXT_LATER;
                reasons.add("Next " + record.name + " is " + next.when() + ".");
            }

            if (next.periods() > 1) {
                score += Math.min(W_MAX_EXTRA_PERIOD, (next.periods() - 1) * W_PER_EXTRA_PERIOD);
                reasons.add(next.contiguous()
                        ? "That is " + next.periods() + " periods back to back — "
                                + next.minutes() + " minutes of it."
                        : "You have it " + next.periods() + " times that day — "
                                + next.minutes() + " minutes in total.");
            }
        }

        // --- what has just been taught --------------------------------------
        if (last != null && last.inDays() == 0) {
            score += W_TAUGHT_TODAY;
            reasons.add(last.periods() > 1
                    ? "You had " + last.periods()
                            + " periods of it today. It is cheapest to go over now."
                    : "It was taught today at " + last.startLabel()
                            + ". It is cheapest to go over now.");
        } else if (last != null && last.inDays() == 1) {
            score += W_TAUGHT_YESTERDAY;
            reasons.add("It was taught yesterday.");
        }

        // A week is the longest a gap can be on a repeating timetable, so five
        // or more days is the tail of the distribution, not an arbitrary line.
        if (last != null && last.inDays() >= 5 && next != null) {
            score += W_LONG_GAP;
            reasons.add("You have not had a " + record.name + " lesson since " + last.when() + ".");
        }

        // --- what is already covered ----------------------------------------
        // Homework is a penalty rather than an exclusion: an essay due Friday
        // is not the same as being ready for Thursday lesson, so the subject
        // stays on the list, just below the ones nothing covers.
        if (homework > 0) {
            score += W_HOMEWORK_DUE;
            reasons.add("Tonight plan already has homework for it.");
        } else {
            score += W_NOTHING_QUEUED;
            reasons.add("No homework set and nothing queued — this is the only way it gets studied.");
        }

        // --- what has actually been done ------------------------------------
        if (studiedDaysAgo == null) {
            score += W_NEVER_STUDIED;
            reasons.add("No study session recorded for it yet.");
        } else if (studiedDaysAgo >= 10) {
            score += W_STALE_STUDY;
            reasons.add("Last studied " + studiedDaysAgo + " days ago.");
        }

        return new StudySuggestion(record.subjectId, record.name, record.colorToken,
                sittingMinutes(record.typicalMinutes, next), score,
                headlineFor(record.name, next, last), List.copyOf(reasons), next, last);
    }

    /**
     * How long to sit with it.
     *
     * Three quarters of a period, because revision is recall rather than
     * being taught, and clamped into the same 20-45 range the evening planner
     * splits work into -- a suggestion the planner would immediately cut in
     * half is not a suggestion, it is two.
     */
    private static int sittingMinutes(int typicalMinutes, LessonRef next) {
        double base = typicalMinutes > 0 ? typicalMinutes * 0.75 : 30;
        double sized = next != null && next.periods() > 1 ? base * 1.2 : base;
        return Math.min(45, Math.max(20, (int) Math.round(sized / 5) * 5));
    }

    private static String headlineFor(String name, LessonRef next, LessonRef last) {
        if (next != null && next.inDays() == 0) return name + ", before this afternoon";
        if (next != null && next.inDays() == 1) return name + ", ready for tomorrow";
        if (last != null && last.inDays() == 0) return name + ", while today is fresh";
        if (next != null) return name + ", before " + next.when();
        return "Revise " + name;
    }

    /**
     * The free and study periods still ahead this week, each with something to
     * do in it.
     *
     * The pairing is not just the top suggestion: a free period on Wednesday
     * morning is best spent on something taught Wednesday afternoon or
     * Thursday. So each slot takes the highest-ranked subject whose next
     * lesson AFTER that slot is soonest, which is the only way this can say
     * "you are free at 11:05 and you have Chemistry at 14:00".
     */
    private static List<StudySlot> buildSlots(
            List<ResolvedEntry> entries, int today, int nowMinutes,
            Map<String, SubjectRecord> subjects, List<StudySuggestion> ranked) {
        if (ranked.isEmpty()) return List.of();

        /*
         * The slot and the minute it ends, kept together: the pairing below
         * needs to ask what lesson comes after this, and minutes are the
         * engine unit -- comparing the HH:MM labels happens to work while they
         * stay zero-padded and silently stops working the moment they do not.
         */
        record Found(StudySlot slot, int endMinutes) {}
        List<Found> found = new ArrayList<>();

        for (ResolvedEntry entry : entries) {
            if (!entry.activityType().isWorkSlot()) continue;
            if (entry.durationMinutes() < MIN_SLOT_MINUTES) continue;

            int offset = Math.floorMod(entry.dayOfWeek() - today, 7);
            if (offset == 0 && entry.startMinutes() < nowMinutes) continue;
            if (offset > DAYS_AHEAD) continue;

            found.add(new Found(new StudySlot(
                    entry.id(),
                    entry.activityType(),
                    entry.activityType() == ActivityKind.STUDY ? entry.label() : "Free period",
                    whenLabel(offset, entry.dayOfWeek(), Direction.AHEAD),
                    offset,
                    entry.startLabel(),
                    entry.endLabel(),
                    entry.durationMinutes(),
                    null), entry.endMinutes()));
        }

        found.sort(Comparator.<Found>comparingInt(f -> f.slot().inDays())
                .thenComparingInt(Found::endMinutes));

        /*
         * Spread the recommendations across slots rather than naming the same
         * subject four times: two free periods on one day are two chances, not
         * one. If they run out they are reused rather than leaving a slot
         * blank.
         */
        Set<String> used = new HashSet<>();
        List<StudySlot> slots = new ArrayList<>();
        for (Found f : found) {
            StudySuggestion pick = pickForSlot(f.slot().inDays(), f.endMinutes(),
                    subjects, ranked, used);
            if (pick == null) {
                pick = pickForSlot(f.slot().inDays(), f.endMinutes(),
                        subjects, ranked, Set.of());
            }
            if (pick != null) used.add(pick.subjectId());

            StudySlot s = f.slot();
            slots.add(new StudySlot(s.id(), s.kind(), s.label(), s.when(), s.inDays(),
                    s.startLabel(), s.endLabel(), s.minutes(), pick));
        }

        return slots;
    }

    private static StudySuggestion pickForSlot(
            int slotInDays, int slotEndMinutes, Map<String, SubjectRecord> subjects,
            List<StudySuggestion> ranked, Set<String> used) {
        StudySuggestion best = null;
        int bestGap = Integer.MAX_VALUE;

        for (StudySuggestion suggestion : ranked) {
            if (used.contains(suggestion.subjectId())) continue;

            SubjectRecord record = subjects.get(suggestion.subjectId());
            Occurrence following = null;
            if (record != null) {
                for (Occurrence o : record.ahead) {
                    if (o.offset() > slotInDays
                            || (o.offset() == slotInDays && o.startMinutes() >= slotEndMinutes)) {
                        following = o;
                        break;
                    }
                }
            }

            // A subject with no lesson left this week still counts, just last:
            // the gap is the far end of the window rather than never. ranked
            // is already in score order, so an equal gap keeps the
            // better-scoring subject.
            int gap = following != null ? following.offset() - slotInDays : DAYS_AHEAD + 1;
            if (gap < bestGap) {
                best = suggestion;
                bestGap = gap;
            }
        }

        return best;
    }
}
