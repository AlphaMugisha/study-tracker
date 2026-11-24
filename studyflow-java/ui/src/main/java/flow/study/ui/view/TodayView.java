package flow.study.ui.view;

import flow.study.domain.model.TaskStatus;
import flow.study.domain.presence.Presence;
import flow.study.domain.tasks.AssignmentView;
import flow.study.domain.text.Display;
import flow.study.domain.timetable.ResolvedEntry;
import flow.study.domain.timetable.Times;
import flow.study.domain.timetable.TimetableState;
import flow.study.ui.AppContext;
import flow.study.ui.MainWindow;
import flow.study.ui.kit.Cards;
import flow.study.ui.kit.Controls;
import flow.study.ui.kit.Glyph;
import flow.study.ui.kit.Icons;
import flow.study.ui.kit.Motion;
import flow.study.ui.kit.Type;
import javafx.beans.property.ObjectProperty;
import javafx.scene.Node;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * What am I doing right now, what is next, and what do I do when I get home.
 *
 * The one screen that justifies the product. It reads the ticking school day
 * rather than computing anything itself, so the countdown counts down.
 *
 * Every string here is an EXPECTATION, produced by PresenceDescriber. The app
 * cannot see whether she is in the room, and the wording never suggests
 * otherwise -- see the comment on Presence before changing any of it.
 *
 * The shape is the website's dashboard, deliberately: an eyebrow carrying the
 * date so the greeting beneath it can be two words, then the one thing
 * happening now on a gradient panel, then three numbers, then the rest of the
 * day. The hierarchy is the content -- a page where everything is 16px bold
 * makes somebody read all of it to find the one line they came for.
 */
public final class TodayView implements Screen {

    private final AppContext context;
    private final VBox body = new VBox(18);

    private final Label eyebrow = Type.eyebrow("");
    private final Label greeting = Type.display("");

    private final VBox hero = new VBox(10);
    private final Label headline = Type.pageTitle("");
    private final Label detail = Type.body("");
    private final Label countdown = Type.meta("");
    private final ProgressBar progress = new ProgressBar(0);
    private final HBox heroTop = Controls.row();

    private final HBox stats = new HBox();
    private final VBox upNext = new VBox(10);

    public TodayView(AppContext context, ObjectProperty<MainWindow.SchoolDay> day) {
        this.context = context;

        countdown.getStyleClass().add("numeric");
        progress.setMaxWidth(Double.MAX_VALUE);
        hero.getChildren().addAll(heroTop, headline, detail, progress, countdown);

        upNext.getStyleClass().add("card");

        body.setPadding(Ui.PAGE_PADDING);
        body.getChildren().addAll(new VBox(2, eyebrow, greeting), hero, stats, upNext);

        Node zoneNote = timezoneNote();
        if (zoneNote != null) body.getChildren().add(zoneNote);

        day.addListener((observable, previous, current) -> {
            if (current != null) render(current);
        });
        if (day.get() != null) render(day.get());

        Motion.reveal(hero, 1);
        Motion.reveal(stats, 2);
        Motion.reveal(upNext, 3);
    }

    @Override
    public Node root() {
        return Ui.page(body);
    }

    private void render(MainWindow.SchoolDay day) {
        Presence presence = day.presence();
        LocalDate today = day.clock().date();

        eyebrow.setText(Display.fullDate(today).toUpperCase(java.util.Locale.UK));
        greeting.setText(Display.greeting(context.zone(), Instant.now())
                + ", " + Display.firstNameOf(context.profile().fullName()) + ".");

        renderHero(presence);
        renderStats(day);
        renderUpNext(day);
    }

    /**
     * The one thing happening now.
     *
     * Gradient when there is work in the frame and the calmer variant during a
     * break, which is the same split the website makes: a break should still
     * read as "now" without reading as "get on with it".
     *
     * The icon is not chosen here. PresenceDescriber already decides which
     * one each state wears, and picking a second one in the view is how the
     * two drift apart.
     */
    private void renderHero(Presence presence) {
        boolean rest = presence.tone() == Presence.Tone.PAUSE
                || presence.tone() == Presence.Tone.MUTED;

        hero.getStyleClass().setAll("hero", rest ? "hero-rest" : "hero-work");

        heroTop.getChildren().setAll(
                Glyph.medium(glyphFor(presence.icon())),
                Type.eyebrow(presence.known() ? "RIGHT NOW" : "NOTHING SAVED YET"));

        headline.setText(presence.headline());
        // Sized off whether the app actually knows something. "Should be in
        // class" is the loudest thing on the page; "No timetable saved" is a
        // non-event and must not be set in the same type, or the app shouts
        // its own ignorance at her.
        headline.getStyleClass().setAll(presence.known() ? "display" : "page-title");

        show(detail, presence.detail() != null);
        detail.setText(presence.detail() == null ? "" : presence.detail());

        boolean hasProgress = presence.progress() != null;
        show(progress, hasProgress);
        if (hasProgress) progress.setProgress(presence.progress());

        boolean hasCountdown = presence.endsInMinutes() != null;
        show(countdown, hasCountdown);
        if (hasCountdown) {
            countdown.setText(Times.duration(presence.endsInMinutes()) + " left");
        }
    }

