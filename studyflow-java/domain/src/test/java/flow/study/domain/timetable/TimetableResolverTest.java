package flow.study.domain.timetable;

import flow.study.domain.model.ActivityKind;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.ZoneId;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Ported from scripts/test-resolve.mjs, assertion for assertion.
 *
 * This decides what the student sees all day and whether school mode locks the
 * app, so the edge cases matter more than the happy path: the minute a lesson
 * ends, the gap between two lessons, and the fact that a break is still
 * school.
 */
class TimetableResolverTest {

    private static final int H = 60;

    private static ResolvedEntry entry(String id, int day, int start, int end, ActivityKind type) {
        return new ResolvedEntry(id, type, id, null, null, null, null, null, null,
                day, start, end, "", "", end - start);
    }

    private static ResolvedEntry entry(String id, int day, int start, int end) {
        return entry(id, day, start, end, ActivityKind.CLASS);
    }

    /** Monday: 08:00-09:00 maths, 09:00-09:15 break, 09:15-10:15 physics. */
    private static final List<ResolvedEntry> MONDAY = List.of(
            entry("maths", 1, 8 * H, 9 * H),
            entry("break", 1, 9 * H, 9 * H + 15, ActivityKind.BREAK),
            entry("physics", 1, 9 * H + 15, 10 * H + 15));

    private static final List<ResolvedEntry> SPARSE = List.of(
            entry("a", 1, 8 * H, 9 * H),
            entry("b", 1, 11 * H, 12 * H));

    @Test
    void noTimetableAtAll() {
        assertInstanceOf(TimetableState.NoTimetable.class,
                TimetableResolver.resolveNow(List.of(), 9 * H, 1));
    }

    @Test
    void aDayWithNothingTimetabled() {
        var s = assertInstanceOf(TimetableState.NoSchool.class,
                TimetableResolver.resolveNow(MONDAY, 9 * H, 2));
        assertEquals(TimetableState.NoSchool.Reason.EMPTY_DAY, s.reason());
    }

    @Test
    void theWeekendSaysWeekendNotEmpty() {
        var s = assertInstanceOf(TimetableState.NoSchool.class,
                TimetableResolver.resolveNow(MONDAY, 9 * H, 6));
        assertEquals(TimetableState.NoSchool.Reason.WEEKEND, s.reason());
    }

    @Test
    void beforeTheFirstBell() {
        var s = assertInstanceOf(TimetableState.BeforeSchool.class,
                TimetableResolver.resolveNow(MONDAY, 7 * H + 30, 1));
        assertEquals("maths", s.next().id());
        assertEquals(30, s.startsInMinutes());
    }

    @Test
    void midLessonReportsRemainingAndProgress() {
        var s = assertInstanceOf(TimetableState.InActivity.class,
                TimetableResolver.resolveNow(MONDAY, 8 * H + 45, 1));
        assertEquals("maths", s.current().id());
        assertEquals(15, s.remainingMinutes());
        assertEquals(45, s.elapsedMinutes());
        assertEquals(0.75, s.progress(), 1e-9);
        assertEquals("break", s.next().id());
    }

    @Test
    void theMinuteALessonEndsTheNextOneHasStarted() {
        // Boundary: end is exclusive, start is inclusive. Off by one here
        // would leave a one-minute hole every lesson.
        var s = assertInstanceOf(TimetableState.InActivity.class,
                TimetableResolver.resolveNow(MONDAY, 9 * H, 1));
        assertEquals("break", s.current().id());
        assertEquals(0, s.elapsedMinutes());
    }

    @Test
    void theLastMinuteOfTheDayIsStillInTheLesson() {
        var s = assertInstanceOf(TimetableState.InActivity.class,
                TimetableResolver.resolveNow(MONDAY, 10 * H + 14, 1));
        assertEquals(1, s.remainingMinutes());
    }

    @Test
    void afterTheLastBell() {
        var s = assertInstanceOf(TimetableState.AfterSchool.class,
                TimetableResolver.resolveNow(MONDAY, 10 * H + 15, 1));
        assertEquals("physics", s.lastEntry().id());
    }

    @Test
    void anUntimetabledGapIsReportedAsAGap() {
        var s = assertInstanceOf(TimetableState.Gap.class,
                TimetableResolver.resolveNow(SPARSE, 10 * H, 1));
        assertEquals("a", s.previous().id());
        assertEquals("b", s.next().id());
        assertEquals(60, s.remainingMinutes());
    }

    @Test
    void aBreakStillCountsAsBeingAtSchool() {
        // The lock must not lift during break, or it lifts every hour.
        assertTrue(TimetableResolver.resolveNow(MONDAY, 9 * H + 5, 1).atSchool());
    }

    @Test
    void aGapBetweenLessonsStillCountsAsBeingAtSchool() {
        assertTrue(TimetableResolver.resolveNow(SPARSE, 10 * H, 1).atSchool());
    }

    @Test
    void beforeAndAfterSchoolDoNotCountAsAtSchool() {
        assertFalse(TimetableResolver.resolveNow(MONDAY, 7 * H, 1).atSchool());
        assertFalse(TimetableResolver.resolveNow(MONDAY, 17 * H, 1).atSchool());
        assertFalse(TimetableResolver.resolveNow(MONDAY, 12 * H, 6).atSchool());
    }

    @Test
    void schoolClockReadsTheGivenTimezoneNotTheHostOne() {
        Instant at = Instant.parse("2026-09-23T12:00:00Z");
        SchoolClock kigali = SchoolClock.in(ZoneId.of("Africa/Kigali"), at); // UTC+2
        SchoolClock utc = SchoolClock.in(ZoneId.of("UTC"), at);

        assertEquals(12 * H, utc.minutes());
        assertEquals(14 * H, kigali.minutes());
        assertEquals(3, kigali.dayOfWeek()); // Wednesday
    }

    @Test
    void anUnknownTimezoneDegradesInsteadOfThrowing() {
        SchoolClock c = SchoolClock.in("Not/AZone", Instant.parse("2026-09-23T12:00:00Z"));
        assertTrue(c.minutes() >= 0 && c.minutes() < Times.MINUTES_PER_DAY);
        assertTrue(c.dayOfWeek() >= 1 && c.dayOfWeek() <= 7);
    }

    @Test
    void schoolEndsAtTheLastBell() {
        assertEquals(10 * H + 15, TimetableResolver.schoolEndsMinutes(MONDAY, 1).orElseThrow());
        assertTrue(TimetableResolver.schoolEndsMinutes(MONDAY, 2).isEmpty());
    }
}
