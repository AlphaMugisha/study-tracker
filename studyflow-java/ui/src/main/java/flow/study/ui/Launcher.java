package flow.study.ui;

/**
 * The entry point, and not the Application subclass.
 *
 * A main class that extends Application refuses to start when JavaFX is on the
 * classpath rather than the module path, with an error about missing runtime
 * components that says nothing about the real cause. A separate launcher
 * sidesteps it, and is also the entry point jpackage wants.
 */
public final class Launcher {
    private Launcher() {}

    public static void main(String[] args) {
        StudyFlowApp.main(args);
    }
}
