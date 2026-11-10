package flow.study.domain.planner;

import flow.study.domain.model.TaskPriority;
import flow.study.domain.model.TaskStatus;
import flow.study.domain.tasks.AssignmentView;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static flow.study.domain.planner.Fixtures.HOUR;
import static flow.study.domain.planner.Fixtures.hw;
import static flow.study.domain.planner.Fixtures.plan;
import static flow.study.domain.planner.Fixtures.rev;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Ported from scripts/test-planner.mjs, assertion for assertion.
 *
 * The planner is pure, so this needs no database and no server. It is the one
 * piece of real product logic in StudyFlow -- "what should I start with" --
 * and the behaviour that matters most is refusing to schedule past the cutoff,
 * and saying so.
 */
class EveningPlannerTest {

    private static List<PlanBlock> work(EveningPlan p) {
        List<PlanBlock> out = new ArrayList<>();
        for (PlanBlock b : p.blocks()) {
            if (b.isWork()) out.add(b);
        }
        return out;
    }

    private static long countKind(EveningPlan p, PlanBlock.Kind kind) {
        return p.blocks().stream().filter(b -> b.kind() == kind).count();
    }

    @Test
    void schedulesWorkAfterSchoolPlusTheSettleGap() {
        EveningPlan p = EveningPlanner.build(plan(List.of(hw("1", "Maths sheet", 30))));
        assertEquals("15:30", p.startsAt());
        assertEquals("15:30", p.blocks().get(0).startLabel());
        assertEquals(30, p.blocks().get(0).minutes());
        assertEquals(0, p.deferred().size());
    }

    @Test
    void answersWhatDoIStartWithUsingTheMostUrgentTask() {
        EveningPlan p = EveningPlanner.build(plan(List.of(
                hw("1", "Maths sheet", 30),
                hw("2", "Physics sheet", 30, true))));
        assertEquals("Physics sheet", p.startWith().label());
        assertEquals("Physics sheet", p.blocks().get(0).label());
    }

    @Test
    void splitsALongTaskIntoSittingsRatherThanOneWallOfTime() {
        EveningPlan p = EveningPlanner.build(plan(List.of(hw("1", "Big essay", 120))));
        List<PlanBlock> w = work(p);

        assertTrue(w.size() >= 3, "expected the 120min task to be split, got " + w.size());
        assertTrue(w.stream().allMatch(b -> b.minutes() <= 45), "no sitting may exceed 45 minutes");
        assertEquals(120, w.stream().mapToInt(PlanBlock::minutes).sum(), "no minutes lost");
        assertEquals(w.size(), w.get(0).part().total());
        assertEquals(1, w.get(0).part().index());
    }

    @Test
    void foldsATinyTrailingRemainderIntoThePreviousSitting() {
        EveningPlan p = EveningPlanner.build(plan(List.of(hw("1", "Fifty", 50))));
        List<PlanBlock> w = work(p);
        assertEquals(1, w.size());
        assertEquals(50, w.get(0).minutes());
    }

    @Test
    void insertsABreakOnlyAfterAccumulatedWorkNotAfterEveryTask() {
        EveningPlan p = EveningPlanner.build(plan(List.of(
                hw("1", "A", 10), hw("2", "B", 10), hw("3", "C", 10))));
        assertEquals(0, countKind(p, PlanBlock.Kind.BREAK),
                "three short tasks do not need two breaks between them");
    }

    @Test
    void neverSchedulesPastTheCutoffAndDefersWhatWillNotFit() {
        // 15:30 start, 16:00 cutoff: half an hour of evening.
        EveningPlan p = EveningPlanner.build(plan(
                List.of(hw("1", "Fits", 30), hw("2", "Does not fit", 60)),
                List.of(), List.of(), 16 * HOUR, 0));

        PlanBlock last = p.blocks().get(p.blocks().size() - 1);
        int endMinutes = flow.study.domain.timetable.Times.toMinutes(last.endLabel());
        assertTrue(endMinutes <= 16 * HOUR, "plan ran past the cutoff: ends " + last.endLabel());
        assertEquals(1, p.deferred().size());
        assertEquals("Does not fit", p.deferred().get(0).label());
        assertEquals(0, p.deferred().get(0).scheduledMinutes());
    }

