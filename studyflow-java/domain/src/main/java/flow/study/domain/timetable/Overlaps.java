package flow.study.domain.timetable;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Nothing in a school day happens twice at once.
 *
 * In the cloud this is an EXCLUDE constraint over a timerange, backed by
 * btree_gist. The local database has no such thing, so the invariant moves
 * here -- which is where the interface needed it anyway: a clash has to be
 * reported as "Maths already runs then", not as a constraint violation with a
 * range operator in it.
 */
public final class Overlaps {
    private Overlaps() {}

    /** Two entries that cannot both be true. */
    public record Clash(ResolvedEntry first, ResolvedEntry second) {
        public String describe() {
            return first.label() + " (" + first.startLabel() + "-" + first.endLabel()
                    + ") overlaps " + second.label() + " (" + second.startLabel()
                    + "-" + second.endLabel() + ") on " + Days.name(first.dayOfWeek());
        }
    }

    /**
     * Every clash in a week, or an empty list.
     *
     * Sorted and swept rather than compared pairwise: a week is small enough
     * that it would not matter, but the sweep also makes the reported pairs
     * stable, so the same bad import always names the same two rows.
     */
    public static List<Clash> findAll(List<ResolvedEntry> entries) {
        List<ResolvedEntry> sorted = new ArrayList<>(entries);
        sorted.sort(Comparator.comparingInt(ResolvedEntry::dayOfWeek)
                .thenComparingInt(ResolvedEntry::startMinutes));

        List<Clash> clashes = new ArrayList<>();
        for (int i = 1; i < sorted.size(); i++) {
            ResolvedEntry previous = sorted.get(i - 1);
            ResolvedEntry current = sorted.get(i);
            if (previous.overlaps(current)) clashes.add(new Clash(previous, current));
        }
        return clashes;
    }

    /** Would adding this entry clash with what is already there? */
    public static Clash wouldClash(List<ResolvedEntry> existing, ResolvedEntry candidate) {
        for (ResolvedEntry e : existing) {
            if (!e.id().equals(candidate.id()) && e.overlaps(candidate)) {
                return new Clash(e, candidate);
            }
        }
        return null;
    }
}
