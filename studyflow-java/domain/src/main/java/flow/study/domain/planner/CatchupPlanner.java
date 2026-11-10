package flow.study.domain.planner;

import flow.study.domain.model.ActivityKind;
import flow.study.domain.planner.CatchupSuggestions.CommittedSlot;
import flow.study.domain.planner.CatchupSuggestions.Unplaceable;
import flow.study.domain.timetable.Days;
import flow.study.domain.timetable.ResolvedEntry;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.function.Predicate;

/**
 * Where to do the work that will not fit tonight.
 *
 * The planner has been able to say "these three will not fit before 21:00"
 * for a while, and that is where it stopped. The student was told what would
 * not fit and left to work out when it would -- which is the one part the
 * timetable can actually answer, because a free or study period is time the
 * school has already set aside.
 *
 * The rules, and why each one is here:
 *
 *   Before the        THE rule. A slot after the due date is not a plan, it is
 *   deadline.         a way of feeling organised about being late. An essay
 *                     due tomorrow cannot go in the Thursday study period, and
 *                     offering that would be worse than offering nothing -- so
 *                     a task with no slot in time comes back as unplaceable
 *                     and gets said out loud.
 *
 *   Soonest first.    Of the slots that qualify, the earliest wins. Work put
 *                     off to the last possible period is work that one
 *                     cancelled lesson loses entirely.
 *
 *   No double-        A slot capacity is spent as tasks are placed into it,
 *   booking.          including by plans already committed. Two tasks can
 *                     share one long period; neither gets promised minutes the
 *                     other is using.
 *
 *   Free and study    Not breaks. A 60-minute lunch would hold plenty and it
 *   only.             is not the place of this product to suggest a child
 *                     works through it -- those periods are hers. The school
 *                     designated free and study for work; this uses exactly
 *                     those.
 *
 * Deliberately NOT here: storage. An offer is recomputed from the timetable
 * every time, so a changed timetable changes the suggestion for free and
 * nothing goes stale. Only an offer the student ACCEPTS becomes a row, because
 * only then is there something to ask her about afterwards.
 */
public final class CatchupPlanner {
    private CatchupPlanner() {}

    /** Below this, a slot cannot hold anything worth calling a plan. */
    private static final int MIN_USEFUL_MINUTES = 15;

    /** How far ahead to look. The timetable repeats, so a week is all there is. */
    private static final int DAYS_AHEAD = 6;

    public record Request(
            /** Straight from the evening planner, already in urgency order. */
            List<DeferredTask> deferred,
            List<ResolvedEntry> entries,
            int today,
            /** Her today. */
            LocalDate todayDate,
            int nowMinutes,
            List<CommittedSlot> committed) {
    }

