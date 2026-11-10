package flow.study.ui;

import flow.study.store.StoreLocation;
import javafx.application.Application;
import javafx.scene.Scene;
import javafx.scene.image.Image;
import javafx.stage.Stage;

import java.io.InputStream;
import java.util.Objects;

/**
 * The window.
 *
 * Two states and one transition: the gate, then the app. Nothing else switches
 * scenes, because the only thing that can change about this app at runtime is
 * whether the copy is unlocked.
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

    public static void main(String[] args) {
        launch(args);
    }

    @Override
    public void start(Stage stage) {
        StoreLocation location = StoreLocation.standard();

        stage.setTitle("StudyFlow");
        stage.setMinWidth(MIN_WIDTH);
        stage.setMinHeight(MIN_HEIGHT);
        loadIcon(stage);

        UnlockView gate = new UnlockView(location, unlocked -> {
            this.context = unlocked;
            showApp(stage, unlocked);
        });

        stage.setScene(scene(gate.root()));
        stage.show();
    }

    private void showApp(Stage stage, AppContext unlocked) {
        MainWindow window = new MainWindow(unlocked);
        stage.getScene().setRoot(window.root());
        window.start();
    }

    private Scene scene(javafx.scene.Parent root) {
        Scene scene = new Scene(root, WIDTH, HEIGHT);
        scene.getStylesheets().add(Objects.requireNonNull(
                StudyFlowApp.class.getResource("theme.css")).toExternalForm());
        return scene;
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
        if (context != null) {
            // Closes the database explicitly. H2 is opened with
            // DB_CLOSE_DELAY=-1, so without this the file stays locked until
            // the JVM exits -- which on a force-quit means a stale lock the
            // next launch has to recover from.
            context.close();
        }
    }
}
