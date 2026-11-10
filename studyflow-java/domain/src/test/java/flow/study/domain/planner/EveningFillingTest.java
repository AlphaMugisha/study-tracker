package flow.study.domain.planner;

import org.junit.jupiter.api.Test;

import java.util.List;

import static flow.study.domain.planner.Fixtures.HOUR;
import static flow.study.domain.planner.Fixtures.hw;
import static flow.study.domain.planner.Fixtures.plan;
import static flow.study.domain.planner.Fixtures.sug;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Filling the evening from the timetable. Ported from the second half of
 * scripts/test-planner.mjs.
 *
 * spareMinutes used to be reported and nothing more: an evening with no
 * homework was described as empty rather than used. These cover the one rule
 * that makes changing that safe -- set work always wins, and a suggestion
 * never displaces it.
 */
class EveningFillingTest {

    private static long countKind(EveningPlan p, PlanBlock.Kind kind) {
        return p.blocks().stream().filter(b -> b.kind() == kind).count();
    }

    @Test
    void anEmptyEveningIsFilledFromTheTimetableRatherThanLeftEmpty() {
        EveningPlan p = EveningPlanner.build(plan(
                List.of(), List.of(), List.of(sug("Chemistry", 30)), 16 * HOUR, 0));

        assertEquals(1, p.blocks().size());
        assertEquals(PlanBlock.Kind.SUGGESTED, p.blocks().get(0).kind());
        assertEquals("sub-Chemistry", p.blocks().get(0).subjectId());
        assertEquals(30, p.suggestedMinutes());
        assertEquals("15:30", p.startsAt());
    }

    @Test
    void aSuggestionAnswersWhatDoIStartWithOnlyWhenNothingWasSet() {
        EveningPlan withHomework = EveningPlanner.build(plan(
                List.of(hw("1", "Essay", 30)), List.of(),
                List.of(sug("Chemistry", 30)), 21 * HOUR, 0));

        assertEquals("Essay", withHomework.startWith().label(), "set work comes first, always");
        assertNull(withHomework.startWith().reason());

        EveningPlan withoutHomework = EveningPlanner.build(plan(
                List.of(), List.of(), List.of(sug("Chemistry", 30)), 21 * HOUR, 0));

        assertEquals("Chemistry, ready for tomorrow", withoutHomework.startWith().label());
        assertNotNull(withoutHomework.startWith().reason(),
                "a suggestion must carry the reason it was made");
    }

    @Test
    void suggestionsGoAfterTheHomeworkNeverInFrontOfIt() {
        EveningPlan p = EveningPlanner.build(plan(
                List.of(hw("1", "Essay", 30)), List.of(),
                List.of(sug("Chemistry", 30)), 21 * HOUR, 0));

        List<PlanBlock.Kind> kinds = p.blocks().stream()
                .filter(PlanBlock::isWork).map(PlanBlock::kind).toList();
        assertEquals(List.of(PlanBlock.Kind.HOMEWORK, PlanBlock.Kind.SUGGESTED), kinds);
        assertEquals(60, p.workMinutes());
        assertEquals(30, p.suggestedMinutes(), "only the suggested half counts as suggested");
    }

    @Test
    void nothingIsSuggestedInAnEveningThatCouldNotHoldTheHomework() {
        EveningPlan p = EveningPlanner.build(plan(
                List.of(hw("1", "Too much", 120)), List.of(),
                List.of(sug("Chemistry", 30)), 16 * HOUR, 0));

        assertTrue(p.deferred().size() > 0);
        assertEquals(0, countKind(p, PlanBlock.Kind.SUGGESTED),
                "an evening that could not hold the homework must not be offered revision");
        assertEquals(0, p.suggestedMinutes());
    }

    @Test
    void aSuggestionIsNeverScheduledPastTheCutoff() {
        EveningPlan p = EveningPlanner.build(plan(
                List.of(), List.of(), List.of(sug("Chemistry", 45), sug("Physics", 45)),
                16 * HOUR, 0));

        for (PlanBlock block : p.blocks()) {
            int end = flow.study.domain.timetable.Times.toMinutes(block.endLabel());
            assertTrue(end <= 16 * HOUR, "suggestion ran past the cutoff: ends " + block.endLabel());
        }
        assertTrue(p.blocks().size() <= 1, "only what fits");
    }

    @Test
    void aShortRemainderIsLeftSpareRatherThanFilledWithATokenBlock() {
        // 15:30 start, 15:45 cutoff: fifteen minutes is not a study session.
        EveningPlan p = EveningPlanner.build(plan(
                List.of(), List.of(), List.of(sug("Chemistry", 30)),
                15 * HOUR + 45, 0));

        assertEquals(0, p.blocks().size(), "15 minutes is not a study session");
        assertEquals(15, p.spareMinutes());
    }

    @Test
    void aFreeEveningIsCappedNotPackedEndToEndWithRevision() {
        EveningPlan p = EveningPlanner.build(plan(
                List.of(), List.of(),
                List.of(sug("A", 45), sug("B", 45), sug("C", 45), sug("D", 45), sug("E", 45),
                        sug("F", 45)),
                21 * HOUR, 0));

        assertEquals(3, countKind(p, PlanBlock.Kind.SUGGESTED),
                "three blocks is an offer; six is a sentence");
        assertTrue(p.spareMinutes() > 0, "the rest of the evening stays hers");
    }

    @Test
    void aSuggestedBlockCarriesTheReasonItWasMade() {
        String reason = "You have a Chemistry double at 09:20 tomorrow.";
        EveningPlan p = EveningPlanner.build(plan(
                List.of(), List.of(), List.of(sug("Chemistry", 30, reason)), 21 * HOUR, 0));

        assertEquals(reason, p.blocks().get(0).reason());
        assertEquals("Chemistry", p.blocks().get(0).detail());
        assertNull(p.blocks().get(0).taskId(), "there is no row to work against yet");
    }

    @Test
    void breaksAreEarnedAcrossSuggestionsTheSameWayTheyAreAcrossHomework() {
        EveningPlan p = EveningPlanner.build(plan(
                List.of(), List.of(), List.of(sug("A", 45), sug("B", 45), sug("C", 45)),
                21 * HOUR, 0));

        assertTrue(countKind(p, PlanBlock.Kind.BREAK) >= 1,
                "135 minutes of revision earns at least one break");
    }

    @Test
    void anEveningAlreadyOverSuggestsNothing() {
        EveningPlan p = EveningPlanner.build(plan(
                List.of(), List.of(), List.of(sug("Chemistry", 30)), 15 * HOUR, 0));

        assertEquals(0, p.blocks().size());
        assertNull(p.startWith());
    }
}
