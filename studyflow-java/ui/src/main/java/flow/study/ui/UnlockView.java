package flow.study.ui;

import flow.study.store.Passphrase;
import flow.study.store.StoreLocation;
import flow.study.store.WrongPassphraseException;
import flow.study.sync.GoTrueClient;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.PasswordField;
import javafx.scene.control.TextField;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;

import java.time.Instant;
import java.util.function.Consumer;

/**
 * The gate.
 *
 * Two shapes, decided by whether a copy already exists here:
 *
 *   FIRST RUN  needs a network. Her Supabase email and password sign in once,
 *              she chooses a passphrase, and the encrypted copy is created
 *              with the refresh token sealed inside it.
 *
 *   EVERY RUN  needs nothing. The passphrase derives the file key, the copy
 *   AFTER      opens, and the app works whether or not there is a connection.
 *
 * The passphrase is not her Supabase password and is not sent anywhere. That
 * is said on screen, because a second password with no explanation reads as
 * the app being broken.
 */
final class UnlockView {

    /** Short enough to type every evening, long enough to be worth encrypting with. */
    private static final int MIN_PASSPHRASE = 8;

    private final StoreLocation location;
    private final Consumer<AppContext> onUnlocked;
    private final StackPane root = new StackPane();
    private final Label error = new Label();

    UnlockView(StoreLocation location, Consumer<AppContext> onUnlocked) {
        this.location = location;
        this.onUnlocked = onUnlocked;
        root.getStyleClass().add("root");
        root.setPadding(new Insets(40));
        root.getChildren().add(location.initialised() ? unlockForm() : firstRunForm());
    }

    StackPane root() {
        return root;
    }

    // -----------------------------------------------------------------------

    private VBox unlockForm() {
        StoreLocation.Sidecar sidecar = location.readSidecar();

        PasswordField passphrase = new PasswordField();
        passphrase.setPromptText("Your StudyFlow passphrase");

        Button unlock = new Button("Unlock");
        unlock.getStyleClass().add("button-primary");
        unlock.setDefaultButton(true);

        Runnable attempt = () -> {
            clearError();
            char[] typed = passphrase.getText().toCharArray();
            if (typed.length == 0) {
                showError("Enter your passphrase.");
                return;
            }
            try {
                AppContext context = AppContext.open(location, typed, sidecar.salt());
                onUnlocked.accept(context);
            } catch (WrongPassphraseException e) {
                showError("That passphrase does not open this copy. Try again.");
            } catch (RuntimeException e) {
                showError(e.getMessage() == null ? "Could not open your copy." : e.getMessage());
            } finally {
                java.util.Arrays.fill(typed, '\0');
            }
        };

        unlock.setOnAction(event -> attempt.run());
        passphrase.setOnAction(event -> attempt.run());

        VBox card = card(
                title("Welcome back"),
                subtitle(sidecar.email() == null || sidecar.email().isBlank()
                        ? "Unlock your copy to carry on."
                        : "Unlock " + sidecar.email() + " to carry on."),
                passphrase,
                unlock,
                error,
                note("This works with no connection. Anything you change is sent "
                        + "up the next time there is one."));

        Platform.runLater(passphrase::requestFocus);
        return card;
    }

    // -----------------------------------------------------------------------