    /**
     * Three numbers, which together are one sentence about the day.
     *
     * "Work tonight" comes from the planner rather than from adding up
     * estimates here, because the Home plan screen shows the same figure and
     * two ways of arriving at it is two numbers that disagree eventually.
     */
    private void renderStats(MainWindow.SchoolDay day) {
        int lessons = 0;
        for (ResolvedEntry entry : day.week()) {
            if (entry.dayOfWeek() == day.clock().dayOfWeek()
                    && entry.activityType() == flow.study.domain.model.ActivityKind.CLASS) {
                lessons++;
            }
        }

        LocalDate soon = day.clock().date().plusDays(2);
        int due = 0;
        for (AssignmentView assignment : context.tasks().assignments(context.zone(), Instant.now())) {
            if (assignment.status() != TaskStatus.COMPLETED
                    && !assignment.dueDate().isAfter(soon)) {
                due++;
            }
        }

        int tonight = Evening.plan(context, day).workMinutes();

        stats.getChildren().setAll();
        stats.getChildren().add(Cards.statTile("LESSONS TODAY",
                String.valueOf(lessons), "tone-lesson"));
        stats.getChildren().add(Cards.statTile("DUE SOON",
                String.valueOf(due), due > 0 ? "tone-danger" : null));
        stats.getChildren().add(Cards.statTile("WORK TONIGHT",
                tonight == 0 ? "--" : Times.duration(tonight), "tone-brand"));

        Cards.layOutStats(stats);
    }

    /**
     * The rest of the school day, from wherever she is in it.
     *
     * Only what is still ahead. A list that opens with four finished lessons
     * makes her scroll past the morning to find out what is next, which is the
     * question the screen exists to answer.
     */
    private void renderUpNext(MainWindow.SchoolDay day) {
        upNext.getChildren().clear();
        upNext.getChildren().add(Type.sectionTitle("Rest of the day"));

        int nowMinutes = day.clock().minutes();
        List<ResolvedEntry> ahead = new ArrayList<>();
        for (ResolvedEntry entry : day.week()) {
            if (entry.dayOfWeek() == day.clock().dayOfWeek()
                    && entry.endMinutes() > nowMinutes) {
                ahead.add(entry);
            }
        }
        ahead.sort(java.util.Comparator.comparingInt(ResolvedEntry::startMinutes));

        if (day.state() instanceof TimetableState.NoTimetable) {
            upNext.getChildren().add(Cards.emptyState(Icons.calendarPlus(),
                    "No timetable saved yet.",
                    "Add it on the Timetable page and this fills in on its own."));
            return;
        }

        if (ahead.isEmpty()) {
            upNext.getChildren().add(Cards.emptyState(Icons.coffee(),
                    day.clock().dayOfWeek() >= 6
                            ? "Nothing timetabled at the weekend."
                            : "That is the school day done.",
                    "Everything left is on the Home plan."));
            return;
        }

        boolean first = true;
        for (ResolvedEntry entry : ahead) {
            upNext.getChildren().add(entryRow(entry, first, nowMinutes));
            first = false;
        }
    }

    private Node entryRow(ResolvedEntry entry, boolean isNext, int nowMinutes) {
        Label time = Type.numeric(entry.startLabel() + " – " + entry.endLabel());
        time.setMinWidth(112);

        Label name = new Label(entry.label());
        name.getStyleClass().add(isNext ? "section-title" : "label");

        VBox lines = new VBox(2, name);
        if (entry.detail() != null) lines.getChildren().add(Type.meta(entry.detail()));

        HBox row = Controls.row(time, lines, Controls.spacer());

        if (isNext && entry.startMinutes() > nowMinutes) {
            row.getChildren().add(Controls.badge(
                    "in " + Times.duration(entry.startMinutes() - nowMinutes), "badge-lesson"));
        } else if (entry.activityType().isWorkSlot()) {
            // The slots the catch-up planner is allowed to use. Marked here so
            // "I will do it in my free period" is a visible option rather than
            // something only the planner knows about.
            row.getChildren().add(Controls.badge("free to work", "badge-revise"));
        }

        return row;
    }

    /** The lucide glyph for the icon the describer already chose. */
    private static Node glyphFor(Presence.Icon icon) {
        return switch (icon) {
            case MOON -> Icons.clock();
            case SUNRISE -> Icons.sun();
            case WALK -> Icons.graduationCap();
            case BOOK -> Icons.bookOpenText();
            case COFFEE -> Icons.coffee();
            case HOME -> Icons.listChecks();
            case PENCIL -> Icons.pencil();
            case STAR -> Icons.sparkles();
        };
    }

    private static void show(Node node, boolean visible) {
        node.setVisible(visible);
        node.setManaged(visible);
    }

    /**
     * Say whose clock these times are on, but only when it is not this one.
     *
     * Her profile carries a timezone, and every time on this screen is
     * resolved in it rather than in the host clock. That is invisible and
     * correct when the two agree, and badly confusing when they do not -- a
     * countdown that disagrees with the taskbar clock reads as a bug unless
     * the screen says which clock it is using.
     */
    private Node timezoneNote() {
        var zone = context.zone();
        if (zone.equals(java.time.ZoneId.systemDefault())) return null;
        return Type.meta("Times shown for " + zone.getId() + ", from your settings.");
    }
}
