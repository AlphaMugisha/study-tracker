/*
 * StudyFlow on the desktop.
 *
 * Four modules, layered so the valuable part is testable with no UI and no
 * network:
 *
 *   domain  pure Java. No JavaFX, no JDBC, no HTTP. The planner, the
 *           resolver, the presence wording -- everything ported from
 *           src/lib. Has a parity suite that diffs it against the
 *           TypeScript it came from.
 *   store   the encrypted local copy, and the outbox.
 *   sync    GoTrue and PostgREST. Never JDBC: going over the REST API is
 *           what keeps every RLS policy in supabase/migrations enforced.
 *   ui      JavaFX, and the packaging that puts an icon on the Desktop.
 */
plugins {
    base
}

allprojects {
    group = "flow.study"
    version = "0.1.0"
}

subprojects {
    apply(plugin = "java")

    repositories {
        mavenCentral()
    }

    extensions.configure<JavaPluginExtension> {
        toolchain {
            languageVersion.set(JavaLanguageVersion.of(23))
        }
    }

    dependencies {
        "testImplementation"(platform("org.junit:junit-bom:5.11.4"))
        "testImplementation"("org.junit.jupiter:junit-jupiter")
        "testRuntimeOnly"("org.junit.platform:junit-platform-launcher")
    }

    tasks.withType<JavaCompile>().configureEach {
        options.encoding = "UTF-8"
        /*
         * Everything except dangling-doc-comments.
         *
         * These records have up to fifteen components, and a doc comment
         * beside each one is the only way to read them. javac wants that
         * documentation hoisted into @param tags on the record itself, which
         * puts the description of a field a screen away from the field. The
         * rest of -Xlint is worth keeping and is left on.
         */
        options.compilerArgs.add("-Xlint:all,-dangling-doc-comments")
    }

    tasks.withType<Test>().configureEach {
        useJUnitPlatform()
        testLogging {
            events("passed", "skipped", "failed")
        }
    }
}
