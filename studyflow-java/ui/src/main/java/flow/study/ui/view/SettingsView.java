package flow.study.ui.view;

import flow.study.domain.model.Profile;
import flow.study.store.Intent;
import flow.study.ui.AppContext;
import javafx.scene.Node;
import javafx.scene.control.Button;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Label;
import javafx.scene.control.Spinner;
import javafx.scene.control.SpinnerValueFactory;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;

import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/**
 * Her settings, and what this copy is doing.
 *
 * The planning window is the part that matters: study_until is a hard cutoff
 * the planner defers work past, and settle_minutes is the gap between the last
 * bell and the first task. Both are constrained the way the cloud constrains
 * them, because a cutoff of 03:00 is a typo rather than a plan.
 *
 * Her role is not here, and cannot be. The cloud grants UPDATE on named
 * columns only, so a student cannot make herself a support account -- putting
 * the field on screen would queue a change guaranteed to be refused.
 */
public final class SettingsView {

    /** Matches the CHECK constraints in the cloud schema. */
    private static final int MIN_STUDY_HOUR = 12;
    private static final int MAX_SETTLE_MINUTES = 240;

    private final AppContext context;
    private final VBox body = new VBox(16);
    private final Label saved = new Label();

    public SettingsView(AppContext context) {
        this.context = context;
        body.setPadding(Ui.PAGE_PADDING);
        saved.getStyleClass().add("meta");

        body.getChildren().addAll(
                Ui.pageTitle("Settings"),
                profileCard(),
                syncCard(),
                oversightCard(),
                aboutCard());
    }

    public Node root() {
        return Ui.page(body);
    }

    // -----------------------------------------------------------------------

    private Node profileCard() {
        Profile profile = context.profile();

        TextField name = new TextField(profile.fullName());
        name.setPromptText("Your name");

        ComboBox<String> timezone = new ComboBox<>();
        // The full IANA list is nine hundred entries and unusable in a combo.
        // Her current zone plus the host zone covers the real cases: a copy
        // set up correctly, and a copy on a machine in another country.
        List<String> zones = new ArrayList<>();
        zones.add(profile.timezone());
        if (!zones.contains(ZoneId.systemDefault().getId())) {
            zones.add(ZoneId.systemDefault().getId());
        }
        zones.add("UTC");
        timezone.getItems().addAll(zones.stream().distinct().toList());
        timezone.setValue(profile.timezone());
        timezone.setEditable(true);

        Spinner<Integer> studyHour = new Spinner<>(new SpinnerValueFactory
                .IntegerSpinnerValueFactory(MIN_STUDY_HOUR, 23, profile.studyUntil().getHour()));
        studyHour.setPrefWidth(85);
        studyHour.setEditable(true);

        Spinner<Integer> studyMinute = new Spinner<>(new SpinnerValueFactory
                .IntegerSpinnerValueFactory(0, 55, profile.studyUntil().getMinute(), 5));
        studyMinute.setPrefWidth(85);
        studyMinute.setEditable(true);

        Spinner<Integer> settle = new Spinner<>(new SpinnerValueFactory
                .IntegerSpinnerValueFactory(0, MAX_SETTLE_MINUTES, profile.settleMinutes(), 5));
        settle.setPrefWidth(95);
        settle.setEditable(true);

        Button save = new Button("Save");
        save.getStyleClass().add("button-primary");
        save.setOnAction(event -> {
            context.profiles().updateSettings(
                    context.userId(),
                    name.getText().trim(),
                    timezone.getValue(),
                    LocalTime.of(studyHour.getValue(), studyMinute.getValue()),
                    settle.getValue());
            saved.setText("Saved. It goes up on the next sync.");
        });

        return Ui.card(
                Ui.sectionTitle("You"),
                name,
                Ui.row(Ui.detail("Timezone"), Ui.grow(), timezone),
                Ui.row(Ui.detail("Stop working at"), Ui.grow(), studyHour, studyMinute),
                Ui.meta("The planner treats this as a hard cutoff and tells you what will "
                        + "not fit before it, rather than scheduling past midnight."),
                Ui.row(Ui.detail("Settle time after school (minutes)"), Ui.grow(), settle),
                Ui.meta("The gap between the last bell and the first task."),
                Ui.row(Ui.grow(), save),
                saved);
    }

    // -----------------------------------------------------------------------

