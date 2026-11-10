package flow.study.ui.view;

import flow.study.domain.presence.Presence;
import flow.study.domain.timetable.ResolvedEntry;
import flow.study.domain.timetable.Times;
import flow.study.domain.timetable.TimetableState;
import flow.study.ui.AppContext;
import flow.study.ui.MainWindow;
import javafx.beans.property.ObjectProperty;
import javafx.scene.Node;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;
import javafx.scene.layout.VBox;

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
 */
public final class TodayView {

    private final AppContext context;
    private final VBox body = new VBox(16);
    private final VBox presenceCard = new VBox(10);
    private final VBox upNext = new VBox(10);
    private final Label headline = new Label();
    private final Label detail = new Label();
    private final Label countdown = new Label();
    private final ProgressBar progress = new ProgressBar(0);

    public TodayView(AppContext context, ObjectProperty<MainWindow.SchoolDay> day) {
        this.context = context;

        headline.setWrapText(true);
        detail.getStyleClass().add("detail");
        detail.setWrapText(true);
        countdown.getStyleClass().addAll("detail", "numeric");
        progress.setMaxWidth(Double.MAX_VALUE);

        presenceCard.getChildren().addAll(headline, detail, progress, countdown);
        upNext.getStyleClass().add("card");

        body.setPadding(Ui.PAGE_PADDING);
        body.getChildren().addAll(Ui.pageTitle("Today"), presenceCard, upNext);

        Node zoneNote = timezoneNote();
        if (zoneNote != null) body.getChildren().add(zoneNote);

        day.addListener((observable, previous, current) -> {
            if (current != null) render(current);
        });
        if (day.get() != null) render(day.get());
    }

    public Node root() {
        return Ui.page(body);
    }

    private void render(MainWindow.SchoolDay day) {
        Presence presence = day.presence();

        /*
         * The headline is sized off whether the app actually knows something.
         * "Should be in class" is the loudest thing on the page; "No timetable
         * saved" is a non-event and must not be set in the same display type,
         * or the app shouts its own ignorance at her.
         */
        headline.setText(presence.headline());
        headline.getStyleClass().setAll(presence.known() ? "headline" : "headline-unknown");

        detail.setText(presence.detail() == null ? "" : presence.detail());
        detail.setVisible(presence.detail() != null);
        detail.setManaged(presence.detail() != null);

        boolean hasProgress = presence.progress() != null;
        progress.setVisible(hasProgress);
        progress.setManaged(hasProgress);
        if (hasProgress) progress.setProgress(presence.progress());

        boolean hasCountdown = presence.endsInMinutes() != null;
        countdown.setVisible(hasCountdown);
        countdown.setManaged(hasCountdown);
        if (hasCountdown) {
            countdown.setText(Times.duration(presence.endsInMinutes()) + " left");
        }

        presenceCard.getStyleClass().setAll("card", Ui.toneClass(presence.tone()));

        renderUpNext(day);
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
        upNext.getChildren().add(Ui.sectionTitle("Rest of the day"));

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
            upNext.getChildren().add(Ui.emptyState(
                    "No timetable saved yet. Add it on the Timetable page and this "
                            + "fills in on its own."));
            return;
        }

        if (ahead.isEmpty()) {
            upNext.getChildren().add(Ui.emptyState(
                    day.clock().dayOfWeek() >= 6
                            ? "Nothing timetabled at the weekend."
                            : "Nothing left on the timetable today."));
            return;
        }

        boolean first = true;
        for (ResolvedEntry entry : ahead) {
            upNext.getChildren().add(entryRow(entry, first, nowMinutes));
            first = false;
        }
    }

    private Node entryRow(ResolvedEntry entry, boolean isNext, int nowMinutes) {
        Label time = Ui.numeric(entry.startLabel() + " – " + entry.endLabel());
        time.setMinWidth(110);

        Label name = new Label(entry.label());
        name.getStyleClass().add(isNext ? "section-title" : "label");

        VBox lines = new VBox(2, name);
        if (entry.detail() != null) lines.getChildren().add(Ui.meta(entry.detail()));

        var row = Ui.row(time, lines, Ui.grow());

        if (isNext && entry.startMinutes() > nowMinutes) {
            row.getChildren().add(Ui.badge(
                    "in " + Times.duration(entry.startMinutes() - nowMinutes), "badge-lesson"));
        } else if (entry.activityType().isWorkSlot()) {
            // The slots the catch-up planner is allowed to use. Marked here so
            // "I will do it in my free period" is a visible option rather than
            // something only the planner knows about.
            row.getChildren().add(Ui.badge("free to work", "badge-revise"));
        }

        return row;
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
        return Ui.meta("Times shown for " + zone.getId() + ", from your settings.");
    }
}
