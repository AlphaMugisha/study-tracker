package flow.study.ui;

import flow.study.domain.model.UserRole;
import flow.study.domain.presence.Presence;
import flow.study.domain.presence.PresenceDescriber;
import flow.study.domain.timetable.ResolvedEntry;
import flow.study.domain.timetable.SchoolClock;
import flow.study.domain.timetable.TimetableResolver;
import flow.study.domain.timetable.TimetableState;
import flow.study.domain.text.Display;
import flow.study.sync.Connectivity;
import flow.study.sync.SyncResult;
import flow.study.ui.kit.Controls;
import flow.study.ui.kit.Glyph;
import flow.study.ui.kit.Icons;
import flow.study.ui.kit.Motion;
import flow.study.ui.view.DataView;
import flow.study.ui.view.Screen;
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
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressIndicator;
import javafx.scene.control.Tooltip;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.util.Duration;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

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

    private static final List<String> NAV = List.of(
            "Today", "Timetable", "Homework", "Home plan", "Stuck on", "Settings");

    private final AppContext context;
    private final BorderPane root = new BorderPane();
    private final VBox sidebar = new VBox(4);
    private final BorderPane content = new BorderPane();
    private final Label syncPill = new Label();
    private final ProgressIndicator syncSpinner = new ProgressIndicator();
    private final Button syncNow = new Button("Sync");
    private final Label clockLabel = new Label();

    /** The current school day, recomputed every second, read by every view. */
    private final ObjectProperty<SchoolDay> day = new SimpleObjectProperty<>();

    /**
     * Views are built on first visit, not all six at startup.
     *
     * Constructing every screen before showing anything delays the window by
     * however long the slowest one takes, and five of the six are not being
     * looked at. The suppliers below are the recipe; `built` is what has
     * actually been made.
     */
    private final Map<String, Supplier<Screen>> recipes = new LinkedHashMap<>();
    private final Map<String, Node> built = new LinkedHashMap<>();
    private final Map<String, DataView> dataViews = new LinkedHashMap<>();
    private final Map<String, Button> navButtons = new LinkedHashMap<>();

    private String activeView = "Today";
    private Timeline ticker;
    private boolean syncing;

    /** The last result, kept so the pill can be re-rendered every tick. */
    private SyncResult lastResult;

    /** When a sync last actually landed. Null until one does. */
    private Instant lastSynced;

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

    /** Handed in by the app: what replaces this window once the account goes. */
    private final Runnable onSignedOut;

    public MainWindow(AppContext context, Runnable onSignedOut) {
        this.context = context;
        this.onSignedOut = onSignedOut;
        root.getStyleClass().add("root");
        root.setTop(topBar());
        root.setLeft(buildSidebar());
        root.setCenter(content);

        recipes.put("Today", () -> new TodayView(context, day));
        recipes.put("Timetable", () -> new TimetableView(context, day));
        recipes.put("Homework", () -> new HomeworkView(context));
        recipes.put("Home plan", () -> new PlanView(context, day));
        recipes.put("Stuck on", () -> new StuckOnView(context));
        recipes.put("Settings", () -> new SettingsView(context, onSignedOut));
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

    /** Begin ticking, show Today, and try a sync. */
    public void start() {
        tick();
        ticker = new Timeline(new KeyFrame(Duration.seconds(1), event -> tick()));
        ticker.setCycleCount(Animation.INDEFINITE);
        ticker.play();

        show("Today");
        refreshSyncPill(null);
        applyRoleNotice();
        sync();

        // The watcher calls back on its own thread; the pill and every view it
        // refreshes are the FX thread's business.
        context.startWatching(() -> javafx.application.Platform.runLater(this::sync));
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

        // Cheap: setPill returns without touching the scene graph unless the
        // words actually changed, which is once a minute at most.
        refreshSyncPill(lastResult);
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

    /**
     * Tell an adult that this is the student app.
     *
     * ------------------------------------------------------------------
     * Found the hard way. A copy signed in with an admin account pulls
     * correctly, finds that the account owns no subjects, no timetable and no
     * homework, and renders "No timetable saved" -- which is true of the
     * account and completely misleading about the product. The person is left
     * believing the sync is broken.
     *
     * The 2026-11-10 design is explicit that the parent side stays on the
     * web, and this is where that decision has to become visible. It says
     * which account to use instead and where the adult view actually lives,
     * because a notice that only says "wrong account" leaves somebody exactly
     * as stuck as the empty screen did.
     * ------------------------------------------------------------------
     */
    private void applyRoleNotice() {
        if (context.profile().role() != UserRole.ADMIN) {
            root.setBottom(null);
            return;
        }

        Label title = new Label("This is the student app.");
        title.getStyleClass().add("section-title");

        Label detail = new Label("You are signed in as "
                + (context.session().email() == null ? "an adult account" : context.session().email())
                + ", which keeps no timetable or homework of its own. Sign out in "
                + "Settings and sign in with the student's account to see their "
                + "week here. The adult view -- reports, and every student you "
                + "look after -- stays on the website.");
        detail.setWrapText(true);
        detail.getStyleClass().add("detail");

        // The way out sits in the notice itself. Telling somebody the wrong
        // account is signed in and then making them find Settings is most of
        // the problem left in place.
        Button signOut = Controls.outline("Sign out", Icons.logOut());
        signOut.setOnAction(event -> {
            String refusal = context.signOut();
            if (refusal == null) onSignedOut.run();
        });

        VBox lines = new VBox(3, title, detail);
        HBox banner = new HBox(12, Glyph.medium(Icons.info()), lines, signOut);
        banner.setAlignment(Pos.CENTER_LEFT);
        banner.getStyleClass().add("notice");
        HBox.setHgrow(lines, Priority.ALWAYS);
        root.setBottom(banner);
    }

    // -----------------------------------------------------------------------
    // Chrome
    // -----------------------------------------------------------------------

    private Node topBar() {
        Label logo = new Label("StudyFlow");
        logo.getStyleClass().add("logo");

        clockLabel.getStyleClass().addAll("meta", "numeric");

        syncPill.getStyleClass().add("pill");

        syncSpinner.setPrefSize(14, 14);
        syncSpinner.setMaxSize(14, 14);
        showSpinner(false);

        syncNow.getStyleClass().setAll("button", "button-quiet");
        syncNow.setGraphic(Glyph.medium(Icons.refreshCw()));
        syncNow.setOnAction(event -> sync());
        Motion.interactive(syncNow);

        HBox bar = new HBox(12, logo, clockLabel, Controls.spacer(),
                syncSpinner, syncPill, syncNow);
        bar.getStyleClass().add("top-bar");
        bar.setAlignment(Pos.CENTER_LEFT);
        return bar;
    }

    /**
     * The rail.
     *
     * Icons come from the same lucide set the website uses, generated into
     * Java rather than taken from an icon pack -- see Icons. Without them
     * every row was the same shape as every other row, and a sidebar whose
     * entries differ only in their text is a list, not navigation.
     *
     * Settings sits below a rule rather than in the run, because it is not a
     * place in the product the way the five above it are.
     */
    private Node buildSidebar() {
        sidebar.getStyleClass().add("rail");
        sidebar.setPrefWidth(196);
        sidebar.setSpacing(3);

        Button add = Controls.primary("Add homework", Icons.plus());
        add.setMaxWidth(Double.MAX_VALUE);
        add.setOnAction(event -> show("Homework"));
        VBox.setMargin(add, new javafx.geometry.Insets(2, 2, 14, 2));
        sidebar.getChildren().add(add);

        for (String name : NAV) {
            if (name.equals("Settings")) {
                Region rule = new Region();
                rule.getStyleClass().add("rail-divider");
                rule.setMaxWidth(Double.MAX_VALUE);
                VBox.setMargin(rule, new javafx.geometry.Insets(10, 6, 6, 6));
                sidebar.getChildren().add(rule);
            }

            Button button = Controls.navRow(name, navIcon(name));
            button.setOnAction(event -> show(name));
            navButtons.put(name, button);
            sidebar.getChildren().add(button);
        }

        Region push = new Region();
        VBox.setVgrow(push, Priority.ALWAYS);
        sidebar.getChildren().addAll(push, accountFooter());

        return sidebar;
    }

    /**
     * Who is signed in, and the way out.
     *
     * ------------------------------------------------------------------
     * Both halves earn their place, and the first one earns it the harder
     * way. This copy spent a day showing an empty app because it was signed
     * in with an adult account that owns no timetable -- and there was
     * nowhere on any screen that said whose copy it was. An app with one
     * account and no visible identity is fine right up to the moment it is
     * the wrong account, and then it is unreadable.
     *
     * The email is elided from the FRONT when it is too long. The domain is
     * the part that distinguishes two accounts belonging to the same person,
     * and "alpha.mugisha.stude..." would hide exactly the character that
     * matters.
     * ------------------------------------------------------------------
     */
    private Node accountFooter() {
        String email = context.session().email();
        String shown = email == null ? "this computer" : email;
        if (shown.length() > 24) shown = "…" + shown.substring(shown.length() - 23);

        Label who = new Label(shown);
        who.getStyleClass().add("meta");
        who.setTooltip(new Tooltip(email == null ? "No account saved" : email));

        Label role = new Label(context.profile().role() == UserRole.ADMIN
                ? "Adult account" : "Signed in");
        role.getStyleClass().add("eyebrow");

        Button out = Controls.iconButton(Icons.logOut(), "Sign out");
        out.setOnAction(event -> signOut());

        VBox lines = new VBox(1, role, who);
        HBox footer = new HBox(8, lines, Controls.spacer(), out);
        footer.setAlignment(Pos.CENTER_LEFT);
        footer.getStyleClass().add("rail-account");
        return footer;
    }

    /**
     * Sign out, or say why not.
     *
     * The refusal goes on the pill rather than into a dialog. It is advice --
     * sync first -- and the changes it is protecting are the ones already
     * counted there, so that is where somebody is already looking.
     */
    private void signOut() {
        String refusal = context.signOut();
        if (refusal == null) {
            onSignedOut.run();
            return;
        }
        setPill(refusal, "pill-problem");
    }

    /** The same glyph the website puts beside the same word. */
    private static Node navIcon(String name) {
        return switch (name) {
            case "Today" -> Icons.sun();
            case "Timetable" -> Icons.calendarDays();
            case "Homework" -> Icons.clipboardList();
            case "Home plan" -> Icons.listChecks();
            case "Stuck on" -> Icons.circleHelp();
            case "Settings" -> Icons.settings();
            default -> Icons.chevronRight();
        };
    }

    /** Show a screen, building it the first time it is asked for. */
    private void show(String name) {
        Node view = built.computeIfAbsent(name, key -> {
            Screen made = recipes.get(key).get();
            if (made instanceof DataView data) {
                dataViews.put(key, data);
                // A screen built mid-sync has to be told, or it renders an
                // empty list as a fact while the answer is still in flight.
                data.setSyncing(syncing);
            }
            return made.root();
        });
        if (view == null) return;

        activeView = name;
        content.setCenter(view);

        for (Map.Entry<String, Button> entry : navButtons.entrySet()) {
            Controls.setActive(entry.getValue(), entry.getKey().equals(name));
        }
    }

    // -----------------------------------------------------------------------
    // Sync
    // -----------------------------------------------------------------------

    private void sync() {
        if (syncing) return; // the worker is single-threaded; queueing helps nobody

        setSyncing(true);
        refreshSyncPill(lastResult);

        context.syncInBackground(result -> {
            setSyncing(false);
            lastResult = result;

            switch (result.outcome()) {
                // PARTIAL still reached the cloud, which is what "online"
                // means here. The refusal shows on the pill separately.
                case SYNCED, UP_TO_DATE, PARTIAL -> {
                    lastSynced = Instant.now();
                    context.connectivity().markOnline();
                }
                case OFFLINE, FAILED -> context.connectivity().markOffline();
                case SIGN_IN_NEEDED -> { /* the network is fine; the token is not */ }
            }

            refreshSyncPill(result);
            // The pull may have replaced everything underneath, so the clock
            // and every built screen are re-read from the local copy.
            tick();
            for (DataView view : dataViews.values()) view.refresh();
        });
    }

    /** One flag, three places it shows: the spinner, the button, the views. */
    private void setSyncing(boolean value) {
        syncing = value;
        showSpinner(value);
        syncNow.setDisable(value);
        for (DataView view : dataViews.values()) view.setSyncing(value);
    }

    private void showSpinner(boolean visible) {
        syncSpinner.setVisible(visible);
        syncSpinner.setManaged(visible);
    }

    /**
     * What the pill says, and in what tone.
     *
     * Ordered by what matters most to her, not by what happened most
     * recently. A refusal outranks everything: it is the only state that
     * needs a decision. Offline outranks a successful sync from ten minutes
     * ago, because "Synced" while the wifi is off is the one thing this pill
     * must never say -- working without a connection is the whole promise,
     * and a status line that lies about it undoes that.
     *
     * Offline is styled quiet rather than as an error. It is the expected
     * condition most evenings; a red badge would contradict the design.
     */
    private void refreshSyncPill(SyncResult result) {
        if (syncing) {
            setPill("Syncing…", "pill");
            return;
        }

        int waiting = context.outbox().pendingCount();
        int refused = context.outbox().rejectedCount();

        if (refused > 0) {
            setPill(refused + (refused == 1 ? " change rejected" : " changes rejected"),
                    "pill-problem");
            return;
        }

        if (result != null && result.outcome() == SyncResult.Outcome.SIGN_IN_NEEDED) {
            setPill("Sign in needed", "pill-problem");
            return;
        }

        if (context.connectivity().state() == Connectivity.State.OFFLINE) {
            setPill(waiting > 0 ? "Offline · " + waiting + " waiting" : "Offline",
                    "pill-offline");
            return;
        }

        if (waiting > 0) {
            setPill(waiting + " waiting", "pill-waiting");
            return;
        }

        if (lastSynced != null) {
            setPill("Synced · " + Display.agoLabel(
                    java.time.Duration.between(lastSynced, Instant.now())), "pill-synced");
            return;
        }

        setPill("Not synced yet", "pill-offline");
    }

    /**
     * Set the pill, or do nothing if it would not change.
     *
     * This runs once a second now. Restyling a node to the words it already
     * has is work the FX thread does not need.
     */
    private void setPill(String text, String modifier) {
        if (text.equals(syncPill.getText())
                && syncPill.getStyleClass().size() == 2
                && syncPill.getStyleClass().get(1).equals(modifier)) {
            return;
        }
        syncPill.setText(text);
        syncPill.getStyleClass().setAll("pill", modifier);
    }

    /** Which screens exist right now. Useful when debugging lazy construction. */
    List<String> builtViews() {
        return new ArrayList<>(built.keySet());
    }
}