    private VBox firstRunForm() {
        TextField email = new TextField();
        email.setPromptText("Your StudyFlow email");

        PasswordField password = new PasswordField();
        password.setPromptText("Your StudyFlow password");

        PasswordField passphrase = new PasswordField();
        passphrase.setPromptText("Choose a passphrase for this computer");

        PasswordField again = new PasswordField();
        again.setPromptText("Type that passphrase again");

        Button create = new Button("Set up this computer");
        create.getStyleClass().add("button-primary");
        create.setDefaultButton(true);

        create.setOnAction(event -> {
            clearError();

            if (email.getText().isBlank() || password.getText().isEmpty()) {
                showError("Enter the email and password you use for StudyFlow.");
                return;
            }
            if (passphrase.getText().length() < MIN_PASSPHRASE) {
                showError("Use at least " + MIN_PASSPHRASE + " characters for the passphrase.");
                return;
            }
            if (!passphrase.getText().equals(again.getText())) {
                showError("Those two passphrases are not the same.");
                return;
            }

            create.setDisable(true);
            showNeutral("Signing in and downloading your copy...");
            setUp(email.getText().trim(), password.getText().toCharArray(),
                    passphrase.getText().toCharArray(), create);
        });

        Platform.runLater(email::requestFocus);

        return card(
                title("Set up StudyFlow"),
                subtitle("This happens once, and needs a connection. After it, the app "
                        + "opens and works offline."),
                email,
                password,
                separatorNote("The passphrase below is NOT your StudyFlow password. It "
                        + "stays on this computer, is never sent anywhere, and is what "
                        + "encrypts your copy so a lost laptop is not a lost record."),
                passphrase,
                again,
                create,
                error);
    }

    /**
     * Sign in, create the encrypted copy, and pull it down.
     *
     * Deliberately NOT on a background thread.
     *
     * This runs once, behind a disabled button, with a message on screen
     * saying what is happening -- and the window has nothing else in it to
     * interact with. Moving it off the FX thread would buy a spinner and cost
     * a whole class of ordering bugs around a half-created database file,
     * which is the worst possible thing to get wrong on first run.
     */
    private void setUp(String email, char[] password, char[] passphrase, Button create) {
        String salt = Passphrase.newSalt();
        AppContext context = null;

        try {
            context = AppContext.open(location, passphrase, salt);

            var signedIn = context.session().signIn(email, password);
            context.profiles().saveSession(new flow.study.store.ProfileStore.Session(
                    signedIn.userId(), signedIn.email(), signedIn.refreshToken(),
                    Instant.now()));

            // Only now is the copy real, so only now does the salt get written.
            // A sidecar written before a failed sign-in would make the next
            // launch show an unlock screen for a database with nothing in it.
            location.writeSidecar(new StoreLocation.Sidecar(salt, signedIn.email()));

            AppContext ready = context;
            context.syncInBackground(result -> onUnlocked.accept(ready));
        } catch (GoTrueClient.AuthException e) {
            closeQuietly(context);
            create.setDisable(false);
            showError(e.getMessage());
        } catch (RuntimeException e) {
            closeQuietly(context);
            create.setDisable(false);
            showError(e.getMessage() == null ? "Could not set up this computer." : e.getMessage());
        } finally {
            java.util.Arrays.fill(password, '\0');
            java.util.Arrays.fill(passphrase, '\0');
        }
    }

    private static void closeQuietly(AppContext context) {
        if (context != null) {
            context.close();
        }
    }

    // -----------------------------------------------------------------------

    private VBox card(javafx.scene.Node... children) {
        VBox box = new VBox(14, children);
        box.getStyleClass().add("card");
        box.setMaxWidth(460);
        box.setMaxHeight(javafx.scene.layout.Region.USE_PREF_SIZE);
        StackPane.setAlignment(box, Pos.CENTER);
        return box;
    }

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

    private static Label note(String text) {
        Label label = new Label(text);
        label.getStyleClass().add("meta");
        label.setWrapText(true);
        return label;
    }

    private static Label separatorNote(String text) {
        Label label = note(text);
        label.setPadding(new Insets(8, 0, 0, 0));
        return label;
    }

    private void showError(String message) {
        error.setText(message);
        error.getStyleClass().setAll("detail");
        error.setStyle("-fx-text-fill: #ff6b6b;");
        error.setWrapText(true);
    }

    private void showNeutral(String message) {
        error.setText(message);
        error.getStyleClass().setAll("detail");
        error.setStyle("");
        error.setWrapText(true);
    }

    private void clearError() {
        error.setText("");
        error.setStyle("");
    }
}