    @Test
    void reportsPartialProgressOnATaskThatOnlyHalfFits() {
        // 15:30 start against a 16:30 cutoff: sixty minutes of evening, so the
        // first 45-minute sitting lands and the rest rolls over.
        EveningPlan p = EveningPlanner.build(plan(
                List.of(hw("1", "Long essay", 120)),
                List.of(), List.of(), 16 * HOUR + 30, 0));

        DeferredTask deferred = p.deferred().get(0);
        assertEquals("Long essay", deferred.label());
        assertTrue(deferred.scheduledMinutes() > 0, "some of it should have been scheduled");
        assertTrue(deferred.scheduledMinutes() < 120, "not all of it should fit");
    }

    @Test
    void startsFromNowWhenTheEveningIsAlreadyUnderway() {
        EveningPlan p = EveningPlanner.build(plan(
                List.of(hw("1", "Maths sheet", 30)),
                List.of(), List.of(), 21 * HOUR, 18 * HOUR));
        assertEquals("18:00", p.startsAt(), "a plan starting hours ago is not a plan");
    }

    @Test
    void completedWorkIsNotScheduled() {
        AssignmentView done = hw("1", "Done", 30, Fixtures.DUE, false,
                TaskPriority.MEDIUM, TaskStatus.COMPLETED);
        EveningPlan p = EveningPlanner.build(plan(List.of(done, hw("2", "To do", 30))));

        List<String> labels = p.blocks().stream().map(PlanBlock::label).toList();
        assertFalse(labels.contains("Done"));
        assertTrue(labels.contains("To do"));
    }

    @Test
    void anEveningWithNoTimeLeftDefersEverythingAndClaimsNothing() {
        // Cutoff already passed: 15:30 start against a 15:00 cutoff.
        EveningPlan p = EveningPlanner.build(plan(
                List.of(hw("1", "Anything", 30)),
                List.of(), List.of(), 15 * HOUR, 0));

        assertEquals(0, p.blocks().size());
        assertNull(p.startWith());
        assertEquals(1, p.deferred().size());
    }

    @Test
    void nothingOutstandingMeansAnEmptyPlanNotAnEmptyCrash() {
        EveningPlan p = EveningPlanner.build(plan(List.of()));
        assertEquals(0, p.blocks().size());
        assertEquals(0, p.deferred().size());
        assertNull(p.startWith());
    }

    @Test
    void revisionIsScheduledAlongsideHomework() {
        EveningPlan p = EveningPlanner.build(plan(
                List.of(hw("1", "Maths sheet", 30)),
                List.of(rev("r1", "Go over cells", 25)),
                List.of(), 21 * HOUR, 0));

        List<PlanBlock.Kind> kinds = p.blocks().stream().map(PlanBlock::kind).toList();
        assertEquals(List.of(PlanBlock.Kind.HOMEWORK, PlanBlock.Kind.REVISION), kinds);
        assertEquals(55, p.workMinutes());
    }

    @Test
    void overdueWorkLeadsRegardlessOfDueDate() {
        AssignmentView soon = hw("1", "Due tomorrow", 30, LocalDate.parse("2026-09-24"),
                false, TaskPriority.HIGH, TaskStatus.NOT_STARTED);
        AssignmentView late = hw("2", "Late", 30, LocalDate.parse("2026-09-01"),
                true, TaskPriority.LOW, TaskStatus.NOT_STARTED);

        EveningPlan p = EveningPlanner.build(plan(List.of(soon, late)));
        assertEquals("Late", p.blocks().get(0).label());
    }
}
