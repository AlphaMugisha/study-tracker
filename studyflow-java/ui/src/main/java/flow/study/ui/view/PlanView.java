package flow.study.ui.view;

import flow.study.domain.planner.CatchupOffer;
import flow.study.domain.planner.CatchupPlanner;
import flow.study.domain.planner.CatchupSuggestions;
import flow.study.domain.planner.DeferredTask;
import flow.study.domain.planner.EveningPlan;
import flow.study.domain.planner.EveningPlanner;
import flow.study.domain.planner.PlanBlock;
import flow.study.domain.planner.StudyGuidance;
import flow.study.domain.planner.StudySuggester;
import flow.study.domain.timetable.Times;
import flow.study.domain.timetable.TimetableResolver;
import flow.study.ui.AppContext;
import flow.study.ui.MainWindow;
import javafx.beans.property.ObjectProperty;
import javafx.scene.Node;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;

import java.time.Instant;
import java.util.List;

/**
 * What to do this evening, in what order, and what will not fit.
 *
 * The planner is pure and cheap, so this recomputes on every render rather
 * than storing a plan. A stored plan goes stale the moment she ticks something
 * off, and a plan that disagrees with the homework list is worse than no plan.
 *
 * The screen says three things in order of how much they matter:
 *
 *   What to start with.  The single answer, loudest.
 *   The timeline.        Blocks with earned breaks, split so a 90-minute
 *                        essay reads as a plan rather than a wall.
 *   What will not fit.   And where in the school week it could go instead,
 *                        which is the part a timetable can answer and a
 *                        to-do list cannot.
 */
public final class PlanView implements Screen {

    private final AppContext context;
    private final VBox body = new VBox(16);

    public PlanView(AppContext context, ObjectProperty<MainWindow.SchoolDay> day) {
        this.context = context;
        body.setPadding(Ui.PAGE_PADDING);

        day.addListener((observable, previous, current) -> {
            if (current != null) render(current);
        });
        if (day.get() != null) render(day.get());
    }

    @Override
    public Node root() {
        return Ui.page(body);
    }

    private void render(MainWindow.SchoolDay day) {
        body.getChildren().clear();
        body.getChildren().add(Ui.pageTitle("Home plan"));

        var profile = context.profile();
        Instant now = Instant.now();
        var clock = day.clock();

        var assignments = context.tasks().assignments(context.zone(), now);
        var revision = context.tasks().revision();

        /*
         * The suggester runs first, because the planner uses its output to
         * fill whatever is left of the evening -- but only when the set work
         * all fitted. Revision offered in an evening that could not hold the
         * homework is noise, and the planner enforces that, not this screen.
         */
        StudyGuidance guidance = StudySuggester.suggest(new StudySuggester.Request(
                day.week(), clock.dayOfWeek(), clock.minutes(), assignments, revision,
                context.tasks().studiedDaysAgo(context.zone(), now), 4));

        EveningPlan plan = EveningPlanner.build(new EveningPlanner.Request(
                TimetableResolver.schoolEndsMinutes(day.week(), clock.dayOfWeek()),
                profile.settleMinutes(),
                profile.studyUntilMinutes(),
                assignments,
                revision,
                guidance.suggestions(),
                clock.minutes()));

        body.getChildren().add(startWithCard(plan));
        body.getChildren().add(timelineCard(plan));

        if (!plan.deferred().isEmpty()) {
            body.getChildren().add(deferredCard(plan, day));
        }

        if (!guidance.slots().isEmpty()) {
            body.getChildren().add(slotsCard(guidance));
        }
    }

    // -----------------------------------------------------------------------

    private Node startWithCard(EveningPlan plan) {
        if (plan.startWith() == null) {
            return Ui.card(
                    Ui.sectionTitle("Nothing to start"),
                    Ui.emptyState(plan.blocks().isEmpty() && plan.deferred().isEmpty()
                            ? "No homework outstanding and nothing worth suggesting. "
                                    + "The evening is yours."
                            : "There is no evening left before "
                                    + plan.endsBy() + " to start anything in."));
        }

        EveningPlan.StartWith start = plan.startWith();
        Label headline = new Label(start.label());
        headline.getStyleClass().add("headline");
        headline.setWrapText(true);

        VBox card = Ui.card("card-brand", Ui.meta("START WITH"), headline);

        if (start.detail() != null) card.getChildren().add(Ui.detail(start.detail()));
        card.getChildren().add(Ui.numeric(Times.duration(start.minutes())
                + " · plan runs " + plan.startsAt() + " to " + plan.endsBy()));

        // Only a suggested block carries a reason, and it has to be shown: a
        // ranked list with no explanation is a horoscope, and she has to be
        // able to disagree with it.
        if (start.reason() != null) card.getChildren().add(Ui.meta(start.reason()));

        return card;
    }

    private Node timelineCard(EveningPlan plan) {
        VBox card = Ui.card(Ui.sectionTitle("This evening"));

        if (plan.blocks().isEmpty()) {
            card.getChildren().add(Ui.emptyState("Nothing scheduled."));
            return card;
        }

        for (PlanBlock block : plan.blocks()) {
            card.getChildren().add(blockRow(block));
        }

        card.getChildren().add(Ui.meta(
                Times.duration(plan.workMinutes()) + " of work"
                        + (plan.suggestedMinutes() > 0
                                ? ", " + Times.duration(plan.suggestedMinutes()) + " suggested"
                                : "")
                        + (plan.spareMinutes() > 0
                                ? " · " + Times.duration(plan.spareMinutes()) + " spare"
                                : "")));
        return card;
    }