    private Node syncCard() {
        int waiting = context.outbox().pendingCount();
        List<Intent> refused = context.outbox().rejected();
        Instant lastPulled = context.profiles().lastPulledAt();

        VBox card = Ui.card(
                Ui.sectionTitle("This copy"),
                Ui.detail(waiting == 0
                        ? "Everything has been sent."
                        : waiting + (waiting == 1 ? " change waiting" : " changes waiting")
                                + " to be sent."),
                Ui.meta(lastPulled == null
                        ? "Never synced."
                        : "Last synced " + ago(lastPulled) + "."),
                Ui.meta("Your copy lives at " + context.location().directory() + "."),
                // Said out loud rather than left as a property nobody knows
                // about. The app opens with no password by choice, and the
                // cost of that choice belongs on screen next to where the
                // file is, not only in a source comment.
                Ui.meta("It is not password-protected, so anyone who can use this "
                        + "Windows account can read it."));

        if (!refused.isEmpty()) {
            /*
             * A refusal is shown with its reason, verbatim from the cloud.
             *
             * These are changes she believes she made, and the cloud will
             * never accept them -- usually because a policy said no or the row
             * has since been deleted elsewhere. Retrying is offered because a
             * deleted-then-restored row does happen; discarding is offered
             * because the alternative is a badge that never clears.
             */
            VBox problems = Ui.card("card-danger",
                    Ui.sectionTitle(refused.size() == 1
                            ? "1 change was refused"
                            : refused.size() + " changes were refused"),
                    Ui.detail("The cloud would not accept these. Your local copy still "
                            + "shows them; the next sync will correct it."));

            for (Intent intent : refused) {
                problems.getChildren().add(Ui.row(
                        new VBox(2,
                                new Label(intent.kind().wire() + " on " + intent.entityType()),
                                Ui.meta(intent.lastError())),
                        Ui.grow(),
                        retryButton(intent),
                        discardButton(intent)));
            }
            card.getChildren().add(problems);
        }

        return card;
    }

    private Button retryButton(Intent intent) {
        Button retry = new Button("Try again");
        retry.getStyleClass().add("button-quiet");
        retry.setOnAction(event -> {
            context.outbox().retry(intent.seq());
            retry.setDisable(true);
            retry.setText("Queued");
        });
        return retry;
    }

    private Button discardButton(Intent intent) {
        Button discard = new Button("Discard");
        discard.getStyleClass().add("button-quiet");
        discard.setOnAction(event -> {
            context.outbox().discard(intent.seq());
            discard.setDisable(true);
            discard.setText("Discarded");
        });
        return discard;
    }

    // -----------------------------------------------------------------------

    /**
     * Who can see this record.
     *
     * Access that cannot be refused is a product decision; access that cannot
     * be DISCOVERED would be a different thing entirely, which is why the
     * cloud enforces the disclosure in the schema rather than leaving it to an
     * interface. A support account can read any student without a link, and
     * she is entitled to know that.
     *
     * This copy does not yet carry the answer offline, and says so rather than
     * showing an empty list -- a blank here would read as "nobody", which is
     * the one wrong thing it could say.
     */
    private Node oversightCard() {
        return Ui.card(
                Ui.sectionTitle("Who can see your work"),
                Ui.detail("A support account -- a parent or a tutor -- can read your "
                        + "academic record without needing your approval. They cannot "
                        + "change your homework, your revision, your sessions or this "
                        + "list. The only thing they can edit is your timetable, and only "
                        + "if you have granted that."),
                Ui.meta("The names of the accounts that can see you are not stored in "
                        + "this offline copy yet. Open Settings on the StudyFlow website "
                        + "to see the current list."));
    }

    private Node aboutCard() {
        return Ui.card(
                Ui.sectionTitle("About"),
                Ui.meta("StudyFlow for the desktop. Works with no connection; sends your "
                        + "changes up when there is one."),
                Ui.meta(context.config().configured()
                        ? "Connected to " + context.config().url()
                        : "Not connected to a Supabase project."),
                Ui.meta(context.session().email() == null
                        ? "" : "Signed in as " + context.session().email()));
    }

    // -----------------------------------------------------------------------

    private static String ago(Instant then) {
        long minutes = ChronoUnit.MINUTES.between(then, Instant.now());
        if (minutes < 1) return "just now";
        if (minutes < 60) return minutes + (minutes == 1 ? " minute ago" : " minutes ago");
        long hours = minutes / 60;
        if (hours < 24) return hours + (hours == 1 ? " hour ago" : " hours ago");
        long days = hours / 24;
        return days + (days == 1 ? " day ago" : " days ago");
    }
}
