package flow.study.ui;

import flow.study.sync.GoTrueClient;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.PasswordField;
import javafx.scene.control.ProgressIndicator;
import javafx.scene.control.TextField;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Region;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;

import java.time.Instant;
import java.util.function.Consumer;

/**
 * The one screen she sees once and never again.
 *
 * Signing in needs a network, so this is the only part of the app that does.
 * It happens once; after it, launching goes straight to Today with no prompt
 * of any kind.
 *
 * It also appears again if the saved session is ever revoked, because at that
 * point there is genuinely nothing to sync with and asking is the only honest
 * thing to do.
 */
final class SetupView {

    private final AppContext context;
    private final Consumer<AppContext> onReady;
    private final StackPane root = new StackPane();

    private final TextField email = new TextField();
    private final PasswordField password = new PasswordField();
    private final Button signIn = new Button("Sign in");
    private final Button forgot = new Button("Forgot your password?");
    private final ProgressIndicator spinner = new ProgressIndicator();
    private final Label message = new Label();

    SetupView(AppContext context, Consumer<AppContext> onReady) {
        this.context = context;
        this.onReady = onReady;

        root.getStyleClass().add("root");
        root.setPadding(new Insets(40));
        root.getChildren().add(form());
    }

    StackPane root() {
        return root;
    }

    private VBox form() {
        email.setPromptText("Your StudyFlow email");
        password.setPromptText("Your StudyFlow password");

        signIn.getStyleClass().add("button-primary");
        signIn.setDefaultButton(true);
        signIn.setOnAction(event -> submit());
        password.setOnAction(event -> submit());

        spinner.setPrefSize(16, 16);
        spinner.setMaxSize(16, 16);
        busy(false);

        /*
         * The button keeps its own width, and the message sits on its own
         * line beneath.
         *
         * Both halves of that matter: an HBox will happily shrink a button to
         * fit a long sibling, and "Invalid login credentials" is long enough
         * to squeeze "Sign in" down to an ellipsis -- which is how the one
         * control she needs to press next disappears exactly when something
         * has gone wrong.
         */
        signIn.setMinWidth(Region.USE_PREF_SIZE);

        forgot.getStyleClass().setAll("button", "button-quiet");
        forgot.setOnAction(event -> sendReset());
        forgot.setMinWidth(Region.USE_PREF_SIZE);
        // No site to send her to means a link that goes nowhere. Better to
        // not offer it than to send an email whose button is broken.
        boolean canReset = context.config().canResetPassword();
        forgot.setVisible(canReset);
        forgot.setManaged(canReset);

        HBox action = new HBox(12, signIn, spinner, spacer(), forgot);
        action.setAlignment(Pos.CENTER_LEFT);

        message.setWrapText(true);
        message.setMaxWidth(Double.MAX_VALUE);

        Platform.runLater(email::requestFocus);

        VBox card = new VBox(14,
                title("Sign in to StudyFlow"),
                subtitle("Just this once, and it needs a connection. After this the app "
                        + "opens straight away and works with no internet at all."),
                email,
                password,
                action,
                message,
                note("Your homework, timetable and plan are kept on this computer so "
                        + "they are there when the connection is not. Anything you "
                        + "change is sent up the next time you are online."));

        card.getStyleClass().add("card");
        card.setMaxWidth(460);
        card.setMaxHeight(Region.USE_PREF_SIZE);
        StackPane.setAlignment(card, Pos.CENTER);
        return card;
    }

