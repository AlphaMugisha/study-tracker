package flow.study.ui.view;

import flow.study.domain.timetable.Days;
import flow.study.domain.timetable.Overlaps;
import flow.study.domain.timetable.ResolvedEntry;
import flow.study.domain.timetable.Times;
import flow.study.ui.AppContext;
import flow.study.ui.MainWindow;
import javafx.beans.property.ObjectProperty;
import javafx.scene.Node;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;

import java.util.ArrayList;
import java.util.List;

/**
 * The school week, read only.
 *
 * Deliberately not editable here, and not an import screen either. Reading a
 * photograph of a timetable needs a vision model and therefore a network,
 * which is the one thing this app is built not to require -- so the week is
 * imported on the website, where that already works, and this is the offline
 * copy of the result.
 *
 * What it does add is the clash report. In the cloud, two lessons at once are
 * refused by an EXCLUDE constraint over a timerange; the local database has no
 * such thing, so Overlaps checks it in Java and names both lessons. That is
 * better for her than the constraint was: "Maths already runs then" rather
 * than a range operator in an error message.
 */
public final class TimetableView {

    private final AppContext context;
    private final VBox body = new VBox(16);
    private final VBox week = new VBox(12);

    public TimetableView(AppContext context, ObjectProperty<MainWindow.SchoolDay> day) {
        this.context = context;
        body.setPadding(Ui.PAGE_PADDING);
        body.getChildren().addAll(Ui.pageTitle("Timetable"), week);

        day.addListener((observable, previous, current) -> {
            if (current != null) render(current);
        });
        if (day.get() != null) render(day.get());
    }

    public Node root() {
        return Ui.page(body);
    }

    private void render(MainWindow.SchoolDay day) {
        week.getChildren().clear();

        List<ResolvedEntry> entries = day.week();
        if (entries.isEmpty()) {
            week.getChildren().add(Ui.card(
                    Ui.sectionTitle("No timetable saved"),
                    Ui.emptyState("Import your week on the StudyFlow website. Once it is "
                            + "confirmed there, it arrives here on the next sync and the "
                            + "rest of the app fills in on its own.")));
            return;
        }

        List<Overlaps.Clash> clashes = Overlaps.findAll(entries);
        if (!clashes.isEmpty()) {
            VBox warning = Ui.card("card-danger",
                    Ui.sectionTitle("Two things at once"),
                    Ui.detail("Your timetable has overlapping entries. Fix them on the "
                            + "website and re-sync."));
            for (Overlaps.Clash clash : clashes) {
                warning.getChildren().add(Ui.meta(clash.describe()));
            }
            week.getChildren().add(warning);
        }

        for (int dayOfWeek = 1; dayOfWeek <= 7; dayOfWeek++) {
            List<ResolvedEntry> forDay = new ArrayList<>();
            for (ResolvedEntry entry : entries) {
                if (entry.dayOfWeek() == dayOfWeek) forDay.add(entry);
            }
            if (forDay.isEmpty()) continue;

            forDay.sort(java.util.Comparator.comparingInt(ResolvedEntry::startMinutes));
            week.getChildren().add(dayCard(dayOfWeek, forDay, day));
        }
    }

    private Node dayCard(int dayOfWeek, List<ResolvedEntry> entries,
                         MainWindow.SchoolDay day) {
        boolean isToday = dayOfWeek == day.clock().dayOfWeek();

        VBox card = Ui.card(isToday ? "card-brand" : "card");
        card.getChildren().add(Ui.row(
                Ui.sectionTitle(Days.name(dayOfWeek)),
                Ui.grow(),
                isToday ? Ui.badge("Today", "badge-lesson") : Ui.meta("")));

        for (ResolvedEntry entry : entries) {
            Label time = Ui.numeric(entry.startLabel() + " – " + entry.endLabel());
            time.setMinWidth(110);

            VBox lines = new VBox(2, new Label(entry.label()));

            // The teacher is kept as a fact rather than folded into the detail
            // line, so it can be shown even when the detail slot is taken by a
            // room or a title.
            List<String> meta = new ArrayList<>();
            if (entry.room() != null) meta.add(entry.room());
            if (entry.teacher() != null) meta.add(entry.teacher());
            if (!meta.isEmpty()) lines.getChildren().add(Ui.meta(String.join(" · ", meta)));

            var row = Ui.row(time, lines, Ui.grow(),
                    Ui.badge(Times.durationCompact(entry.durationMinutes()), "badge"));

            if (entry.activityType().isWorkSlot()) {
                row.getChildren().add(Ui.badge("free to work", "badge-revise"));
            }

            card.getChildren().add(row);
        }

        return card;
    }
}
