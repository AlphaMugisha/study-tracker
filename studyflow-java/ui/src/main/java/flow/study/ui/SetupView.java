package flow.study.ui;

import flow.study.sync.GoTrueClient;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.PasswordField;
import javafx.scene.control.TextField;
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
 * of any kind -- which is what the operator asked for, having been shown what
 * it costs.
 *
 * It also appears again if the saved session is ever revoked, because at that
 * point there is genuinely nothing to sync with and asking is the only honest
 * thing to do.
 */
final class SetupView {

    private final AppContext context;
    private final Consumer<AppContext> onReady;
    private final StackPane root = new StackPane();
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
        TextField email = new TextField();
        email.setPromptText("Your StudyFlow email");

        PasswordField password = new PasswordField();
        password.setPromptText("Your StudyFlow password");

        Button signIn = new Button("Sign in");
        signIn.getStyleClass().add("button-primary");
        signIn.setDefaultButton(true);

        signIn.setOnAction(event -> {
            if (email.getText().isBlank() || password.getText().isEmpty()) {
                error("Enter the email and password you use for StudyFlow.");
                return;
            }
            signIn.setDisable(true);
            neutral("Signing in and downloading your work...");
            attempt(email.getText().trim(), password.getText().toCharArray(), signIn);
        });

        Platform.runLater(email::requestFocus);

        VBox card = new VBox(14,
                title("Sign in to StudyFlow"),
                subtitle("Just this once, and it needs a connection. After this the app "
                        + "opens straight away and works with no internet at all."),
                email,
                password,
                signIn,
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

    /**
     * Sign in, then pull everything down.
     *
     * Deliberately NOT on a background thread. This runs once, behind a
     * disabled button, with a message on screen saying what is happening, and
     * the window has nothing else in it to touch. Moving it off the FX thread
     * would buy a spinner and cost a class of ordering bugs around a
     * half-created copy -- the worst possible thing to get wrong on first run.
     */
    private void attempt(String email, char[] password, Button signIn) {
        try {
            var session = context.session().signIn(email, password);
            context.profiles().saveSession(new flow.study.store.ProfileStore.Session(
                    session.userId(), session.email(), session.refreshToken(), Instant.now()));

            // Straight through rather than waiting for the first pull: it can
            // take a moment, and staring at a sign-in form that has visibly
            // succeeded is worse than an app that fills in as it arrives.
            // MainWindow runs its own sync on start, so nothing is skipped.
            onReady.accept(context);
        } catch (GoTrueClient.AuthException e) {
            signIn.setDisable(false);
            error(e.getMessage());
        } catch (RuntimeException e) {
            signIn.setDisable(false);
            error(e.getMessage() == null ? "Could not sign in." : e.getMessage());
        } finally {
            java.util.Arrays.fill(password, '\0');
        }
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