    public static CatchupSuggestions suggest(Request request) {
        if (request.deferred().isEmpty()) return CatchupSuggestions.empty();

        List<SchoolSlot> slots = new ArrayList<>(upcomingSlots(
                request.entries(), request.today(), request.todayDate(), request.nowMinutes()));

        if (slots.isEmpty()) {
            List<Unplaceable> none = new ArrayList<>();
            for (DeferredTask task : request.deferred()) {
                none.add(new Unplaceable(task, Unplaceable.Reason.NO_SLOTS_AT_ALL));
            }
            return new CatchupSuggestions(List.of(), none);
        }

        /*
         * Spend capacity already promised. Matched on date first and entry id
         * second so a plan survives the timetable row it was made against
         * being deleted -- after a re-import the entry id is null and the date
         * plus the times are all there is to go on.
         */
        for (CommittedSlot taken : request.committed()) {
            int index = indexOf(slots, s -> s.date().equals(taken.date())
                    && Objects.equals(s.entryId(), taken.entryId()));
            if (index < 0) {
                index = indexOf(slots, s -> s.date().equals(taken.date())
                        && s.freeMinutes() >= taken.minutes());
            }
            if (index >= 0) {
                SchoolSlot slot = slots.get(index);
                slots.set(index, slot.withFreeMinutes(
                        Math.max(0, slot.freeMinutes() - taken.minutes())));
            }
        }

        List<CatchupOffer> offers = new ArrayList<>();
        List<Unplaceable> unplaceable = new ArrayList<>();

        for (DeferredTask task : request.deferred()) {
            int outstanding = task.outstandingMinutes();
            if (outstanding < MIN_USEFUL_MINUTES) continue;

            List<Integer> inTime = new ArrayList<>();
            for (int i = 0; i < slots.size(); i++) {
                if (isInTime(slots.get(i), task)) inTime.add(i);
            }

            if (inTime.isEmpty()) {
                boolean anyRoomAnywhere = false;
                for (SchoolSlot s : slots) {
                    if (s.freeMinutes() >= MIN_USEFUL_MINUTES) { anyRoomAnywhere = true; break; }
                }
                unplaceable.add(new Unplaceable(task, anyRoomAnywhere
                        ? Unplaceable.Reason.NO_SLOT_BEFORE_DUE
                        : Unplaceable.Reason.SLOTS_ALL_FULL));
                continue;
            }

            List<Integer> usable = new ArrayList<>();
            for (int i : inTime) {
                if (slots.get(i).freeMinutes() >= MIN_USEFUL_MINUTES) usable.add(i);
            }
            if (usable.isEmpty()) {
                unplaceable.add(new Unplaceable(task, Unplaceable.Reason.SLOTS_ALL_FULL));
                continue;
            }

            // Prefer the earliest slot that takes the whole thing; otherwise
            // just the earliest. upcomingSlots is already in chronological
            // order, so first match is soonest without re-sorting.
            int chosen = usable.get(0);
            for (int i : usable) {
                if (slots.get(i).freeMinutes() >= outstanding) { chosen = i; break; }
            }

            SchoolSlot slot = slots.get(chosen);
            int minutes = Math.min(outstanding, slot.freeMinutes());

            offers.add(new CatchupOffer(task, slot, minutes,
                    minutes >= outstanding, outstanding - minutes));

            slots.set(chosen, slot.withFreeMinutes(slot.freeMinutes() - minutes));
        }

        return new CatchupSuggestions(offers, unplaceable);
    }

    private static int indexOf(List<SchoolSlot> slots, Predicate<SchoolSlot> test) {
        for (int i = 0; i < slots.size(); i++) {
            if (test.test(slots.get(i))) return i;
        }
        return -1;
    }

    /**
     * Would this slot land before the work is due?
     *
     * Overdue work has no slot that is in time, so the soonest is the best
     * available and every slot qualifies. Revision carries no deadline at all
     * -- that is the whole difference from homework -- so any slot will do.
     */
    private static boolean isInTime(SchoolSlot slot, DeferredTask task) {
        if (task.overdue() || task.dueDate() == null) return true;
        return !slot.date().isAfter(task.dueDate());
    }

    /**
     * Every free and study period from now to the end of the timetable week.
     *
     * Today periods count only if they have not started: a plan to work in a
     * period that finished at lunchtime is not a plan.
     */
    public static List<SchoolSlot> upcomingSlots(
            List<ResolvedEntry> entries, int today, LocalDate todayDate, int nowMinutes) {
        List<SchoolSlot> slots = new ArrayList<>();

        for (ResolvedEntry entry : entries) {
            if (!entry.activityType().isWorkSlot()) continue;
            if (entry.durationMinutes() < MIN_USEFUL_MINUTES) continue;

            int inDays = Math.floorMod(entry.dayOfWeek() - today, 7);
            if (inDays > DAYS_AHEAD) continue;
            if (inDays == 0 && entry.startMinutes() <= nowMinutes) continue;

            slots.add(new SchoolSlot(
                    entry.id(),
                    entry.activityType(),
                    entry.activityType() == ActivityKind.STUDY ? entry.label() : "Free period",
                    entry.dayOfWeek(),
                    inDays,
                    todayDate.plusDays(inDays),
                    whenLabel(inDays, entry.dayOfWeek()),
                    entry.startMinutes(),
                    entry.endMinutes(),
                    entry.startLabel(),
                    entry.endLabel(),
                    entry.durationMinutes(),
                    entry.durationMinutes()));
        }

        slots.sort(Comparator.comparingInt(SchoolSlot::inDays)
                .thenComparingInt(SchoolSlot::startMinutes));
        return slots;
    }

    private static String whenLabel(int inDays, int dayOfWeek) {
        if (inDays == 0) return "later today";
        if (inDays == 1) return "tomorrow";
        String name = Days.name(dayOfWeek);
        return name.isEmpty() ? "in " + inDays + " days" : name;
    }
}
