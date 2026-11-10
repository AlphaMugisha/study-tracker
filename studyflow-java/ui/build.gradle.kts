/*
 * The window, and the icon on the Desktop.
 *
 * JavaFX is declared with an explicit platform classifier rather than through
 * the openjfx Gradle plugin. One less plugin to break on a Gradle upgrade, and
 * it makes the dependency on a Windows build of JavaFX visible in the file
 * instead of inferred at configuration time.
 */
plugins {
    application
}

val javafxVersion = "23.0.1"
val javafxPlatform = "win"

dependencies {
    implementation(project(":domain"))
    implementation(project(":store"))
    implementation(project(":sync"))

    for (module in listOf("base", "graphics", "controls")) {
        implementation("org.openjfx:javafx-$module:$javafxVersion:$javafxPlatform")
    }
}

application {
    /*
     * Launcher, not StudyFlowApp.
     *
     * A main class that extends Application refuses to start when JavaFX is on
     * the classpath rather than the module path, with an error about missing
     * runtime components that says nothing about the real cause. A separate
     * launcher that merely calls Application.launch sidesteps it, and is also
     * what jpackage wants as an entry point.
     */
    mainClass.set("flow.study.ui.Launcher")
}

/** Everything the app needs to run, in one directory, for jpackage. */
val stageRuntime by tasks.registering(Sync::class) {
    description = "Collects the app jar and every dependency into build/stage."
    from(tasks.named("jar"))
    from(configurations.named("runtimeClasspath"))
    into(layout.buildDirectory.dir("stage"))
}
