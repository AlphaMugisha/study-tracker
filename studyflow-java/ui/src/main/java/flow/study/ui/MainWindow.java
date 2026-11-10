package flow.study.ui;

import flow.study.domain.presence.Presence;
import flow.study.domain.presence.PresenceDescriber;
import flow.study.domain.timetable.ResolvedEntry;
import flow.study.domain.timetable.SchoolClock;
import flow.study.domain.timetable.TimetableResolver;
import flow.study.domain.timetable.TimetableState;
import flow.study.sync.SyncResult;
import flow.study.ui.view.HomeworkView;
import flow.study.ui.view.PlanView;
import flow.study.ui.view.SettingsView;
import flow.study.ui.view.StuckOnView;
import flow.study.ui.view.TimetableView;
import flow.study.ui.view.TodayView;
import javafx.animation.Animation;
import javafx.animation.KeyFrame;
import javafx.animation.Timeline;
import javafx.beans.property.ObjectProperty;
import javafx.beans.property.SimpleObjectProperty;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.util.Duration;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The shell: where she is, what she is doing, and what is waiting to be sent.
 *
 * The school day ticks here rather than in each view. One Timeline recomputes
 * the resolver every second and publishes the result as an observable, so a
 * countdown on any screen counts down and nothing re-renders a whole tree to
 * do it. The web app needed a hook per component for this; an observable
 * property is the better fit.
 */
public final class MainWindow {

    /**
     * School mode.
     *
     * While she is at school the app collapses to one thing: writing down the
     * homework she has just been given. Everything else is for later, and
     * having it all available during a lesson is an invitation to spend the
     * lesson in here.
     *
     * "At school" is first bell to last, breaks included -- lifting the lock
     * every break would lift it most of the day.
     */
    private static final List<String> ALLOWED_AT_SCHOOL = List.of("Homework", "Stuck on");

    private final AppContext context;
    private final BorderPane root = new BorderPane();
    private final VBox sidebar = new VBox(4);
    private final BorderPane content = new BorderPane();
    private final Label syncPill = new Label();
    private final Label clockLabel = new Label();

    /** The current school day, recomputed every second, read by every view. */
    private final ObjectProperty<SchoolDay> day = new SimpleObjectProperty<>();

    private final Map<String, Node> views = new LinkedHashMap<>();
    private final Map<String, Button> navButtons = new LinkedHashMap<>();
    private String activeView = "Today";
    private Timeline ticker;

    /**
     * Everything derived from the clock, in one value.
     *
     * Bundled so a view never sees a half-updated day: the presence and the
     * state it was derived from always agree, which they would not if each
     * were its own property.
     */
    public record SchoolDay(SchoolClock clock, TimetableState state, Presence presence,
                            List<ResolvedEntry> week, boolean locked) {
    }

    public MainWindow(AppContext context) {
        this.context = context;
        root.getStyleClass().add("root");
        root.setTop(topBar());
        root.setLeft(buildSidebar());
        root.setCenter(content);
    }

    public BorderPane root() {
        return root;
    }

    public ObjectProperty<SchoolDay> dayProperty() {
        return day;
    }

    public AppContext context() {
        return context;
    }

    /** Begin ticking, build the views, and try a sync. */
    public void start() {
        views.put("Today", new TodayView(context, day).root());
        views.put("Timetable", new TimetableView(context, day).root());
        views.put("Homework", new HomeworkView(context).root());
        views.put("Home plan", new PlanView(context, day).root());
        views.put("Stuck on", new StuckOnView(context).root());
        views.put("Settings", new SettingsView(context).root());

        tick();
        ticker = new Timeline(new KeyFrame(Duration.seconds(1), event -> tick()));
        ticker.setCycleCount(Animation.INDEFINITE);
        ticker.play();

        show("Today");
        refreshSyncPill(null);
        sync();
    }

    public void stop() {
        if (ticker != null) ticker.stop();
    }

    // -----------------------------------------------------------------------
    // The clock
    // -----------------------------------------------------------------------

    private void tick() {
        SchoolClock clock = context.clock();
        List<ResolvedEntry> week = context.timetable().activeWeek();
        TimetableState state =
                TimetableResolver.resolveNow(week, clock.minutes(), clock.dayOfWeek());

        var profile = context.profile();
        Presence presence = PresenceDescriber.describe(new PresenceDescriber.Input(
                state, clock.minutes(), clock.dayOfWeek(),
                profile.studyUntilMinutes(), profile.settleMinutes()));

        boolean locked = presence.atSchool();
        day.set(new SchoolDay(clock, state, presence, week, locked));

        clockLabel.setText(clock.label());
        applyLock(locked);
    }