    private Node blockRow(PlanBlock block) {
        Label time = Ui.numeric(block.startLabel() + " – " + block.endLabel());
        time.setMinWidth(110);

        Label label = new Label(block.label());
        label.setWrapText(true);
        if (block.kind() != PlanBlock.Kind.BREAK) label.getStyleClass().add("section-title");

        VBox lines = new VBox(2, label);
        if (block.detail() != null) lines.getChildren().add(Ui.meta(block.detail()));
        if (block.reason() != null) lines.getChildren().add(Ui.meta(block.reason()));

        var row = Ui.row(time, lines, Ui.grow());

        if (block.part() != null) {
            row.getChildren().add(Ui.badge(block.part().label(), "badge"));
        }

        switch (block.kind()) {
            case BREAK -> row.getChildren().add(Ui.badge("Break", "badge-pause"));
            case REVISION -> row.getChildren().add(Ui.badge("Revision", "badge-revise"));
            case SUGGESTED -> {
                row.getChildren().add(Ui.badge("Suggested", "badge-revise"));
                // A suggestion becomes real only when she queues it, so the
                // plan never fills up with guesses nobody asked for.
                Button queue = new Button("Add to revision");
                queue.getStyleClass().add("button-quiet");
                queue.setOnAction(event -> {
                    context.tasks().createRevision(context.userId(), block.label(),
                            block.subjectId(), block.minutes());
                    queue.setDisable(true);
                    queue.setText("Added");
                });
                row.getChildren().add(queue);
            }
            case HOMEWORK -> { /* The default row needs no badge. */ }
        }

        return row;
    }

    // -----------------------------------------------------------------------

    /**
     * What will not fit, and where it could go instead.
     *
     * "These three will not fit before 21:00" is the most useful thing the
     * planner can say. Saying it and stopping is where the web app stopped;
     * the catch-up planner answers the obvious follow-up from the one source
     * that can -- the free and study periods the school already set aside.
     */
    private Node deferredCard(EveningPlan plan, MainWindow.SchoolDay day) {
        VBox card = Ui.card("card-pause", Ui.sectionTitle("Will not fit tonight"));

        CatchupSuggestions catchups = CatchupPlanner.suggest(new CatchupPlanner.Request(
                plan.deferred(), day.week(), day.clock().dayOfWeek(),
                day.clock().date(), day.clock().minutes(), List.of()));

        for (DeferredTask task : plan.deferred()) {
            Label title = new Label(task.label());
            title.getStyleClass().add("section-title");
            title.setWrapText(true);

            VBox lines = new VBox(2, title);
            lines.getChildren().add(Ui.meta(
                    task.scheduledMinutes() > 0
                            ? Times.duration(task.scheduledMinutes()) + " fits tonight, "
                                    + Times.duration(task.outstandingMinutes()) + " left over"
                            : Times.duration(task.minutes()) + ", none of it fits tonight"));

            CatchupOffer offer = offerFor(catchups, task);
            if (offer != null) {
                lines.getChildren().add(Ui.detail("Could go in " + offer.slot().label()
                        + " " + offer.slot().when() + " at " + offer.slot().startLabel()
                        + " — " + Times.duration(offer.minutes())
                        + (offer.coversItAll() ? ", which covers it" : ", and the rest after")));
            } else {
                // Never silently dropped: a task with nowhere to go is said
                // out loud, and the two reasons call for opposite responses.
                lines.getChildren().add(Ui.detail(reasonFor(catchups, task)));
            }

            card.getChildren().add(lines);
        }

        return card;
    }

    private static CatchupOffer offerFor(CatchupSuggestions catchups, DeferredTask task) {
        for (CatchupOffer offer : catchups.offers()) {
            if (offer.task().taskId().equals(task.taskId())) return offer;
        }
        return null;
    }

    private static String reasonFor(CatchupSuggestions catchups, DeferredTask task) {
        for (CatchupSuggestions.Unplaceable blocked : catchups.unplaceable()) {
            if (!blocked.task().taskId().equals(task.taskId())) continue;
            return switch (blocked.reason()) {
                case NO_SLOT_BEFORE_DUE -> "There is no free period before this is due. "
                        + "That is worth saying to the teacher rather than planning around.";
                case SLOTS_ALL_FULL -> "Every free period this week is already spoken for.";
                case NO_SLOTS_AT_ALL -> "Your timetable has no free or study periods to use.";
            };
        }
        return "Rolls over to tomorrow.";
    }

    // -----------------------------------------------------------------------

    /**
     * The free periods still ahead, each with something to spend it on.
     *
     * This is time the school has already given her, which the product used to
     * display and say nothing about.
     */
    private Node slotsCard(StudyGuidance guidance) {
        VBox card = Ui.card(Ui.sectionTitle("Free periods coming up"));

        for (var slot : guidance.slots()) {
            Label when = Ui.numeric(slot.startLabel() + " – " + slot.endLabel());
            when.setMinWidth(110);

            VBox lines = new VBox(2, new Label(slot.label() + ", " + slot.when()));
            if (slot.suggestion() != null) {
                lines.getChildren().add(Ui.detail(slot.suggestion().headline()));
                String reason = slot.suggestion().firstReason();
                if (reason != null) lines.getChildren().add(Ui.meta(reason));
            }

            card.getChildren().add(Ui.row(when, lines, Ui.grow(),
                    Ui.badge(Times.durationCompact(slot.minutes()), "badge")));
        }

        return card;
    }
}