    private void submit() {
        if (email.getText().isBlank() || password.getText().isEmpty()) {
            error("Enter the email and password you use for StudyFlow.");
            return;
        }

        busy(true);
        neutral("Signing in...");

        String address = email.getText().trim();
        char[] secret = password.getText().toCharArray();

        /*
         * Off the FX thread, always.
         *
         * An earlier version did this inline on the assumption that a disabled
         * button and a message were enough feedback. They are not: the FX
         * thread is the one that repaints, so blocking it freezes the whole
         * window -- the message never appears, the spinner never turns, and a
         * slow connection is indistinguishable from a crash.
         */
        context.runInBackground(
                () -> context.session().signIn(address, secret),
                session -> {
                    java.util.Arrays.fill(secret, '\0');
                    context.profiles().saveSession(new flow.study.store.ProfileStore.Session(
                            session.userId(), session.email(), session.refreshToken(),
                            Instant.now()));

                    // Straight through rather than waiting for the first pull.
                    // MainWindow starts its own sync and shows its progress, so
                    // nothing is skipped and nothing is hidden.
                    onReady.accept(context);
                },
                failure -> {
                    java.util.Arrays.fill(secret, '\0');
                    busy(false);
                    error(describe(failure));
                });
    }

    /**
     * Email a link for choosing a new password.
     *
     * ------------------------------------------------------------------
     * The link opens the WEBSITE, not this app. A desktop app has no address
     * an email can point at, and building a second password form here that
     * had to accept a token out of a browser would be a worse version of a
     * screen the site already has.
     *
     * The answer is the same whether or not the address has an account. That
     * is not vagueness -- this needs no sign-in, so telling somebody "no such
     * account" would let anyone test addresses one at a time. The website's
     * own forgot-password page is worded the same way for the same reason.
     * ------------------------------------------------------------------
     */
    private void sendReset() {
        String address = email.getText().trim();
        if (address.isBlank()) {
            error("Type your email address first, then press this again.");
            email.requestFocus();
            return;
        }

        busy(true);
        neutral("Sending...");

        String redirect = context.config().resetRedirectUrl();
        context.runInBackground(
                () -> {
                    context.session().requestPasswordReset(address, redirect);
                    return null;
                },
                ignored -> {
                    busy(false);
                    neutral("If an account exists for " + address + ", it has just been "
                            + "sent a link. Open it on this computer or your phone -- it "
                            + "opens StudyFlow on the web, where you can choose a new "
                            + "password. Then come back here and sign in with it.");
                },
                failure -> {
                    busy(false);
                    error(describe(failure));
                });
    }

    /** One readable sentence out of whatever went wrong. */
    private static String describe(Exception failure) {
        if (failure instanceof GoTrueClient.AuthException && failure.getMessage() != null) {
            return failure.getMessage();
        }
        return failure.getMessage() == null
                ? "Could not sign in. Check your connection and try again."
                : failure.getMessage();
    }

    /**
     * Lock the form while the request is in flight.
     *
     * The fields go with the button: leaving them editable invites a second
     * attempt against a half-finished first one, and the two would race to
     * write the same session row.
     */
    private void busy(boolean busy) {
        signIn.setDisable(busy);
        forgot.setDisable(busy);
        email.setDisable(busy);
        password.setDisable(busy);
        spinner.setVisible(busy);
        spinner.setManaged(busy);
    }

    /** The gap that pushes the reset link to the far edge of its row. */
    private static Region spacer() {
        Region region = new Region();
        HBox.setHgrow(region, javafx.scene.layout.Priority.ALWAYS);
        return region;
    }

    // -----------------------------------------------------------------------

    private static Label title(String text) {
        Label label = new Label(text);
        label.getStyleClass().add("page-title");
        return label;
    }

    private static Label subtitle(String text) {
        Label label = new Label(text);
        label.getStyleClass().add("detail");
        label.setWrapText(true);
        return label;
    }

    private static Node note(String text) {
        Label label = new Label(text);
        label.getStyleClass().add("meta");
        label.setWrapText(true);
        label.setPadding(new Insets(6, 0, 0, 0));
        return label;
    }

    private void error(String text) {
        message.setText(text);
        message.getStyleClass().setAll("detail");
        message.setStyle("-fx-text-fill: #ff6b6b;");
        message.setWrapText(true);
    }

    private void neutral(String text) {
        message.setText(text);
        message.getStyleClass().setAll("detail");
        message.setStyle("");
        message.setWrapText(true);
    }
}