    /**
     * Grey out what school mode withholds.
     *
     * Disabled rather than hidden: a nav that changes shape during the day is
     * disorienting, and the point is that she can see the app has not lost the
     * rest of itself -- it is just not for now.
     */
    private void applyLock(boolean locked) {
        for (Map.Entry<String, Button> entry : navButtons.entrySet()) {
            boolean allowed = !locked || ALLOWED_AT_SCHOOL.contains(entry.getKey());
            entry.getValue().setDisable(!allowed);
        }
        if (locked && !ALLOWED_AT_SCHOOL.contains(activeView)) {
            show("Homework");
        }
    }

    // -----------------------------------------------------------------------
    // Chrome
    // -----------------------------------------------------------------------

    private Node topBar() {
        Label logo = new Label("StudyFlow");
        logo.getStyleClass().add("logo");

        clockLabel.getStyleClass().addAll("detail", "numeric");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        syncPill.getStyleClass().add("pill");

        Button syncNow = new Button("Sync");
        syncNow.getStyleClass().add("button-quiet");
        syncNow.setOnAction(event -> sync());

        HBox bar = new HBox(14, logo, clockLabel, spacer, syncPill, syncNow);
        bar.getStyleClass().add("top-bar");
        bar.setAlignment(Pos.CENTER_LEFT);
        return bar;
    }

    private Node buildSidebar() {
        sidebar.getStyleClass().add("sidebar");
        sidebar.setPrefWidth(188);

        for (String name : List.of("Today", "Timetable", "Homework", "Home plan",
                "Stuck on", "Settings")) {
            Button button = new Button(name);
            button.getStyleClass().add("nav-button");
            button.setMaxWidth(Double.MAX_VALUE);
            button.setOnAction(event -> show(name));
            navButtons.put(name, button);
            sidebar.getChildren().add(button);
        }

        return sidebar;
    }

    private void show(String name) {
        Node view = views.get(name);
        if (view == null) return;

        activeView = name;
        content.setCenter(view);

        for (Map.Entry<String, Button> entry : navButtons.entrySet()) {
            Button button = entry.getValue();
            button.getStyleClass().remove("nav-button-active");
            if (entry.getKey().equals(name)) button.getStyleClass().add("nav-button-active");
        }
    }

    // -----------------------------------------------------------------------
    // Sync
    // -----------------------------------------------------------------------

    private void sync() {
        setPill("Syncing...", "pill");
        context.syncInBackground(result -> {
            refreshSyncPill(result);
            // The pull may have replaced everything on screen, so the views
            // are rebuilt from the local copy rather than left stale.
            tick();
            rebuildDataViews();
        });
    }

    /**
     * What the pill says, and in what tone.
     *
     * Offline is styled as a quiet state rather than an error. It is the
     * expected condition most evenings and the whole promise of the product is
     * that it does not matter -- a red badge would contradict the design.
     */
    private void refreshSyncPill(SyncResult result) {
        int waiting = context.outbox().pendingCount();
        int refused = context.outbox().rejectedCount();

        if (refused > 0) {
            setPill(refused + (refused == 1 ? " change refused" : " changes refused"),
                    "pill-problem");
            return;
        }

        if (result != null) {
            switch (result.outcome()) {
                case OFFLINE -> setPill(waiting > 0
                        ? "Offline · " + waiting + " waiting"
                        : "Offline", "pill-offline");
                case SIGN_IN_NEEDED -> setPill("Sign in needed", "pill-problem");
                case FAILED -> setPill("Sync failed", "pill-problem");
                case PARTIAL -> setPill(result.summary(), "pill-problem");
                case SYNCED, UP_TO_DATE -> setPill(result.summary(), "pill-synced");
            }
            return;
        }

        setPill(waiting > 0 ? waiting + " waiting" : "Not synced yet",
                waiting > 0 ? "pill-waiting" : "pill-offline");
    }

    private void setPill(String text, String modifier) {
        syncPill.setText(text);
        syncPill.getStyleClass().setAll("pill", modifier);
    }

    /** Rebuild the views that read rows rather than the clock. */
    private void rebuildDataViews() {
        List<String> rebuilt = new ArrayList<>(List.of("Homework", "Stuck on", "Settings"));
        views.put("Homework", new HomeworkView(context).root());
        views.put("Stuck on", new StuckOnView(context).root());
        views.put("Settings", new SettingsView(context).root());
        if (rebuilt.contains(activeView)) show(activeView);
    }

    /** Padding used by every page, so the views do not each pick their own. */
    static Insets pagePadding() {
        return new Insets(24, 28, 28, 28);
    }
}
