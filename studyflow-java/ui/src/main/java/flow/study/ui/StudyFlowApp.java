package flow.study.ui;

import flow.study.store.StoreLocation;
import javafx.application.Application;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.Label;
import javafx.scene.image.Image;
import javafx.scene.layout.StackPane;
import javafx.stage.Stage;

import java.io.InputStream;
import java.util.Objects;

/**
 * The window.
 *
 * On a computer that has been set up, this opens straight onto Today. There is
 * no prompt of any kind -- the operator chose that over an encrypted copy, and
 * the consequence is recorded in StoreLocation and said out loud in Settings.
 *
 * The only time anything is asked is the very first run, and again if the
 * saved session is ever revoked, because at that point there is genuinely
 * nothing to sync with.
 */
public final class StudyFlowApp extends Application {

    /**
     * Sized for the operator machine, which runs below the lg breakpoint.
     *
     * The layout is single-column-friendly throughout for the same reason: a
     * two-column dashboard that only works at 1440px is a dashboard that never
     * works here.
     */
    private static final int WIDTH = 1040;
    private static final int HEIGHT = 720;
    private static final int MIN_WIDTH = 760;
    private static final int MIN_HEIGHT = 560;

    private AppContext context;
    private MainWindow window;

    public static void main(String[] args) {
        launch(args);
    }

    @Override
    public void start(Stage stage) {
        stage.setTitle("StudyFlow");
        stage.setMinWidth(MIN_WIDTH);
        stage.setMinHeight(MIN_HEIGHT);
        loadIcon(stage);

        Parent first;
        try {
            context = AppContext.open(StoreLocation.standard());
            first = context.signedIn()
                    ? openApp()
                    : new SetupView(context, ready -> stage.getScene().setRoot(openApp())).root();
        } catch (RuntimeException e) {
            // A copy that will not open at all is the one failure with nothing
            // useful behind it, so it says so on screen rather than vanishing
            // with a stack trace into a console nobody is watching.
            first = failure(e);
        }

        stage.setScene(scene(first));
        stage.show();
    }

    private Parent openApp() {
        window = new MainWindow(context);
        Parent root = window.root();
        window.start();
        return root;
    }

    private Scene scene(Parent root) {
        Scene scene = new Scene(root, WIDTH, HEIGHT);
        scene.getStylesheets().add(Objects.requireNonNull(
                StudyFlowApp.class.getResource("theme.css")).toExternalForm());
        return scene;
    }

    private static Parent failure(RuntimeException e) {
        Label label = new Label("StudyFlow could not open your copy.\n\n"
                + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
        label.getStyleClass().add("detail");
        label.setWrapText(true);
        label.setMaxWidth(520);

        StackPane pane = new StackPane(label);
        pane.getStyleClass().add("root");
        pane.setPadding(new javafx.geometry.Insets(40));
        return pane;
    }

    /**
     * The taskbar icon.
     *
     * Missing silently rather than fatally: a build without the icon resource
     * should still run, because an app that refuses to start over a picture is
     * worse than an app with a default picture.
     */
    private static void loadIcon(Stage stage) {
        try (InputStream in = StudyFlowApp.class.getResourceAsStream("icon.png")) {
            if (in != null) stage.getIcons().add(new Image(in));
        } catch (Exception ignored) {
            // See above.
        }
    }

    @Override
    public void stop() {
        if (window != null) window.stop();
        if (context != null) {
            // Closes the database explicitly. H2 is opened with
            // DB_CLOSE_DELAY=-1, so without this the file stays locked until
            // the JVM exits -- which on a force-quit means a stale lock the
            // next launch has to recover from.
            context.close();
        }
    }
}
